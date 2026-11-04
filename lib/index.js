/**
 * dsh-conversation-files host half.
 *
 * One read-only route, `GET /dsh-conversation-files/generated`, that folds every
 * conversation in this profile into a single list of files the assistant
 * *produced* — the equivalent of a "files I made for you" gallery:
 *
 *   - files written / edited / patched by tools   → kind "write"
 *   - files handed over by `present`-style tools  → kind "present"
 *
 * Read-only touches and user attachments are NOT generated files and are dropped.
 * The log is the single source of truth, so no projection or migration is needed.
 *
 * Live sessions are read from the in-memory store (`sessions.get(id)`); persisted
 * ones are replayed by `sessionQuery.readSession(id)`. Per-session results are
 * cached — live sessions by their seq, persisted ones for a short TTL — so the
 * panel can poll cheaply while still picking up new writes as they happen.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'

export const name = 'dsh-conversation-files'

/**
 * `connection` is declared because the Host/Origin fence reads it; `webServer`
 * for the route. Neither is optional for this plugin's one feature.
 */
export const inject = ['webServer', 'connection']

const ROUTE_PATH = '/dsh-conversation-files/generated'
const THUMB_PATH = '/dsh-conversation-files/thumb'
const TEXT_PATH = '/dsh-conversation-files/text'
const MAX_THUMB_BYTES = 12 * 1024 * 1024
const MAX_TEXT_BYTES = 256 * 1024
const MAX_TEXT_LINES = 40
const MAX_TEXT_LINE_CHARS = 200
const TEXT_EXTS = new Set([
  'md', 'markdown', 'mdx', 'txt', 'text', 'log', 'rst', 'adoc',
  'json', 'jsonc', 'json5', 'jsonl', 'ndjson', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env', 'plist', 'xml',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'swift', 'm', 'mm',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'vue', 'svelte', 'sql', 'lua', 'php', 'r', 'pl', 'ex', 'exs', 'dart', 'scala', 'clj', 'hs', 'zig', 'proto', 'graphql', 'gql',
  'csv', 'tsv', 'diff', 'patch', 'gitignore', 'dockerignore', 'editorconfig',
])

/** Page thumbnails for binary documents, rendered on demand by macOS QuickLook. */
const PREVIEW_PATH = '/dsh-conversation-files/preview'
const PREVIEW_DIR = join(homedir(), '.dsh', 'cache', 'dsh-conversation-files', 'previews')
const PREVIEW_SIZE = '480'
const PREVIEW_TIMEOUT_MS = 20_000
const RAW_PATH = '/dsh-conversation-files/raw'
const OPEN_PATH = '/dsh-conversation-files/open'
const OPEN_WITH_PATH = '/dsh-conversation-files/open-with'
const REVEAL_PATH = '/dsh-conversation-files/reveal'
const TRASH_PATH = '/dsh-conversation-files/trash'
const MAX_RAW_BYTES = 128 * 1024 * 1024
const MAX_FULL_TEXT_BYTES = 2 * 1024 * 1024
const MAX_FULL_TEXT_LINES = 5000
const PREVIEW_CACHE_LIMIT = 256
const PREVIEW_GC_MS = 30 * 24 * 60 * 60_000
const DOC_PREVIEW_EXTS = new Set([
  'pdf', 'doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'pages',
  'ppt', 'pptx', 'pps', 'ppsx', 'key', 'odp',
  'xls', 'xlsx', 'xlsm', 'numbers', 'ods',
  'epub',
])
const execFileAsync = promisify(execFile)
/** path → PNG bytes, or `null` when the system refused to render it. */
const previewCache = new Map()

/** Extensions the panel can render as a real thumbnail. */
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
}

/** File-name classification shown as gallery sections. */
const GROUP_BY_EXT = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.bmp': 'image',
  '.avif': 'image',
  '.ico': 'image',
  '.md': 'doc',
  '.mdx': 'doc',
  '.txt': 'doc',
  '.rtf': 'doc',
  '.pdf': 'doc',
  '.doc': 'doc',
  '.docx': 'doc',
  '.docm': 'doc',
  '.dot': 'doc',
  '.dotx': 'doc',
  '.odt': 'doc',
  '.pages': 'doc',
  '.epub': 'doc',
  '.ppt': 'slides',
  '.pptx': 'slides',
  '.pptm': 'slides',
  '.pps': 'slides',
  '.ppsx': 'slides',
  '.pot': 'slides',
  '.potx': 'slides',
  '.key': 'slides',
  '.odp': 'slides',
  '.xls': 'sheet',
  '.xlsx': 'sheet',
  '.xlsm': 'sheet',
  '.xlsb': 'sheet',
  '.numbers': 'sheet',
  '.ods': 'sheet',
  '.csv': 'sheet',
  '.tsv': 'sheet',
  '.js': 'code',
  '.mjs': 'code',
  '.cjs': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.jsx': 'code',
  '.vue': 'code',
  '.py': 'code',
  '.rs': 'code',
  '.go': 'code',
  '.java': 'code',
  '.kt': 'code',
  '.c': 'code',
  '.h': 'code',
  '.cc': 'code',
  '.cpp': 'code',
  '.hpp': 'code',
  '.cs': 'code',
  '.swift': 'code',
  '.m': 'code',
  '.mm': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.ps1': 'code',
  '.lua': 'code',
  '.css': 'code',
  '.scss': 'code',
  '.less': 'code',
  '.html': 'code',
  '.htm': 'code',
  '.json': 'config',
  '.jsonc': 'config',
  '.json5': 'config',
  '.yaml': 'config',
  '.yml': 'config',
  '.toml': 'config',
  '.ini': 'config',
  '.cfg': 'config',
  '.conf': 'config',
  '.env': 'config',
  '.gitignore': 'config',
  '.lock': 'config',
  '.xml': 'data',
  '.sql': 'data',
  '.db': 'data',
  '.sqlite': 'data',
  '.parquet': 'data',
  '.zip': 'archive',
  '.tar': 'archive',
  '.gz': 'archive',
  '.tgz': 'archive',
  '.rar': 'archive',
  '.7z': 'archive',
  '.mp3': 'media',
  '.wav': 'media',
  '.flac': 'media',
  '.m4a': 'media',
  '.mp4': 'media',
  '.mov': 'media',
  '.webm': 'media',
  '.mkv': 'media',
  '.ttf': 'other',
  '.otf': 'other',
  '.woff': 'other',
  '.woff2': 'other',
}

