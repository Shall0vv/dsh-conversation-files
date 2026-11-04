---
name: dsh-generated-files
description: 在 DSH 左侧栏做一个「对话文件」画廊：跨所有对话汇总助手写/改/交付给用户的文件，卡片网格 + 类型分组 + 缩略图 + 单击用默认应用打开 + ⋮ 菜单（打开方式/Finder/废纸篓）。当用户要求「汇总所有对话里你为我生成的文件」「像 Claude Code 那样列出产出文件」「做一个生成文件面板/画廊」，或需要在新机器上安装/重建 dsh-conversation-files 插件时使用。
---

# dsh-generated-files — 跨对话生成文件画廊

在 DSH Web 左侧栏加一个「对话文件」入口，把所有对话里**助手产出**的文件汇总成卡片画廊。

## 何时用

- 「左边栏汇总对话里所有的文件」「像 Claude Code 那样列出你为我生成的文件」
- 「把生成的文件做成画廊 / 缩略图列表」「按文件类型分类」
- 在新机器上安装或重建 `dsh-conversation-files` 插件

不适用：只是想看当前工作区的文件树（那是 `dsh-client-ui-sidebar-files` 的事）。

## 平台要求

- 宿主：DSH Web（Electron 应用）。插件把宿主能力全走 HTTP 路由，浏览器里无需额外权限。
- 依赖 macOS 专有能力：`qlmanage`（Office/PDF 缩略图）、`~/.Trash`（废纸篓）、`osascript` + `open`（默认应用 / 选择应用 / Finder 显示）。
- 换到 Windows / Linux 时，面板、分组、搜索、文本与图片缩略图照常工作；只有三件事需要替换实现，其余不用动：
  - Office 缩略图：Linux 用 `libreoffice --headless --convert-to png`，Windows 用 COM / PDF 转换
  - 废纸篓：Linux 用 `gio trash`，Windows 用 shell API；或干脆 `rm`（并在文案里说明不可恢复）
  - 打开文件：Linux `xdg-open`，Windows `start ""`
  - 对应路由在非 macOS 上可以直接返回 501，前端会回退到扩展名块。

## 交付物

一个 DSH bundle，包名 `dsh-conversation-files`，左侧栏入口 id/key 都是 `conversation-files`，order 50。

```
dsh-conversation-files/
  package.json          # type:module, exports ".", "./client", "./locale/*.json", "./icon"
  cordis.patch.yml      # - insert: [{ id: dsh-conversation-files, name: dsh-conversation-files }]
  lib/index.js          # host：6 条 HTTP 路由 + 事件解析 + 三层缓存（~1600 行）
  client/client.js      # client：sidebar.panellist + main 面板 + 卡片网格（~1400 行）
  locale/{zh,en}.json   # meta.title / meta.description
  icon.svg              # 256×256 原创图标
  README.md / README.zh.md
```

## 最快路径：直接装现成 bundle

### 方式 A：从 GitHub 装（有网就行）

```bash
git clone https://github.com/Shall0vv/dsh-conversation-files.git ~/dsh-conversation-files
# 然后在 DSH 里：
plugin_manager install_bundle target=/Users/<你>/dsh-conversation-files
```

仓库根就是 bundle 本体（`package.json` 在根），`docs/` 是截图、`skill/SKILL.md` 是本文件。

### 方式 B：从本 skill 的 assets 装（离线 / 没网时）

`assets/dsh-conversation-files/` 是同一份源码副本。

```bash
cp -R <skill目录>/assets/dsh-conversation-files ~/dsh-conversation-files
plugin_manager install_bundle target=/Users/<你>/dsh-conversation-files
```

若提示 `already-installed`，先 `plugin_manager remove_bundle target=dsh-conversation-files` 再装。
装完刷新页面（Cmd+R），左栏出现「对话文件」，点开即可。

**在新机器上装（明天换电脑用这个流程）**：

1. 把 `dsh-generated-files-skill.zip`（工作区根目录，含 SKILL.md + assets）拷到新机器。
2. 解压到 `~/.dsh/skills/`，确保是 `~/.dsh/skills/dsh-generated-files/SKILL.md`。
3. 打开新会话，直接说：**「按 dsh-generated-files 这个 skill 帮我把对话文件插件装上」** —— 新会话的模型会看到这个 skill，照着把 bundle 复制出来跑 `plugin_manager install_bundle`。
4. 如果新机器上没有 `~/.dsh/skills` 目录，先建：`mkdir -p ~/.dsh/skills`。

## 从头重建（assets 不可用时）

### 1. 骨架