/** Classify a file name into a gallery section. */
function groupOf(name) {
  const lower = String(name).toLowerCase()
  // dotfiles such as `.gitignore` have no stem-looking extension
  const dot = lower.lastIndexOf('.')
  const ext = dot <= 0 ? '' : lower.slice(dot)
  return GROUP_BY_EXT[ext] ?? 'other'
}
const MAX_FILES = 2000
const MAX_SESSIONS = 200
const MAX_STAT = 400
const MAX_SESSIONS_PER_FILE = 6
const PERSISTED_TTL_MS = 60_000
const CACHE_LIMIT = 512
/** A snapshot younger than this is served without any rescan. */
const SNAPSHOT_TTL_MS = 10 * 60_000
/** A snapshot younger than this is served first, then refreshed in the background. */
const SNAPSHOT_MAX_STALE_MS = 24 * 60 * 60_000
/** Persisted snapshot so a fresh process answers instantly. */
const SNAPSHOT_PATH = join(homedir(), '.dsh', 'cache', 'dsh-conversation-files', 'generated.json')

/** Tool names whose arguments name a file the tool wrote to. */
const WRITE_TOOLS = new Set([
  'write',
  'write_file',
  'edit',
  'edit_file',
  'multi_edit',
  'apply_patch',
  'notebook_edit',
  'str_replace',
  'str_replace_editor',
  'create_file',
  'delete_file',
  'move_file',
])

/** Tool names that hand files over to the user. */
const PRESENT_TOOLS = new Set(['present', 'deliver', 'deliverables'])

/** Strongest first: a written-then-presented file is a written file. */
const KIND_ORDER = ['write', 'present']

/**
 * Read a cordis service without throwing.
 *
 * `ctx.get(key)` is the safe accessor: it returns undefined for an unregistered
 * service. Direct property access throws when the plugin did not inject that
 * service, so it is only the second attempt.
 */
function serviceOf(ctx, key) {
  try {
    if (typeof ctx.get === 'function') {
      const service = ctx.get(key)
      if (service !== undefined) return service
    }
  } catch {
    /* fall through to property access */
  }
  try {
    return Reflect.get(ctx, key)
  } catch {
    return undefined
  }
}

/** JSON response; the list is a live fact, so never cache it. */
function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', String(body.length))
  res.end(body)
}

/** Map a wire tool name onto the kind of file it produced, if any. */
function toolKind(toolName) {
  if (typeof toolName !== 'string' || toolName === '') return undefined
  if (PRESENT_TOOLS.has(toolName)) return 'present'
  if (WRITE_TOOLS.has(toolName)) return 'write'
  const lower = toolName.toLowerCase()
  if (/(^|[_\-])present([_\-]|$)/.test(lower)) return 'present'
  if (/(^|[_\-])(write|edit|patch)([_\-]|$)/.test(lower)) return 'write'
  return undefined
}

const PATH_KEYS = [
  'path',
  'file_path',
  'filePath',
  'notebook_path',
  'notebookPath',
  'target_file',
  'target',
  'filename',
  'file_name',
  'file',
]

const PATH_LIST_KEYS = ['files', 'paths', 'file_paths']

/**
 * Collect candidate paths out of one tool call's JSON arguments.
 *
 * Arguments are plain JSON, so this stays schema-free: known path-ish keys first,
 * then `present`-style `files[].path` arrays, then `*** Update File:` headers from
 * a unified diff body.
 */
function pathsInArguments(args) {
  const out = []
  if (args === null || typeof args !== 'object') return out

  const push = (value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (trimmed === '') return
    out.push(trimmed)
  }

  for (const key of PATH_KEYS) push(args[key])

  for (const key of PATH_LIST_KEYS) {
    const list = args[key]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (typeof item === 'string') {
        push(item)
        continue
      }
      if (item !== null && typeof item === 'object') {
        push(item.path)
        push(item.file_path)
        push(item.filePath)
      }
    }
  }

  const patchText =
    typeof args.patch === 'string'
      ? args.patch
      : typeof args.diff === 'string'
        ? args.diff
        : typeof args.patch_text === 'string'
          ? args.patch_text
          : ''
  if (patchText !== '') {
    const header = /^\*\*\* (?:Update|Add|Delete|Move) File: (.+)$/gm
    let match
    while ((match = header.exec(patchText)) !== null) push(match[1])
  }

  return out
}

/** Reject values that are clearly not file paths (tokens, flags, booleans). */
function looksLikePath(value) {
  if (value === '' || value.length > 4096) return false
  if (/[\r\n\t]/.test(value)) return false
  if (/^(true|false|null|undefined|0|-?\d+(\.\d+)?)$/.test(value)) return false
  if (value.startsWith('-')) return false
  return true
}

/**
 * Fold a raw event list into de-duplicated generated-file entries keyed by
 * absolute path. Only tool calls matter: results only describe the object a tool
 * operated on, and user messages only carry their own attachments.
 */
function collectGeneratedFiles(events, cwd) {
  const files = new Map()

  for (const event of events) {
    if (event === null || typeof event !== 'object' || event.type !== 'tool/call') continue
    const data = event.data
    if (data === null || typeof data !== 'object') continue
    const kind = toolKind(data.name)
    if (kind === undefined) continue
    let args = {}
    if (typeof data.arguments === 'string' && data.arguments !== '') {
      try {
        args = JSON.parse(data.arguments)
      } catch {
        continue
      }
    } else if (data.arguments !== null && typeof data.arguments === 'object') {
      args = data.arguments
    }
    for (const rawPath of pathsInArguments(args)) {
      const value = String(rawPath).trim()
      if (!looksLikePath(value)) continue
      let absolute
      if (value.startsWith('file://')) {
        absolute = value
      } else if (isAbsolute(value)) {
        absolute = value
      } else if (typeof cwd === 'string' && cwd !== '') {
        absolute = resolve(cwd, value)
      } else {
        absolute = value
      }

      // `/tmp` and `/private/tmp` are the same file on macOS; canonicalise real
      // paths so one file stays one row.
      if (isAbsolute(absolute)) {
        try {
          absolute = realpathSync(absolute)
        } catch {
          /* path does not exist (yet); keep the reported spelling */
        }
      }

      let entry = files.get(absolute)
      if (entry === undefined) {
        entry = {
          path: absolute,
          name: basename(absolute),
          kinds: [],
          count: 0,
          firstTime: event.time ?? 0,
          lastTime: event.time ?? 0,
        }
        files.set(absolute, entry)
      }
      if (!entry.kinds.includes(kind)) entry.kinds.push(kind)
      entry.count += 1
      if ((event.time ?? 0) < entry.firstTime) entry.firstTime = event.time ?? 0
      if ((event.time ?? 0) > entry.lastTime) entry.lastTime = event.time ?? 0
    }
  }

  const list = []
  for (const entry of files.values()) {
    let kind = 'other'
    for (const candidate of KIND_ORDER) {
      if (entry.kinds.includes(candidate)) {
        kind = candidate
        break
      }
    }
    list.push({ ...entry, kind })
  }
  return list
}

/** Fill in existence/size for real paths. Best effort — a missing file is a fact. */
async function annotateExistence(files) {
  const targets = files.filter((file) => isAbsolute(file.path)).slice(0, MAX_STAT)
  await Promise.all(
    targets.map(async (file) => {
      try {
        const info = await stat(file.path)
        file.exists = info.isFile()
        if (info.isFile()) {
          file.size = info.size
          file.mtime = info.mtimeMs
        }
      } catch {
        file.exists = false
      }
    }),
  )
  return files
}

/** Flatten a candidate title; injected context blocks are never titles. */
function cleanTitle(text) {
  if (typeof text !== 'string') return undefined
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return undefined
  if (flat.startsWith('<')) return undefined
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
}

/** First user text in the log — a readable stand-in when a title is missing. */
function firstUserText(events) {
  for (const event of events) {
    if (event === null || typeof event !== 'object' || event.type !== 'user/message') continue
    const message =
      event.data !== null && typeof event.data === 'object' && event.data.message !== undefined ? event.data.message : event.data
    const content = message !== null && typeof message === 'object' ? message.content : undefined
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
        const text = cleanTitle(block.text)
        if (text !== undefined) return text
      }
    }
  }
  return undefined
}

/** Title event carried by the log, if the session set one. */
function titleFromEvents(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === null || typeof event !== 'object') continue
    if (event.type !== 'session/title' && event.type !== 'title/set') continue
    const data = event.data
    const title = data !== null && typeof data === 'object' ? data.title : undefined
    const cleaned = cleanTitle(title)
    if (cleaned !== undefined) return cleaned
  }
  return undefined
}