```json
{
  "name": "dsh-conversation-files",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": { "default": "./client/client.js" },
    "./package.json": "./package.json",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["lib/index.js", "client/client.js", "cordis.patch.yml", "locale/*.json", "icon.svg", "README.md", "README.zh.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true, "inject": ["@deepseek-ai/dsh-client-ui-conversation"] }
  }
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-conversation-files
      name: dsh-conversation-files
```

### 2. Host（lib/index.js）

`export const name = 'dsh-conversation-files'`、`export const inject = ['webServer', 'connection']`、`export function apply(ctx, config)`。

**数据来源**：`sessionQuery.listSessions()` 列出全部会话 → 跳过 `header.origin === 'subagent'` → `sessionQuery.readTitleSnapshots(ids)` 批量取标题（标题要清洗：以 `<` 开头的注入块丢弃，长度截断 60）→ 逐个读事件：内存会话用 `sessions.get(id).snapshotEvents()`，持久化会话用 `sessionQuery.readSession(id)`。

**只解析 `tool/call`，绝不看 `tool/result`**：后者 `meta.path` 是「被操作的对象」，看它会把每个被读过的文件都误判成交付。

分类规则：

- `present` / `deliver` / `deliverables` → kind `present`
- `write` / `write_file` / `edit` / `edit_file` / `multi_edit` / `apply_patch` / `notebook_edit` / `str_replace*` / `create_file` / `delete_file` / `move_file` → kind `write`
- 参数里取路径：`path` / `file_path` / `filePath` / `notebook_path` / `target_file` / `target` / `filename` / `file_name` / `file`；`files` / `paths` / `file_paths` 是路径数组；patch 文本匹配 `/^\*\*\* (?:Update|Add|Delete|Move) File: (.+)$/gm`
- 用户消息里的附件（`user/message` content 的 `file` block）**不算**生成文件
- 路径用 `realpathSync` 归一（macOS `/tmp` → `/private/tmp`），跨对话按绝对路径合并：`{ path, name, ext, group, kind, count, firstSeq, lastSeq, lastTime, size, exists, sessions: [{ id, title }] }`

**分组**（按扩展名，`GROUP_BY_EXT` 映射，未知落 `other`）：`image` / `doc` / `sheet` / `slides` / `code` / `config` / `data` / `archive` / `media` / `other`。
Office 一定要拆开：xls/xlsx/numbers/ods/csv/tsv → `sheet`；ppt/pptx/key/odp → `slides`；doc/docx/pdf/md/txt → `doc`。

**路由**（全部 `webServer.register({ kind: 'exact', path, handler })` + `ctx.effect`，进 handler 先 `connection.requestRejection(req)`，OPTIONS 回 204，方法不对回 405）：

| 路由 | 作用 |
| --- | --- |
| `GET /dsh-conversation-files/generated` | 完整清单 `{ ok, generatedAt, total, counts, sessionCount, files, shown }` |
| `GET …/thumb?path=` | 图片字节（≤12MB，仅最近快照里的图片） |
| `GET …/text?path=` | 文本前 40 行（≤256KB，含 `\0` 判二进制） |
| `GET …/preview?path=&size=` | QuickLook 首页 PNG（`qlmanage -t -s <size> -o <tmp> <file>`，200–1600） |
| `GET …/raw?path=` | 原样字节（图片/PDF/音视频，≤128MB） |
| `POST …/open` / `open-with` / `reveal` / `trash` | 默认应用 / 选择应用 / Finder 显示 / 移入废纸篓 |

四个动作路由**都必须**先拿 path 去当前快照里校验（不是生成文件就 404）。

**缓存三层**：

1. 会话级：内存会话按 `seq` 缓存，持久化会话 60 秒 TTL。
2. 快照落盘：`~/.dsh/cache/dsh-conversation-files/generated.json`；< 10 分钟直接返回；< 24 小时先返旧数据再后台重建（响应带 `stale: true`）。
3. 进程内存：`snapshot` 变量 + `refreshInBackground` 并发去重；apply 里 `setTimeout(5s)` 预热。

预览图缓存：`~/.dsh/cache/dsh-conversation-files/previews/<sha1(path)[:24]>.png` + 同名 `.json` 记 `{ mtimeMs, size }`，两者都匹配才算命中；启动时清理 30 天未访问的文件。

### 3. Client（client/client.js）

外层 `window.__ModuleLoader__.load({ id, factory(require) {...} })`，`inject = ['slots', 'locale']`。

- `ctx.locale.register(NS, { zh, en })`，文案全内嵌（`t = ctx.locale.bind(NS)`）
- `ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'conversation-files', order: 50, label: () => t('title'), locale: NS }, IconComponent))`
- `ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'conversation-files', locale: NS }, makePanel(ctx)))`