/** The live session object, when the conversation is still open. */
function liveSession(ctx, sessionId) {
  const sessions = serviceOf(ctx, 'sessions')
  if (sessions === undefined || typeof sessions.get !== 'function') return undefined
  try {
    return sessions.get(sessionId)
  } catch {
    return undefined
  }
}

/** Every session record this profile knows about, newest first. */
async function listSessionRecords(ctx) {
  const query = serviceOf(ctx, 'sessionQuery')
  if (query !== undefined && typeof query.listSessions === 'function') {
    try {
      const records = await query.listSessions()
      if (Array.isArray(records)) return records
    } catch {
      /* fall back to the in-memory store */
    }
  }
  const sessions = serviceOf(ctx, 'sessions')
  if (sessions !== undefined && typeof sessions.list === 'function') {
    try {
      return sessions.list().map((session) => ({ header: session.header, live: true, persisted: true }))
    } catch {
      /* ignore */
    }
  }
  return []
}

/** Real titles for a batch of sessions, one observation pass. */
async function readTitles(ctx, sessionIds) {
  const titles = new Map()
  const query = serviceOf(ctx, 'sessionQuery')
  if (query === undefined || typeof query.readTitleSnapshots !== 'function' || sessionIds.length === 0) return titles
  try {
    const results = await query.readTitleSnapshots(sessionIds)
    for (const item of results) {
      if (item === null || typeof item !== 'object' || item.status !== 'fulfilled') continue
      const title = item.value !== null && typeof item.value === 'object' && item.value.title !== undefined ? item.value.title : undefined
      const text = title !== null && typeof title === 'object' && typeof title.title === 'string' ? cleanTitle(title.title) : undefined
      if (text !== undefined) titles.set(item.sessionId, text)
    }
  } catch {
    /* titles are decoration */
  }
  return titles
}

/** Per-session cache: live sessions keyed by seq, persisted by TTL. */
const sessionCache = new Map()

function rememberSession(id, value) {
  sessionCache.set(id, value)
  while (sessionCache.size > CACHE_LIMIT) {
    const oldest = sessionCache.keys().next()
    if (oldest.done === true) break
    sessionCache.delete(oldest.value)
  }
}

/** Read one session's events (live first) and fold it into generated files. */
async function sessionGenerated(ctx, record, title) {
  const id = record.header.id
  const cached = sessionCache.get(id)
  const live = liveSession(ctx, id)
  const liveSeq = live !== undefined && typeof live.seq === 'number' ? live.seq : undefined

  if (cached !== undefined && cached.title === title) {
    if (liveSeq !== undefined) {
      if (cached.liveSeq === liveSeq) return cached
    } else if (cached.liveSeq === undefined && Date.now() - cached.builtAt < PERSISTED_TTL_MS) {
      return cached
    }
  }

  let header = record.header
  let events = []
  if (live !== undefined && typeof live.snapshotEvents === 'function') {
    events = live.snapshotEvents()
    if (live.header !== undefined) header = live.header
  } else {
    const query = serviceOf(ctx, 'sessionQuery')
    if (query === undefined || typeof query.readSession !== 'function') return cached
    try {
      const snapshot = await query.readSession(id)
      events = Array.isArray(snapshot.events) ? snapshot.events : []
      if (snapshot.session !== undefined) header = snapshot.session
    } catch {
      return cached
    }
  }

  const files = collectGeneratedFiles(events, header !== undefined && typeof header.cwd === 'string' ? header.cwd : undefined)
  const value = {
    id,
    title: title ?? titleFromEvents(events) ?? firstUserText(events) ?? null,
    cwd: header !== undefined && typeof header.cwd === 'string' ? header.cwd : null,
    liveSeq,
    builtAt: Date.now(),
    files,
  }
  if (files.length > 0) rememberSession(id, value)
  return value
}