面板要点：

- 数据 `useState(lastPayload)` 用模块级缓存初始化 → 切换面板秒开；`load()` 比较 `generatedAt`，没变就不 `setData`（否则 5 秒轮询白重渲染整棵树）
- 每 5 秒轮询；`document.visibilityState === 'hidden'` 时跳过
- 分桶渲染：`GROUP_ORDER = ['image','doc','sheet','slides','code','config','data','archive','media','other']`，组头 `position: sticky; z-index: 6`
- 折叠用 `grid-template-rows: 1fr → 0fr` 过渡（不要直接卸载 DOM），状态存 `localStorage`
- 卡片：`content-visibility: auto; contain-intrinsic-size: auto 168px`（视口外不排版）
- 缩略图三路：图片走 `thumb`；文本/代码走 `text` + 等宽小字（markdown 去掉 `#`/`>`/`-`/`**` 等标记）；Office/PDF 走 `preview`
- 角标：**所有**卡片右上角都显示扩展名（图片、文档、文本一视同仁），`z-index` 必须低于组头，否则滚动时会穿透吸顶头
- chips：`全部`（仅存在的文件）/ `写入` / `交付` / `已删除`（独立分类，不混进全部）
- 两个下拉：`全部类型`（按 group）+ `全部后缀`（按实际出现的 ext，数量倒序）
- 卡片右下角 `⋮` 按钮（hover 才显示 opacity）打开菜单，菜单**竖向四项**：默认应用打开 / 选择应用打开 / 在 Finder 中打开 / 移到废纸篓（红色）；开合都做动画（`transform-origin: bottom right`，弹出 `scale(.86)→1` + 上移，收起反向 + 淡出 160ms，收起期间 `pointer-events:none`）
- 点卡片 = 默认应用打开；**不要**再挂 `onContextMenu`
- 菜单打开时给 `document` 加 `mousedown` 监听关闭它，按钮和菜单自身 `stopPropagation`

### 4. 三种文件动作的实现

- 默认应用：`execFile('open', [path])`
- 选择应用：`osascript -e 'on run argv / set target to POSIX file (item 1 of argv) / tell application "Finder" to open target using (choose application) / end run' -- <path>`；无自动化权限会失败 → 回退 `open -R`
- 废纸篓：不要 `rm`，`rename(path, ~/.Trash/<name>)`，同名加时间戳后缀；成功后把内存快照里该文件标 `exists: false` 并后台重建

## 踩坑清单

- `install_bundle` 对已装包报 `already-installed`：必须先 `remove_bundle` 再 `install_bundle`。
- 改 host 代码要重装才生效；改 client 代码重装后还要刷新页面。
- 快照落盘有 10 分钟 TTL：**改了分组规则后要先删 `~/.dsh/cache/dsh-conversation-files/generated.json` 再重装**，否则面板还按旧分组显示。
- `main` 面板拿不到当前 session：`props.useSessions(s => s)` 的顶层快照没有 `current`（`current` 只在会话列表组件里）。需要「最近活跃会话」就在 host 侧按最后事件时间自己挑。
- 右侧栏预览（`ctx.get('sidebarRight')` + `openResource('dsh-resource://file/session/<id>/<path>')`）虽然存在，但依赖 session 绑定，从 main 面板调用会失败 —— 想要「在侧边栏打开」成本高，直接给系统应用打开更实在。
- `qlmanage` 首次渲染 docx 约 1 秒，之后走缓存；必须给超时（20s）并 `rm` 临时目录。
- 卡片太多时切换面板会卡：比较 `generatedAt` 避免无谓重渲染 + `content-visibility`。
- sticky 组头和缩略图角标都设 `z-index` 会打架：组头 6、角标 2，别反过来。
- 缩略图 URL 一定要带版本参数 `&v=<size>-<lastTime>`，文件被改写后浏览器才会重新拉。
- 用 Python 切片批量删代码前先 `node --check`，并避免「按区间删除」误删相邻的 state 区块（本项目真删没过一次面板的 `useState`，整块空白）。

## 验证清单

1. `node --check client/client.js`；`cp lib/index.js /tmp/h.mjs && node --check /tmp/h.mjs`
2. 装好后刷新页面，左栏出现「对话文件」；面板显示「共 N 个文件 · 来自 M 个对话」
3. chips 数量之和合理（全部 + 已删除 = 总文件条数）
4. 随便滚到「文档」组，Office 卡片要有 QuickLook 缩略图 + 右上角扩展名角标
5. 点一次卡片应打开系统应用；点 ⋮ 应弹出四项菜单并有动画
6. 点「已删除」chip，之前删掉的文件应单独列出且带红色标记