/** Fold every conversation into one de-duplicated, newest-first file list. */
async function buildGenerated(ctx) {
  const records = await listSessionRecords(ctx)
  const selected = []
  for (const record of records) {
    const header = record !== null && typeof record === 'object' ? record.header : undefined
    if (header === undefined || typeof header.id !== 'string') continue
    if (header.origin === 'subagent') continue
    selected.push(record)
    if (selected.length >= MAX_SESSIONS) break
  }

  const titles = await readTitles(
    ctx,
    selected.map((record) => record.header.id),
  )
  const perSession = await Promise.all(
    selected.map(async (record) => {
      const id = record.header.id
      const value = await sessionGenerated(ctx, record, titles.get(id) ?? null)
      return value === undefined ? undefined : value
    }),
  )

  const byPath = new Map()
  const sessionSummaries = []
  for (const session of perSession) {
    if (session === undefined || session.files.length === 0) continue
    let lastTime = 0
    for (const file of session.files) {
      let entry = byPath.get(file.path)
      if (entry === undefined) {
        entry = {
          path: file.path,
          name: file.name,
          kinds: [],
          kind: 'other',
          count: 0,
          firstTime: file.firstTime,
          lastTime: file.lastTime,
          sessions: [],
        }
        byPath.set(file.path, entry)
      }
      for (const kind of file.kinds) if (!entry.kinds.includes(kind)) entry.kinds.push(kind)
      entry.count += file.count
      if (file.firstTime < entry.firstTime) entry.firstTime = file.firstTime
      if (file.lastTime > entry.lastTime) entry.lastTime = file.lastTime
      if (entry.sessions.length < MAX_SESSIONS_PER_FILE && !entry.sessions.some((item) => item.id === session.id)) {
        entry.sessions.push({ id: session.id, title: session.title, time: file.lastTime })
      }
      if (file.lastTime > lastTime) lastTime = file.lastTime
    }
    sessionSummaries.push({
      id: session.id,
      title: session.title,
      fileCount: session.files.length,
      lastTime,
    })
  }

  const files = []
  for (const entry of byPath.values()) {
    let kind = 'other'
    for (const candidate of KIND_ORDER) {
      if (entry.kinds.includes(candidate)) {
        kind = candidate
        break
      }
    }
    files.push({ ...entry, kind, ext: extname(entry.name).toLowerCase(), group: groupOf(entry.name) })
  }
  files.sort((left, right) => right.lastTime - left.lastTime)
  await annotateExistence(files)

  const counts = { all: files.length, write: 0, present: 0 }
  for (const file of files) {
    for (const kind of file.kinds) {
      if (counts[kind] !== undefined) counts[kind] += 1
    }
  }

  sessionSummaries.sort((left, right) => right.lastTime - left.lastTime)
  return {
    files,
    counts,
    sessions: sessionSummaries,
    scannedSessions: selected.length,
  }
}

/** The last successful scan: thumbnails are only served for paths in it. */
let snapshot = null
let refreshPromise = null

function payloadOf(built) {
  return {
    total: built.files.length,
    counts: built.counts,
    sessionCount: built.sessions.length,
    scannedSessions: built.scannedSessions,
    sessions: built.sessions,
    files: built.files,
  }
}

function loadSnapshot() {
  try {
    const parsed = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && Number.isFinite(parsed.builtAt) && parsed.payload !== null && typeof parsed.payload === 'object' && Array.isArray(parsed.payload.files)) {
      return { builtAt: parsed.builtAt, payload: parsed.payload }
    }
  } catch {
    /* no usable snapshot yet */
  }
  return null
}

function saveSnapshot(value) {
  try {
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true })
    writeFileSync(SNAPSHOT_PATH, JSON.stringify({ version: 1, builtAt: value.builtAt, payload: value.payload }))
  } catch {
    /* persistence is best effort */
  }
}

function currentSnapshot() {
  if (snapshot === null) snapshot = loadSnapshot()
  return snapshot
}

/** Rebuild the snapshot once at a time; used for background refreshes. */
function refreshInBackground(ctx) {
  if (refreshPromise !== null) return refreshPromise
  refreshPromise = (async () => {
    try {
      const built = await buildGenerated(ctx)
      const value = { builtAt: Date.now(), payload: payloadOf(built) }
      snapshot = value
      saveSnapshot(value)
    } catch {
      /* keep the previous snapshot */
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

function sendList(res, built, generatedAt, limit, extra) {
  const files = built.payload.files.slice(0, limit)
  sendJson(res, 200, {
    ok: true,
    generatedAt,
    total: built.payload.total,
    counts: built.payload.counts,
    sessionCount: built.payload.sessionCount,
    scannedSessions: built.payload.scannedSessions,
    sessions: built.payload.sessions,
    files,
    shown: files.length,
    ...extra,
  })
}

/** Serve one generated image as a thumbnail; only paths from a fresh scan. */
async function handleThumb(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = (url.searchParams.get('path') ?? '').trim()
  if (target === '' || !isAbsolute(target)) {
    sendJson(res, 400, { ok: false, error: 'absolute path required' })
    return
  }
  const mime = IMAGE_MIME[extname(target).toLowerCase()]
  if (mime === undefined) {
    sendJson(res, 400, { ok: false, error: 'not an image' })
    return
  }
  let built = currentSnapshot()
  if (built === null) {
    await refreshInBackground(ctx)
    built = currentSnapshot()
  }
  if (built === null || !built.payload.files.some((file) => file.path === target)) {
    sendJson(res, 404, { ok: false, error: 'not a generated image' })
    return
  }
  let info
  try {
    info = await stat(target)
  } catch {
    sendJson(res, 404, { ok: false, error: 'missing' })
    return
  }
  if (!info.isFile() || info.size <= 0 || info.size > MAX_THUMB_BYTES) {
    sendJson(res, 413, { ok: false, error: 'unsupported size' })
    return
  }
  try {
    const bytes = await readFile(target)
    res.writeHead(200, {
      'content-type': mime,
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=120',
    })
    res.end(bytes)
  } catch {
    sendJson(res, 500, { ok: false, error: 'read failed' })
  }
}

/** Byte-stream types the panel can show in its inline viewer. */
const RAW_MIME = {
  ...IMAGE_MIME,
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
}

/** Full bytes of a generated file, for the inline image / PDF / media viewer. */
async function handleRaw(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = (url.searchParams.get('path') ?? '').trim()
  if (target === '' || !isAbsolute(target)) {
    sendJson(res, 400, { ok: false, error: 'absolute path required' })
    return
  }
  const mime = RAW_MIME[extname(target).toLowerCase()]
  if (mime === undefined) {
    sendJson(res, 400, { ok: false, error: 'not a viewable type' })
    return
  }
  const built = currentSnapshot()
  if (built === null || !built.payload.files.some((file) => file.path === target)) {
    sendJson(res, 404, { ok: false, error: 'not a generated file' })
    return
  }
  let info
  try {
    info = await stat(target)
  } catch {
    sendJson(res, 404, { ok: false, error: 'missing' })
    return
  }
  if (!info.isFile() || info.size <= 0 || info.size > MAX_RAW_BYTES) {
    sendJson(res, 413, { ok: false, error: 'unsupported size' })
    return
  }
  try {
    const bytes = await readFile(target)
    res.writeHead(200, {
      'content-type': mime,
      'content-length': String(bytes.length),
      'cache-control': 'private, max-age=300',
    })
    res.end(bytes)
  } catch {
    sendJson(res, 500, { ok: false, error: 'read failed' })
  }
}

/** Hand one generated file to the desktop so the OS opens it with its default app. */
async function handleOpen(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = (url.searchParams.get('path') ?? '').trim()
  if (target === '' || !isAbsolute(target)) {
    sendJson(res, 400, { ok: false, error: 'absolute path required' })
    return
  }
  const built = currentSnapshot()
  if (built === null || !built.payload.files.some((file) => file.path === target)) {
    sendJson(res, 404, { ok: false, error: 'not a generated file' })
    return
  }
  let info
  try {
    info = await stat(target)
  } catch {
    sendJson(res, 404, { ok: false, error: 'missing' })
    return
  }
  if (!info.isFile()) {
    sendJson(res, 413, { ok: false, error: 'not a file' })
    return
  }
  try {
    await execFileAsync('open', [target], { timeout: 10_000 })
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
  }
}

/** Let the desktop ask which application should open a generated file. */
async function handleOpenWith(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = (url.searchParams.get('path') ?? '').trim()
  if (target === '' || !isAbsolute(target)) {
    sendJson(res, 400, { ok: false, error: 'absolute path required' })
    return
  }
  const built = currentSnapshot()
  if (built === null || !built.payload.files.some((file) => file.path === target)) {
    sendJson(res, 404, { ok: false, error: 'not a generated file' })
    return
  }
  let info
  try {
    info = await stat(target)
  } catch {
    sendJson(res, 404, { ok: false, error: 'missing' })
    return
  }
  if (!info.isFile()) {
    sendJson(res, 413, { ok: false, error: 'not a file' })
    return
  }
  const script = [
    'on run argv',
    'set target to POSIX file (item 1 of argv)',
    'tell application "Finder" to open target using (choose application)',
    'end run',
  ].join('\n')
  try {
    await execFileAsync('osascript', ['-e', script, '--', target], { timeout: 120_000 })
    sendJson(res, 200, { ok: true, opened: 'chosen' })
  } catch {
    // The chooser needs desktop automation rights; revealing the file still lets the user pick an app.
    try {
      await execFileAsync('open', ['-R', target], { timeout: 10_000 })
      sendJson(res, 200, { ok: true, opened: 'reveal' })
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
    }
  }
}

/** Show a generated file in Finder. */
async function handleReveal(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = (url.searchParams.get('path') ?? '').trim()
  if (target === '' || !isAbsolute(target)) {
    sendJson(res, 400, { ok: false, error: 'absolute path required' })
    return
  }
  const built = currentSnapshot()
  if (built === null || !built.payload.files.some((file) => file.path === target)) {
    sendJson(res, 404, { ok: false, error: 'not a generated file' })
    return
  }
  try {
    await execFileAsync('open', ['-R', target], { timeout: 10_000 })
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
  }
}

/** Move a generated file into the user's Trash so it stays recoverable. */
async function handleTrash(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = (url.searchParams.get('path') ?? '').trim()
  if (target === '' || !isAbsolute(target)) {
    sendJson(res, 400, { ok: false, error: 'absolute path required' })
    return
  }
  const built = currentSnapshot()
  if (built === null || !built.payload.files.some((file) => file.path === target)) {
    sendJson(res, 404, { ok: false, error: 'not a generated file' })
    return
  }
  let info
  try {
    info = await stat(target)
  } catch {
    sendJson(res, 404, { ok: false, error: 'missing' })
    return
  }
  if (!info.isFile()) {
    sendJson(res, 413, { ok: false, error: 'not a file' })
    return
  }
  const trashDir = join(homedir(), '.Trash')
  try {
    mkdirSync(trashDir, { recursive: true })
  } catch {
    /* the folder normally exists */
  }
  const base = basename(target)
  let slot = join(trashDir, base)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await stat(slot)
    } catch {
      break
    }
    slot = join(trashDir, `${base} (${Date.now()}-${attempt + 1})`)
  }
  try {
    await rename(target, slot)
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
    return
  }
  if (snapshot !== null && Array.isArray(snapshot.payload.files)) {
    for (let index = 0; index < snapshot.payload.files.length; index += 1) {
      if (snapshot.payload.files[index].path === target) {
        snapshot.payload.files[index] = { ...snapshot.payload.files[index], exists: false }
      }
    }
    try {
      saveSnapshot(snapshot)
    } catch {
      /* the snapshot file is only a cache */
    }
  }
  void refreshInBackground(ctx)
  sendJson(res, 200, { ok: true, trashed: slot })
}

/** First lines of a generated text file, for the gallery's code/document thumbnails. */
async function handleText(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = (url.searchParams.get('path') ?? '').trim()
  if (target === '' || !isAbsolute(target)) {
    sendJson(res, 400, { ok: false, error: 'absolute path required' })
    return
  }
  const ext = extname(target).toLowerCase().replace(/^\./, '')
  if (!TEXT_EXTS.has(ext)) {
    sendJson(res, 400, { ok: false, error: 'not a text file' })
    return
  }
  let built = currentSnapshot()
  if (built === null) {
    sendJson(res, 404, { ok: false, error: 'no snapshot yet' })
    return
  }
  if (!built.payload.files.some((file) => file.path === target)) {
    sendJson(res, 404, { ok: false, error: 'not a generated file' })
    return
  }
  let info
  try {
    info = await stat(target)
  } catch {
    sendJson(res, 404, { ok: false, error: 'missing' })
    return
  }
  const full = url.searchParams.get('full') === '1'
  const byteLimit = full ? MAX_FULL_TEXT_BYTES : MAX_TEXT_BYTES
  const lineLimit = full ? MAX_FULL_TEXT_LINES : MAX_TEXT_LINES
  if (!info.isFile() || info.size <= 0 || info.size > byteLimit) {
    sendJson(res, 413, { ok: false, error: 'unsupported size' })
    return
  }
  let text
  try {
    text = await readFile(target, 'utf8')
  } catch {
    sendJson(res, 500, { ok: false, error: 'read failed' })
    return
  }
  if (text.indexOf('\u0000') !== -1) {
    sendJson(res, 415, { ok: false, error: 'binary file' })
    return
  }
  const allLines = text.split(/\r?\n/)
  const lines = allLines
    .slice(0, lineLimit)
    .map((line) => (line.length > MAX_TEXT_LINE_CHARS ? `${line.slice(0, MAX_TEXT_LINE_CHARS)}…` : line))
  sendJson(res, 200, {
    ok: true,
    ext,
    lines,
    totalLines: allLines.length,
    truncated: allLines.length > lineLimit,
  })
}

function rememberPreview(target, value) {
  previewCache.set(target, value)
  if (previewCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewCache.keys().next()
    if (oldest.done !== true) previewCache.delete(oldest.value)
  }
}

/** Drop thumbnails whose source has not been touched for a month. */
async function prunePreviewCache() {
  let names
  try {
    names = await readdir(PREVIEW_DIR)
  } catch {
    return
  }
  const cutoff = Date.now() - PREVIEW_GC_MS
  for (const entry of names) {
    if (!entry.endsWith('.png') && !entry.endsWith('.json')) continue
    const full = join(PREVIEW_DIR, entry)
    try {
      const info = await stat(full)
      if (info.mtimeMs < cutoff) await rm(full, { force: true })
    } catch {
      /* skip unreadable entries */
    }
  }
}

function sendPng(res, bytes) {
  res.writeHead(200, {
    'content-type': 'image/png',
    'content-length': String(bytes.length),
    'cache-control': 'private, max-age=3600',
  })
  res.end(bytes)
}

/** Ask QuickLook for a page thumbnail of one document. */
async function renderDocPreview(target, size) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-cf-preview-'))
  try {
    await execFileAsync('qlmanage', ['-t', '-s', size, '-o', dir, target], {
      timeout: PREVIEW_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    })
    const names = await readdir(dir)
    const png = names.find((entry) => entry.toLowerCase().endsWith('.png'))
    if (png === undefined) return null
    return await readFile(join(dir, png))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Serve a page thumbnail for a generated PDF / Office / iWork document. */
async function handlePreview(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = (url.searchParams.get('path') ?? '').trim()
  if (target === '' || !isAbsolute(target)) {
    sendJson(res, 400, { ok: false, error: 'absolute path required' })
    return
  }
  const ext = extname(target).toLowerCase().replace(/^\./, '')
  if (!DOC_PREVIEW_EXTS.has(ext)) {
    sendJson(res, 400, { ok: false, error: 'not a document type' })
    return
  }
  const built = currentSnapshot()
  if (built === null) {
    sendJson(res, 404, { ok: false, error: 'no snapshot yet' })
    return
  }
  if (!built.payload.files.some((file) => file.path === target)) {
    sendJson(res, 404, { ok: false, error: 'not a generated file' })
    return
  }
  const cached = previewCache.get(target)
  if (cached !== undefined) {
    if (cached === null) sendJson(res, 404, { ok: false, error: 'unavailable' })
    else sendPng(res, cached)
    return
  }
  let info
  try {
    info = await stat(target)
  } catch {
    sendJson(res, 404, { ok: false, error: 'missing' })
    return
  }
  if (!info.isFile() || info.size <= 0) {
    sendJson(res, 413, { ok: false, error: 'unsupported size' })
    return
  }
  const requestedSize = Number(url.searchParams.get('size'))
  const size = Number.isFinite(requestedSize) && requestedSize >= 200 && requestedSize <= 1600 ? String(Math.round(requestedSize)) : PREVIEW_SIZE
  mkdirSync(PREVIEW_DIR, { recursive: true })
  // One PNG per source path and size: a rewrite replaces it instead of piling up stale files.
  const key = createHash('sha1').update(`${target}@${size}`).digest('hex').slice(0, 24)
  const diskPath = join(PREVIEW_DIR, `${key}.png`)
  const metaPath = join(PREVIEW_DIR, `${key}.json`)
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    if (meta !== null && typeof meta === 'object' && meta.mtimeMs === info.mtimeMs && meta.size === info.size) {
      const onDisk = await readFile(diskPath)
      rememberPreview(target, onDisk)
      sendPng(res, onDisk)
      return
    }
  } catch {
    /* missing or stale entry: render below */
  }
  let png = null
  try {
    png = await renderDocPreview(target, size)
  } catch {
    png = null
  }
  if (png === null) {
    rememberPreview(target, null)
    sendJson(res, 404, { ok: false, error: 'render failed' })
    return
  }
  rememberPreview(target, png)
  try {
    writeFileSync(diskPath, png)
    writeFileSync(metaPath, JSON.stringify({ mtimeMs: info.mtimeMs, size: info.size }))
  } catch {
    /* cache write is best effort */
  }
  sendPng(res, png)
}

/** Most recently generated files across every conversation. */
async function handleGenerated(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let limit = Number(url.searchParams.get('limit'))
  if (!Number.isFinite(limit) || limit <= 0) limit = 300
  if (limit > MAX_FILES) limit = MAX_FILES

  const cached = currentSnapshot()
  const age = cached === null ? Infinity : Date.now() - cached.builtAt

  if (cached !== null && age < SNAPSHOT_TTL_MS) {
    sendList(res, cached, cached.builtAt, limit, { cached: true })
    return
  }

  if (cached !== null && age < SNAPSHOT_MAX_STALE_MS) {
    sendList(res, cached, cached.builtAt, limit, { cached: true, stale: true })
    void refreshInBackground(ctx)
    return
  }

  try {
    const built = await buildGenerated(ctx)
    const value = { builtAt: Date.now(), payload: payloadOf(built) }
    snapshot = value
    saveSnapshot(value)
    sendList(res, value, value.builtAt, limit, {})
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
  }
}

export function apply(ctx) {
  /** Host/Origin fence: the webserver can be bound to a LAN address. */
  function rejected(req, res) {
    const connection = serviceOf(ctx, 'connection')
    if (connection === undefined || typeof connection.requestRejection !== 'function') return false
    const rejection = connection.requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  ctx.inject(['webServer'], (webCtx) => {
    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: ROUTE_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'GET, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, error: 'use GET' })
                return
              }
              handleGenerated(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.stack ?? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: generated route',
    )

    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: TEXT_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'GET, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, error: 'use GET' })
                return
              }
              handleText(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: text route',
    )

    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: PREVIEW_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'GET, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, error: 'use GET' })
                return
              }
              handlePreview(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: document preview route',
    )

    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: RAW_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'GET, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, error: 'use GET' })
                return
              }
              handleRaw(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: raw file route',
    )

    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: OPEN_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'POST, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, error: 'use POST' })
                return
              }
              handleOpen(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: open-with-default-app route',
    )
    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: REVEAL_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'POST, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, error: 'use POST' })
                return
              }
              handleReveal(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: reveal-in-finder route',
    )

    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: TRASH_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'POST, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, error: 'use POST' })
                return
              }
              handleTrash(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: move-to-trash route',
    )


    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: OPEN_WITH_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'POST, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, error: 'use POST' })
                return
              }
              handleOpenWith(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: open-with-chosen-app route',
    )

    ctx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: THUMB_PATH,
          handler: (req, res) => {
            try {
              if (rejected(req, res)) return
              if (req.method === 'OPTIONS') {
                res.writeHead(204, { allow: 'GET, OPTIONS' })
                res.end()
                return
              }
              if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, error: 'use GET' })
                return
              }
              handleThumb(ctx, req, res).catch((error) => {
                if (res.headersSent) {
                  res.end()
                  return
                }
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              })
            } catch (error) {
              if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
              } else {
                res.end()
              }
            }
          },
        }),
      'dsh-conversation-files: thumbnail route',
    )

    ctx.logger?.info?.(`dsh-conversation-files: mounted ${ROUTE_PATH}, ${PREVIEW_PATH}, ${RAW_PATH}`)
  })

  snapshot = loadSnapshot()

  ctx.effect(
    () => {
      const timer = setTimeout(() => {
        void refreshInBackground(ctx)
        void prunePreviewCache()
      }, 5000)
      return () => clearTimeout(timer)
    },
    'dsh-conversation-files: snapshot warm-up',
  )
}
