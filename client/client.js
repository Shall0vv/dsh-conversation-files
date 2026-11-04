/**
 * dsh-conversation-files client half: a left-sidebar entry + its center panel.
 *
 * This panel is the "files the assistant made for you" gallery: one list that
 * spans every conversation in the profile, showing only files the assistant
 * produced (written/edited/patched by tools, or handed over with a present-style
 * tool). Read-only touches and user attachments never appear here.
 *
 * The panel asks the host route for the folded list and re-reads it on a timer.
 * Nothing is derived here: the host walks raw event logs (the single source of
 * truth) and answers with a de-duplicated, newest-first list, so this half is
 * pure presentation + polling.
 *
 * Hand-written CJS factory bundle for the web module loader: running this file
 * only REGISTERS the factory (`window.__ModuleLoader__.load({id, factory})`);
 * the body executes when the shell materializes the module. `react` is the only
 * external; everything else is plain DOM through createElement.
 */
window.__ModuleLoader__.load({
  id: 'dsh-conversation-files',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var h = React.createElement

    var inject = ['slots', 'locale']
    var NS = 'dsh-conversation-files'
    var ID = 'conversation-files'
    var LIST_PATH = '/dsh-conversation-files/generated'
    var REVEAL_PATH = '/dsh-conversation-files/reveal'
    var TRASH_PATH = '/dsh-conversation-files/trash'
    var THUMB_PATH = '/dsh-conversation-files/thumb'
    var POLL_MS = 5000

    var STYLE_ID = 'dsh-conversation-files-style-2'
    var CSS = [
      '.cf-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.cf-head{display:flex;align-items:flex-start;gap:12px;padding:16px 20px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.cf-head-main{flex:1;min-width:0}',
      '.cf-title{font-size:15px;font-weight:600;line-height:1.3}',
      '.cf-sub{margin-top:4px;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-refresh{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s ease,color .15s ease}',
      '.cf-refresh:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.cf-refresh[data-busy="true"] svg{animation:cf-spin 1s linear infinite}',
      '@keyframes cf-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
      '.cf-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:10px 20px}',
      '.cf-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease}',
      '.cf-chip:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.cf-chip[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}',
      '.cf-chip[data-kind="present"][data-active="true"]{color:var(--dsw-alias-brand-primary)}',
      '.cf-chip[data-kind="write"][data-active="true"]{color:var(--dsw-alias-state-success-primary)}',
      '.cf-chip-count{font-size:11px;opacity:.72}',
      '.cf-search{flex:1;min-width:120px;height:28px;margin-left:auto;max-width:220px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}',
      '.cf-search:focus{border-color:var(--dsw-alias-border-l2)}',
      '.cf-search::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.cf-list{flex:1;min-height:0;overflow:auto;padding:0 0 14px}',
      '.cf-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;transition:background .12s ease}',
      '.cf-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.cf-row[data-copied="true"]{background:var(--dsw-alias-bg-layer-2)}',
      '.cf-kind{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}',
      '.cf-kind[data-kind="present"]{color:var(--dsw-alias-brand-primary)}',
      '.cf-kind[data-kind="write"]{color:var(--dsw-alias-state-success-primary)}',
      '.cf-kind[data-kind="other"]{color:var(--dsw-alias-label-secondary)}',
      '.cf-main{flex:1;min-width:0}',
      '.cf-name-row{display:flex;align-items:center;gap:6px;min-width:0}',
      '.cf-name{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-name[data-missing="true"]{color:var(--dsw-alias-label-secondary);text-decoration:line-through}',
      '.cf-badge{flex:none;font-size:10px;line-height:16px;padding:0 6px;border-radius:6px;border:1px solid currentColor;opacity:.8}',
      '.cf-badge[data-kind="present"]{color:var(--dsw-alias-brand-primary)}',
      '.cf-badge[data-kind="write"]{color:var(--dsw-alias-state-success-primary)}',
      '.cf-badge[data-missing="true"]{color:var(--dsw-alias-state-warn-primary)}',
      '.cf-path{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}',
      '.cf-conv{margin-top:1px;font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-meta{flex:none;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.cf-copied{font-size:11px;color:var(--dsw-alias-state-success-primary)}',
      '.cf-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;height:100%;min-height:220px;padding:24px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.cf-empty-title{font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.cf-empty-hint{font-size:12px;max-width:44ch;line-height:1.6}',
      '.cf-empty-icon{opacity:.5}',
      '.cf-error{color:var(--dsw-alias-state-error-primary);font-size:12px;word-break:break-word;max-width:52ch;line-height:1.5}',
      '.cf-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 20px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.cf-foot-id{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.8}',
      '.cf-retry{margin-top:2px;height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}',
      '.cf-retry:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.cf-group{padding:0}',
      '.cf-group-head{display:flex;align-items:center;gap:8px;padding:10px 20px 8px;position:sticky;top:0;z-index:6;background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;user-select:none}',
      '.cf-group-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.cf-group-count{font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.7}',
      '.cf-group-caret{display:inline-flex;color:var(--dsw-alias-label-secondary);transition:transform .12s ease}',
      '.cf-group[data-collapsed="true"] .cf-group-caret{transform:rotate(-90deg)}',
      '.cf-select{flex:none;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}',
      '.cf-select:focus{border-color:var(--dsw-alias-border-l2)}',
      '.cf-select-ext{max-width:132px}',
      '.cf-card-menu-btn{position:absolute;right:4px;bottom:4px;display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;transition:opacity .12s ease,background .12s ease}',
      '.cf-card:hover .cf-card-menu-btn,.cf-card-menu-btn:focus-visible{opacity:1}',
      '.cf-card-menu-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.cf-card-menu{position:absolute;right:2px;bottom:26px;z-index:8;display:flex;flex-direction:column;min-width:172px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 28px rgba(0,0,0,.38);transform-origin:bottom right;animation:cf-menu-pop .17s cubic-bezier(.22,.9,.32,1.12) both}',
      '@keyframes cf-menu-pop{from{opacity:0;transform:scale(.86) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '.cf-card-menu[data-closing="true"]{animation:cf-menu-pop-out .16s ease both;pointer-events:none}',
      '@keyframes cf-menu-pop-out{from{opacity:1;transform:scale(1) translateY(0)}to{opacity:0;transform:scale(.9) translateY(5px)}}',
      '.cf-menu-item{animation:cf-menu-fade .16s ease both}',
      '.cf-menu-item:nth-child(1){animation-delay:0ms}',
      '.cf-menu-item:nth-child(2){animation-delay:18ms}',
      '.cf-menu-item:nth-child(3){animation-delay:36ms}',
      '.cf-menu-item:nth-child(4){animation-delay:54ms}',
      '@keyframes cf-menu-fade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}',
      '.cf-menu-item{display:block;width:100%;padding:6px 10px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.4;text-align:left;cursor:pointer;white-space:nowrap}',
      '.cf-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.cf-menu-item[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}',
      '.cf-group-body{display:grid;grid-template-rows:1fr;transition:grid-template-rows .24s cubic-bezier(.34,1.3,.64,1)}',
      '.cf-group-body[data-collapsed="true"]{grid-template-rows:0fr}',
      '.cf-grid-wrap{overflow:hidden;min-height:0}',
      '.cf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:10px;padding:10px 20px 0;transition:opacity .18s ease,transform .24s cubic-bezier(.34,1.3,.64,1)}',
      '.cf-group-body[data-collapsed="true"] .cf-grid{opacity:0;transform:translateY(-6px) scale(.985)}',
      '.cf-card{content-visibility:auto;contain-intrinsic-size:auto 168px;position:relative;display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;transition:border-color .12s ease,background .12s ease}',
      '.cf-card:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.cf-card[data-copied="true"]{border-color:var(--dsw-alias-brand-primary)}',
      '.cf-thumb{position:relative;display:flex;align-items:center;justify-content:center;height:92px;border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}',
      '.cf-thumb-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
      '.cf-thumb-fallback{color:var(--dsw-alias-label-secondary);opacity:.45}',
      '.cf-thumb-file{flex-direction:column;gap:2px}',
      '.cf-thumb-code{align-items:stretch;justify-content:flex-start;padding:7px 8px;background:var(--dsw-alias-bg-layer-2)}',
      '.cf-code-lines{display:flex;flex-direction:column;width:100%;overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:8.5px;line-height:1.3;text-align:left;color:var(--dsw-alias-label-secondary)}',
      '.cf-code-line{white-space:pre;overflow:hidden;opacity:.92}',
      '.cf-code-line:first-child{padding-right:34px}',
      '.cf-code-fade{position:absolute;left:0;right:0;bottom:0;height:26px;background:linear-gradient(to bottom,transparent,var(--dsw-alias-bg-layer-2))}',
      '.cf-thumb-tag{position:absolute;top:6px;right:6px;z-index:2;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);opacity:.8}',
      '.cf-thumb-doc{background:var(--dsw-alias-bg-layer-2)}',
      '.cf-thumb-doc .cf-thumb-img{object-fit:cover;object-position:top center}',
      '.fv{display:flex;flex-direction:column;height:100%;min-height:0}',
      '.fv-head{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}',
      '.fv-head-main{flex:1;min-width:0}',
      '.fv-name{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fv-path{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fv-back{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.fv-back:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.fv-act{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:7px;padding:4px 9px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.fv-act:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.fv-body{flex:1;min-height:0;overflow:auto;padding:16px 18px 26px;background:var(--dsw-alias-bg-base)}',
      '.fv-img,.fv-doc{display:block;max-width:100%;margin:0 auto;border-radius:8px}',
      '.fv-pdf{display:block;width:100%;height:100%;min-height:520px;border:0;border-radius:8px;background:#fff}',
      '.fv-video{display:block;max-width:100%;margin:0 auto;border-radius:8px}',
      '.fv-audio{display:block;width:100%;margin:56px auto 0}',
      '.fv-pre{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}',
      '.fv-md{font-size:13.5px;line-height:1.7;color:var(--dsw-alias-label-primary)}',
      '.fv-md .fv-h{font-weight:700;margin:16px 0 6px;font-size:15px}',
      '.fv-md .fv-h[data-level="1"]{font-size:20px}',
      '.fv-md .fv-h[data-level="2"]{font-size:17px}',
      '.fv-md .fv-p{margin:5px 0}',
      '.fv-md .fv-li{margin:3px 0 3px 16px}',
      '.fv-md .fv-gap{height:9px}',
      '.fv-md .fv-quote{margin:7px 0;padding-left:10px;border-left:2px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.fv-md .fv-table{margin:4px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}',
      '.fv-md .fv-code{margin:10px 0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow:auto}',
      '.fv-note{padding:28px 0;text-align:center;font-size:13px;color:var(--dsw-alias-label-secondary)}',
      '.fv-foot{padding:8px 16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-ext{font-size:17px;font-weight:700;letter-spacing:.04em;color:var(--dsw-alias-label-primary);opacity:.85}',
      '.cf-thumb-kind{color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.cf-card-name{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-card-name[data-missing="true"]{text-decoration:line-through;color:var(--dsw-alias-label-secondary)}',
      '.cf-card-conv{font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}',
      '.cf-card-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.8;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cf-card-deleted{font-size:10px;color:var(--dsw-alias-state-warn-primary)}',
    ].join('')

    var zh = {
      title: '对话文件',
      description: '跨所有对话汇总助手为你生成、修改或交付的文件',
      summary: '共 {n} 个文件 · 来自 {m} 个对话',
      loading: '正在扫描所有对话…',
      refresh: '立即刷新',
      search: '按文件名或路径搜索',
      all: '全部',
      write: '写入',
      present: '交付',
      emptyTitle: '还没有生成过文件',
      emptyHint: '助手在任意对话里写入、修改或交付的文件，都会自动汇总到这里。',
      errorTitle: '读取失败',
      retry: '重试',
      copied: '已复制路径',
      copyHint: '点击复制完整路径',
      openHint: '点击用默认程序打开',
      back: '返回',
      copyPath: '复制路径',
      openNative: '用默认程序打开',
      cannotPreview: '这种文件没法在面板里预览，试试“用默认程序打开”。',
      from: '来自「{title}」',
      deleted: '已删除',
      foot: '每 5 秒自动刷新',
      groupImage: '图片',
      groupDoc: '文档',
      groupSheet: '表格',
      groupSlides: '演示文稿',
      groupCode: '代码',
      groupConfig: '配置',
      groupData: '数据',
      groupArchive: '压缩包',
      groupMedia: '音视频',
      groupOther: '其他',
      typeAll: '全部类型',
      extAll: '全部后缀',
      menuActions: '更多操作',
      menuDefault: '使用默认应用打开',
      menuChoose: '选择应用打开',
      menuReveal: '在 Finder 中打开',
      menuTrash: '移到废纸篓',
      confirmTrash: '把这个文件移到废纸篓？可以从废纸篓恢复。',
      refreshing: '后台更新中',
      collapseHint: '收起这一组',
      expandHint: '展开这一组',
      file: '文件',
      kindWrite: '写入',
      kindPresent: '交付',
      kindOther: '文件',
    }

    var en = {
      title: 'Conversation files',
      description: 'Every file the assistant created, changed or delivered, across all conversations',
      summary: '{n} files from {m} conversations',
      loading: 'Scanning all conversations…',
      refresh: 'Refresh now',
      search: 'Search by name or path',
      all: 'All',
      write: 'Written',
      present: 'Delivered',
      emptyTitle: 'No generated files yet',
      emptyHint: 'Files the assistant writes, edits or delivers in any conversation show up here automatically.',
      errorTitle: 'Could not read the file list',
      retry: 'Retry',
      copied: 'Path copied',
      copyHint: 'Click to copy the full path',
      openHint: 'Click to open with the default app',
      back: 'Back',
      copyPath: 'Copy path',
      openNative: 'Open with default app',
      cannotPreview: 'This file cannot be previewed here — try “Open with default app”.',
      from: 'From “{title}”',
      deleted: 'Deleted',
      foot: 'Refreshes every 5 seconds',
      groupImage: 'Images',
      groupDoc: 'Documents',
      groupSheet: 'Spreadsheets',
      groupSlides: 'Slides',
      groupCode: 'Code',
      groupConfig: 'Config',
      groupData: 'Data',
      groupArchive: 'Archives',
      groupMedia: 'Media',
      groupOther: 'Other',
      typeAll: 'All types',
      extAll: 'All extensions',
      menuActions: 'More actions',
      menuDefault: 'Open with default app',
      menuChoose: 'Open with…',
      menuReveal: 'Show in Finder',
      menuTrash: 'Move to Trash',
      confirmTrash: 'Move this file to the Trash? You can restore it from there.',
      refreshing: 'refreshing in background',
      collapseHint: 'Collapse group',
      expandHint: 'Expand group',
      file: 'File',
      kindWrite: 'Written',
      kindPresent: 'Delivered',
      kindOther: 'File',
    }

    function ensureStyle() {
      if (typeof document === 'undefined') return
      var existing = document.getElementById(STYLE_ID)
      if (existing !== null) {
        if (existing.textContent === CSS) return
        existing.remove()
      }
      var stale = document.getElementById('dsh-conversation-files-style')
      if (stale !== null) stale.remove()
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    function svg(children, size, extra) {
      var props = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }
      if (extra !== undefined) {
        for (var key in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, key)) props[key] = extra[key]
        }
      }
      return h('svg', props, children)
    }

    function folderIcon(size) {
      return svg(h('path', { d: 'M3.5 7.5a2 2 0 0 1 2-2h4.2l2 2H18.5a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z' }), size)
    }

    function kindIcon(kind, size) {
      if (kind === 'present') {
        return svg(
          [
            h('path', { key: 'c', d: 'M20 11.2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7.8' }),
            h('path', { key: 'p', d: 'M12 15V3.6' }),
            h('path', { key: 'a', d: 'm8 7 4-4 4 4' }),
          ],
          size,
        )
      }
      if (kind === 'write') {
        return svg(
          [
            h('path', { key: 'p', d: 'M4 20h4.2L20 8.2a2.1 2.1 0 0 0-3-3L5.2 17z' }),
            h('path', { key: 'l', d: 'm13.6 6.6 3 3' }),
          ],
          size,
        )
      }
      return svg(
        [
          h('path', { key: 'p', d: 'M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z' }),
          h('path', { key: 'f', d: 'M13.5 3.5V9H19' }),
        ],
        size,
      )
    }

    function refreshIcon(size) {
      return svg(
        [
          h('path', { key: 'p', d: 'M20 12a8 8 0 1 1-2.3-5.6' }),
          h('path', { key: 'a', d: 'M20 4.5V9h-4.5' }),
        ],
        size,
      )
    }

    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return ''
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    function formatTime(value) {
      if (typeof value !== 'number' || value <= 0) return ''
      try {
        var date = new Date(value)
        var now = new Date()
        var sameDay =
          date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
        if (sameDay) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
      } catch (error) {
        return ''
      }
    }

    var TEXT_PATH = '/dsh-conversation-files/text'
    var PREVIEW_PATH = '/dsh-conversation-files/preview'
    var RAW_PATH = '/dsh-conversation-files/raw'
    var OPEN_PATH = '/dsh-conversation-files/open'
    var OPEN_WITH_PATH = '/dsh-conversation-files/open-with'
    var MARKDOWN_EXTS = ['md', 'markdown', 'mdx']
    var DOC_PREVIEW_EXTS = [
      'pdf', 'doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt', 'pages',
      'ppt', 'pptx', 'pps', 'ppsx', 'key', 'odp',
      'xls', 'xlsx', 'xlsm', 'numbers', 'ods',
      'epub',
    ]

    /** Documents the host renders through macOS QuickLook. */
    function canPreviewDoc(entry) {
      if (entry === null || typeof entry !== 'object') return false
      if (entry.exists === false) return false
      var ext = typeof entry.ext === 'string' ? entry.ext.replace('.', '').toLowerCase() : ''
      return DOC_PREVIEW_EXTS.indexOf(ext) !== -1
    }
    var PREVIEW_EXTS = [
      'md', 'markdown', 'mdx', 'txt', 'text', 'log', 'rst', 'adoc',
      'json', 'jsonc', 'json5', 'jsonl', 'ndjson', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env', 'plist', 'xml',
      'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'swift', 'm', 'mm',
      'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'vue', 'svelte', 'sql', 'lua', 'php', 'r', 'pl', 'ex', 'exs', 'dart', 'scala', 'clj', 'hs', 'zig', 'proto', 'graphql', 'gql',
      'csv', 'tsv', 'diff', 'patch',
    ]

    function canPreviewText(entry) {
      if (entry === null || typeof entry !== 'object') return false
      if (entry.group === 'image' || entry.group === 'archive' || entry.group === 'media') return false
      var ext = typeof entry.ext === 'string' ? entry.ext.replace('.', '').toLowerCase() : ''
      return PREVIEW_EXTS.indexOf(ext) !== -1
    }

    function viewerKindOf(entry) {
      var ext = typeof entry.ext === 'string' ? entry.ext.replace('.', '').toLowerCase() : ''
      if (entry.group === 'image') return 'image'
      if (ext === 'pdf') return 'pdf'
      if (ext === 'mp4' || ext === 'webm' || ext === 'mov' || ext === 'mkv') return 'video'
      if (ext === 'mp3' || ext === 'wav' || ext === 'm4a' || ext === 'flac' || ext === 'aac' || ext === 'ogg' || ext === 'opus') return 'audio'
      if (canPreviewDoc(entry)) return 'doc'
      if (canPreviewText(entry)) return MARKDOWN_EXTS.indexOf(ext) !== -1 ? 'markdown' : 'text'
      return 'unknown'
    }

    function inlineMarkdown(text) {
      return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    }

    function markdownBlocks(text) {
      var lines = text.split('\n')
      var nodes = []
      var codeLines = null
      for (var index = 0; index < lines.length; index += 1) {
        var line = lines[index]
        if (/^\s*```/.test(line)) {
          if (codeLines === null) {
            codeLines = []
          } else {
            nodes.push(h('pre', { key: 'code' + index, className: 'fv-code' }, codeLines.join('\n')))
            codeLines = null
          }
          continue
        }
        if (codeLines !== null) {
          codeLines.push(line)
          continue
        }
        if (/^\s*$/.test(line)) {
          nodes.push(h('div', { key: 'gap' + index, className: 'fv-gap' }))
          continue
        }
        var heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading !== null) {
          nodes.push(
            h('div', { key: 'h' + index, className: 'fv-h', 'data-level': String(heading[1].length) }, inlineMarkdown(heading[2])),
          )
          continue
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          nodes.push(h('div', { key: 'li' + index, className: 'fv-li' }, '· ' + inlineMarkdown(line.replace(/^\s*[-*+]\s+/, ''))))
          continue
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          nodes.push(h('div', { key: 'ol' + index, className: 'fv-li' }, inlineMarkdown(line.replace(/^\s*/, ''))))
          continue
        }
        if (/^\s*>/.test(line)) {
          nodes.push(h('div', { key: 'q' + index, className: 'fv-quote' }, inlineMarkdown(line.replace(/^\s*>\s?/, ''))))
          continue
        }
        if (/^\s*\|/.test(line)) {
          nodes.push(h('div', { key: 'tb' + index, className: 'fv-table' }, inlineMarkdown(line)))
          continue
        }
        nodes.push(h('div', { key: 'p' + index, className: 'fv-p' }, inlineMarkdown(line)))
      }
      if (codeLines !== null) nodes.push(h('pre', { key: 'codeend', className: 'fv-code' }, codeLines.join('\n')))
      return nodes
    }

    function backIcon(size) {
      return svg([h('path', { key: 'p', d: 'M15 6l-6 6 6 6' })], size)
    }

    /** Inline viewer shown inside the panel when a card is clicked. */
    function FileViewer(props) {
      var entry = props.entry
      var t = props.t
      var kind = viewerKindOf(entry)
      var textBox = React.useState(null)
      var text = textBox[0]
      var setText = textBox[1]
      var copyBox = React.useState(false)
      var copied = copyBox[0]
      var setCopied = copyBox[1]

      React.useEffect(
        function () {
          if (kind !== 'text' && kind !== 'markdown') return undefined
          var alive = true
          setText(null)
          fetch(TEXT_PATH + '?path=' + encodeURIComponent(entry.path) + '&full=1', { credentials: 'include' })
            .then(function (response) {
              return response.ok
                ? response.json().catch(function () {
                    return null
                  })
                : null
            })
            .then(function (body) {
              if (!alive) return
              setText(body !== null && typeof body === 'object' && body.ok === true && Array.isArray(body.lines) ? body.lines.join('\n') : '')
            })
            .catch(function () {
              if (alive) setText('')
            })
          return function () {
            alive = false
          }
        },
        [entry.path, kind],
      )

      function copyPath() {
        if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return
        navigator.clipboard
          .writeText(entry.path)
          .then(function () {
            setCopied(true)
            setTimeout(function () {
              setCopied(false)
            }, 1400)
          })
          .catch(function () {})
      }

      function openNative() {
        fetch(OPEN_PATH + '?path=' + encodeURIComponent(entry.path), { method: 'POST', credentials: 'include' }).catch(function () {})
      }

      var version = String(props.version === undefined ? '' : props.version)
      var rawUrl = RAW_PATH + '?path=' + encodeURIComponent(entry.path) + '&v=' + version
      var content = null
      if (kind === 'image') {
        content = h('img', { className: 'fv-img', src: rawUrl, alt: entry.name })
      } else if (kind === 'pdf') {
        content = h('embed', { className: 'fv-pdf', src: rawUrl, type: 'application/pdf' })
      } else if (kind === 'video') {
        content = h('video', { className: 'fv-video', src: rawUrl, controls: true })
      } else if (kind === 'audio') {
        content = h('audio', { className: 'fv-audio', src: rawUrl, controls: true })
      } else if (kind === 'doc') {
        content = h('img', {
          className: 'fv-doc',
          src: PREVIEW_PATH + '?path=' + encodeURIComponent(entry.path) + '&size=1600&v=' + version,
          alt: entry.name,
        })
      } else if (kind === 'text') {
        content = text === null ? h('div', { className: 'fv-note' }, t('loading')) : h('pre', { className: 'fv-pre' }, text === '' ? t('cannotPreview') : text)
      } else if (kind === 'markdown') {
        content = text === null ? h('div', { className: 'fv-note' }, t('loading')) : h('div', { className: 'fv-md' }, markdownBlocks(text))
      } else {
        content = h('div', { className: 'fv-note' }, t('cannotPreview'))
      }

      var metaBits = []
      if (typeof entry.size === 'number') metaBits.push(formatBytes(entry.size))
      var timeLabel = formatTime(entry.lastTime)
      if (timeLabel !== '') metaBits.push(timeLabel)
      if (entry.exists === false) metaBits.push(t('deleted'))
      else if (entry.path !== undefined) metaBits.push(entry.path.slice(0, entry.path.lastIndexOf('/') + 1) || '/')

      return h(
        'div',
        { className: 'fv' },
        h(
          'div',
          { className: 'fv-head' },
          h(
            'button',
            { type: 'button', className: 'fv-back', title: t('back'), 'aria-label': t('back'), onClick: props.onClose },
            backIcon(15),
          ),
          h('div', { className: 'fv-head-main' }, h('div', { className: 'fv-name' }, entry.name), h('div', { className: 'fv-path' }, entry.path)),
          h('button', { type: 'button', className: 'fv-act', onClick: copyPath }, copied ? t('copied') : t('copyPath')),
          h('button', { type: 'button', className: 'fv-act', onClick: openNative, title: t('openNative') }, t('openNative')),
        ),
        h('div', { className: 'fv-body' }, content),
        h('div', { className: 'fv-foot' }, metaBits.join(' · ')),
      )
    }

    var thumbTextCache = {}
    var thumbTextPending = {}

    function loadThumbText(path) {
      if (Object.prototype.hasOwnProperty.call(thumbTextCache, path)) return Promise.resolve(thumbTextCache[path])
      if (thumbTextPending[path] !== undefined) return thumbTextPending[path]
      var promise = fetch(TEXT_PATH + '?path=' + encodeURIComponent(path), {
        credentials: 'include',
        headers: { accept: 'application/json' },
      })
        .then(function (response) {
          return response.ok
            ? response.json().catch(function () {
                return null
              })
            : null
        })
        .then(function (body) {
          var lines = body !== null && typeof body === 'object' && body.ok === true && Array.isArray(body.lines) ? body.lines : null
          thumbTextCache[path] = lines
          delete thumbTextPending[path]
          return lines
        })
        .catch(function () {
          thumbTextCache[path] = null
          delete thumbTextPending[path]
          return null
        })
      thumbTextPending[path] = promise
      return promise
    }

    /** Strip markdown punctuation so a thumbnail reads like prose. */
    function prettifyMarkdown(line) {
      return line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s{0,3}>\s?/, '')
        .replace(/^\s{0,3}[-*+]\s+/, '· ')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .replace(/\|/g, ' · ')
        .replace(/\s+$/, '')
    }

    var docPreviewFailed = {}

    /** Page thumbnail of a PDF / Office / iWork document, rendered by the host. */
    function DocThumb(props) {
      var failedBox = React.useState(docPreviewFailed[props.path] === true)
      var failed = failedBox[0]
      var setFailed = failedBox[1]
      if (failed) {
        return h(
          'div',
          { className: 'cf-thumb cf-thumb-file' },
          h('span', { className: 'cf-ext' }, props.label),
          h('span', { className: 'cf-thumb-kind' }, kindIcon(props.kind, 14)),
        )
      }
      return h(
        'div',
        { className: 'cf-thumb cf-thumb-doc' },
        h('span', { className: 'cf-thumb-fallback' }, kindIcon(props.kind, 26)),
        h('span', { className: 'cf-thumb-tag' }, props.label),
        h('img', {
          className: 'cf-thumb-img',
          src: PREVIEW_PATH + '?path=' + encodeURIComponent(props.path) + '&v=' + String(props.version === undefined ? '' : props.version),
          alt: '',
          loading: 'lazy',
          onError: function () {
            docPreviewFailed[props.path] = true
            setFailed(true)
          },
        }),
      )
    }

    /** Text/code thumbnail: the first lines of the file, monospace, faded at the bottom. */
    function TextThumb(props) {
      var cached = Object.prototype.hasOwnProperty.call(thumbTextCache, props.path) ? thumbTextCache[props.path] : null
      var box = React.useState(cached)
      var lines = box[0]
      var setLines = box[1]
      React.useEffect(
        function () {
          var alive = true
          loadThumbText(props.path).then(function (value) {
            if (alive) setLines(value)
          })
          return function () {
            alive = false
          }
        },
        [props.path],
      )
      if (lines === null || lines.length === 0) {
        return h(
          'div',
          { className: 'cf-thumb cf-thumb-file' },
          h('span', { className: 'cf-ext' }, props.label),
          h('span', { className: 'cf-thumb-kind' }, kindIcon(props.kind, 14)),
        )
      }
      var ext = typeof props.ext === 'string' ? props.ext.replace('.', '').toLowerCase() : ''
      var isMarkdown = MARKDOWN_EXTS.indexOf(ext) !== -1
      return h(
        'div',
        { className: 'cf-thumb cf-thumb-code' },
        h('span', { className: 'cf-thumb-tag' }, props.label),
        h(
          'div',
          { className: 'cf-code-lines' },
          lines.slice(0, 8).map(function (line, index) {
            var raw = line === '' ? ' ' : line
            if (!isMarkdown) return h('div', { key: index, className: 'cf-code-line' }, raw)
            var pretty = prettifyMarkdown(raw)
            return h(
              'div',
              {
                key: index,
                className: 'cf-code-line',
                style: /^\s{0,3}#{1,6}\s+/.test(line) ? { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } : null,
              },
              pretty === '' ? ' ' : pretty,
            )
          }),
        ),
        h('div', { className: 'cf-code-fade' }),
      )
    }

    var COLLAPSED_KEY = 'dsh-conversation-files:collapsed-groups:v2'

    /** Last response kept across panel mounts so reopening shows data instantly. */
    var lastPayload = null

    function readCollapsed() {
      try {
        if (typeof localStorage === 'undefined') return {}
        var raw = localStorage.getItem(COLLAPSED_KEY)
        if (raw === null) return {}
        var parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch (error) {
        return {}
      }
    }

    function writeCollapsed(map) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(COLLAPSED_KEY, JSON.stringify(map))
      } catch (error) {
        /* persistence is best effort */
      }
    }

    function caretIcon(size) {
      return svg([h('path', { key: 'a', d: 'M6 9l6 6 6-6' })], size)
    }

    function menuIcon(size) {
      var dots = []
      for (var index = 0; index < 3; index += 1) {
        dots.push(h('circle', { key: String(index), cx: 12, cy: 5 + index * 7, r: 1.7, fill: 'currentColor', stroke: 'none' }))
      }
      return svg(dots, size)
    }

    function makePanel(ctx) {
      var t = ctx.locale.bind(NS)

      return function GeneratedFilesPanel() {
        var dataBox = React.useState(lastPayload)
        var data = dataBox[0]
        var setData = dataBox[1]
        var errorBox = React.useState(null)
        var error = errorBox[0]
        var setError = errorBox[1]
        var busyBox = React.useState(false)
        var busy = busyBox[0]
        var setBusy = busyBox[1]
        var copiedBox = React.useState(null)
        var copied = copiedBox[0]
        var setCopied = copiedBox[1]
        var filterBox = React.useState('all')
        var filter = filterBox[0]
        var setFilter = filterBox[1]
        var typeBox = React.useState('all')
        var typeFilter = typeBox[0]
        var setTypeFilter = typeBox[1]
        var extBox = React.useState('all')
        var extFilter = extBox[0]
        var setExtFilter = extBox[1]
        var menuBox = React.useState(null)
        var menuPath = menuBox[0]
        var setMenuPath = menuBox[1]
        var closingBox = React.useState(null)
        var closingPath = closingBox[0]
        var setClosingPath = closingBox[1]
        var queryBox = React.useState('')
        var query = queryBox[0]
        var setQuery = queryBox[1]
        var collapsedBox = React.useState(readCollapsed)
        var collapsed = collapsedBox[0]
        var setCollapsed = collapsedBox[1]
        var viewerBox = React.useState(null)
        var viewer = viewerBox[0]
        var setViewer = viewerBox[1]

        function load() {
          setBusy(true)
          fetch(LIST_PATH + '?limit=500', { credentials: 'include' })
            .then(function (response) {
              return response.json()
            })
            .then(function (body) {
              if (body === null || typeof body !== 'object' || body.ok !== true) throw new Error('unexpected payload')
              var same = lastPayload !== null && lastPayload.generatedAt === body.generatedAt
              lastPayload = body
              if (!same) setData(body)
              setError(null)
            })
            .catch(function (failure) {
              var text = failure !== null && failure !== undefined && failure.message !== undefined ? String(failure.message) : String(failure)
              setError(text)
            })
            .then(function () {
              setBusy(false)
            })
        }

        React.useEffect(function () {
          load()
          var timer = setInterval(function () {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            load()
          }, POLL_MS)
          return function () {
            clearInterval(timer)
          }
        }, [])

        React.useEffect(function () {
          if (menuPath === null) return undefined
          var close = function () {
            closeMenu()
          }
          document.addEventListener('mousedown', close)
          return function () {
            document.removeEventListener('mousedown', close)
          }
        }, [menuPath])

        function closeMenu() {
          var current = menuPath
          if (current === null) return
          setClosingPath(current)
          setMenuPath(null)
          setTimeout(function () {
            setClosingPath(null)
          }, 160)
        }

        function toggleGroup(groupId) {
          var next = {}
          for (var key in collapsed) {
            if (Object.prototype.hasOwnProperty.call(collapsed, key)) next[key] = collapsed[key]
          }
          if (next[groupId] === true) {
            delete next[groupId]
          } else {
            next[groupId] = true
          }
          writeCollapsed(next)
          setCollapsed(next)
        }

        function copyPath(path) {
          setCopied(path)
          try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              navigator.clipboard.writeText(path).catch(function () {})
            }
          } catch (failure) {
            /* clipboard is best effort */
          }
          setTimeout(function () {
            setCopied(function (current) {
              return current === path ? null : current
            })
          }, 1400)
        }

        function openWith(entry, chooser) {
          var route = chooser ? OPEN_WITH_PATH : OPEN_PATH
          fetch(route + '?path=' + encodeURIComponent(entry.path), { method: 'POST', credentials: 'include' }).catch(function () {})
        }

        var files = data !== null && Array.isArray(data.files) ? data.files : []
        var liveFiles = []
        var deletedFiles = []
        for (var liveIndex = 0; liveIndex < files.length; liveIndex += 1) {
          if (files[liveIndex].exists === false) deletedFiles.push(files[liveIndex])
          else liveFiles.push(files[liveIndex])
        }
        var counts = { all: liveFiles.length, write: 0, present: 0 }
        for (var kindIndex = 0; kindIndex < liveFiles.length; kindIndex += 1) {
          var kindFile = liveFiles[kindIndex]
          if (kindFile.kind === 'write') counts.write += 1
          else if (kindFile.kind === 'present') counts.present += 1
        }

        var visible = []
        for (var index = 0; index < files.length; index += 1) {
          var file = files[index]
          if (filter === 'deleted') {
            if (file.exists !== false) continue
          } else {
            if (file.exists === false) continue
            if (filter !== 'all' && file.kind !== filter) continue
          }
          if (typeFilter !== 'all' && file.group !== typeFilter) continue
          if (extFilter !== 'all' && String(file.ext === undefined ? '' : file.ext).toLowerCase() !== extFilter) continue
          if (query !== '') {
            var needle = query.toLowerCase()
            var name = String(file.name || '').toLowerCase()
            var path = String(file.path || '').toLowerCase()
            if (name.indexOf(needle) === -1 && path.indexOf(needle) === -1) continue
          }
          visible.push(file)
        }

        var chips = [
          { id: 'all', label: t('all'), count: counts.all },
          { id: 'write', label: t('write'), count: counts.write },
          { id: 'present', label: t('present'), count: counts.present },
          { id: 'deleted', label: t('deleted'), count: deletedFiles.length },
        ].filter(function (chip) {
          return chip.id === 'all' || chip.count > 0
        })

        var headSummary
        if (error !== null) {
          headSummary = t('errorTitle')
        } else if (data !== null) {
          headSummary = t('summary')
            .replace('{n}', String(counts.all))
            .replace('{m}', String(data.sessionCount))
        } else {
          headSummary = t('loading')
        }

        var GROUP_ORDER = ['image', 'doc', 'sheet', 'slides', 'code', 'config', 'data', 'archive', 'media', 'other']

        var groupCounts = {}
        for (var countIndex = 0; countIndex < files.length; countIndex += 1) {
          var countFile = files[countIndex]
          var countKey = typeof countFile.group === 'string' ? countFile.group : 'other'
          groupCounts[countKey] = (groupCounts[countKey] || 0) + 1
        }

        var extCounts = {}
        for (var extIndex = 0; extIndex < files.length; extIndex += 1) {
          var extFile = files[extIndex]
          var extKey = String(extFile.ext === undefined ? '' : extFile.ext).toLowerCase()
          if (extKey === '') continue
          extCounts[extKey] = (extCounts[extKey] || 0) + 1
        }
        var extOptions = Object.keys(extCounts).sort(function (left, right) {
          var delta = extCounts[right] - extCounts[left]
          return delta !== 0 ? delta : left < right ? -1 : left > right ? 1 : 0
        })

        function groupLabel(id) {
          if (id === 'image') return t('groupImage')
          if (id === 'doc') return t('groupDoc')
          if (id === 'sheet') return t('groupSheet')
          if (id === 'slides') return t('groupSlides')
          if (id === 'code') return t('groupCode')
          if (id === 'config') return t('groupConfig')
          if (id === 'data') return t('groupData')
          if (id === 'archive') return t('groupArchive')
          if (id === 'media') return t('groupMedia')
          return t('groupOther')
        }

        function extLabel(entry) {
          var ext = typeof entry.ext === 'string' ? entry.ext.replace('.', '') : ''
          return ext === '' ? t('file') : ext.toUpperCase()
        }

        function convLine(entry) {
          if (!Array.isArray(entry.sessions) || entry.sessions.length === 0) return null
          var first = entry.sessions[0]
          if (first === null || typeof first !== 'object') return null
          var title = typeof first.title === 'string' && first.title !== '' ? first.title : ''
          if (title === '') return null
          var extra = entry.sessions.length > 1 ? ' +' + String(entry.sessions.length - 1) : ''
          return h('div', { className: 'cf-card-conv', title: title }, t('from').replace('{title}', title) + extra)
        }

        /** Changes whenever the file is rewritten, so the browser refetches its preview. */
        function thumbVersion(entry) {
          return encodeURIComponent(String(entry.size === undefined ? '' : entry.size) + '-' + String(entry.lastTime === undefined ? '' : entry.lastTime))
        }

        function postJson(route, path) {
          return fetch(route + '?path=' + encodeURIComponent(path), { method: 'POST', credentials: 'include' }).then(function (response) {
            return response.json()
          })
        }

        function runAction(entry, route) {
          closeMenu()
          postJson(route, entry.path).catch(function () {})
        }

        function trashEntry(entry) {
          closeMenu()
          var confirmed = true
          try {
            if (typeof window !== 'undefined' && typeof window.confirm === 'function') confirmed = window.confirm(t('confirmTrash'))
          } catch (failure) {
            confirmed = true
          }
          if (confirmed !== true) return
          postJson(TRASH_PATH, entry.path)
            .then(function () {
              setTimeout(load, 900)
            })
            .catch(function () {})
        }

        function menuButton(entry) {
          return h(
            'button',
            {
              type: 'button',
              className: 'cf-card-menu-btn',
              'aria-label': t('menuActions'),
              title: t('menuActions'),
              onMouseDown: function (event) {
                if (event !== null && event !== undefined && typeof event.stopPropagation === 'function') event.stopPropagation()
              },
              onClick: function (event) {
                if (event !== null && event !== undefined && typeof event.stopPropagation === 'function') event.stopPropagation()
                if (menuPath === entry.path) closeMenu()
                else setMenuPath(entry.path)
              },
            },
            menuIcon(14),
          )
        }

        function cardMenu(entry) {
          var isOpen = menuPath === entry.path
          var isClosing = closingPath === entry.path
          if (!isOpen && !isClosing) return null
          var items = [
            { id: 'default', label: t('menuDefault'), run: function () { runAction(entry, OPEN_PATH) } },
            { id: 'choose', label: t('menuChoose'), run: function () { runAction(entry, OPEN_WITH_PATH) } },
            { id: 'reveal', label: t('menuReveal'), run: function () { runAction(entry, REVEAL_PATH) } },
            { id: 'trash', label: t('menuTrash'), danger: true, run: function () { trashEntry(entry) } },
          ]
          return h(
            'div',
            {
              key: 'menu',
              className: 'cf-card-menu',
              'data-closing': isClosing ? 'true' : 'false',
              onMouseDown: function (event) {
                if (event !== null && event !== undefined && typeof event.stopPropagation === 'function') event.stopPropagation()
              },
              onClick: function (event) {
                if (event !== null && event !== undefined && typeof event.stopPropagation === 'function') event.stopPropagation()
              },
            },
            items.map(function (item) {
              return h(
                'button',
                {
                  key: item.id,
                  type: 'button',
                  className: 'cf-menu-item',
                  'data-danger': item.danger === true ? 'true' : 'false',
                  onClick: function (event) {
                    if (event !== null && event !== undefined && typeof event.stopPropagation === 'function') event.stopPropagation()
                    item.run()
                  },
                },
                item.label,
              )
            }),
          )
        }

        function cardOf(entry) {
          var isCopied = copied === entry.path
          var metaBits = []
          var sizeLabel = formatBytes(entry.size)
          var timeLabel = formatTime(entry.lastTime)
          if (entry.count > 1) metaBits.push('×' + entry.count)
          if (sizeLabel !== '') metaBits.push(sizeLabel)
          if (timeLabel !== '') metaBits.push(timeLabel)

          var thumb
          if (entry.group === 'image') {
            var thumbChildren = [h('span', { className: 'cf-thumb-fallback' }, kindIcon(entry.kind, 26))]
            if (entry.exists !== false) {
              thumbChildren.push(
                h('img', {
                  className: 'cf-thumb-img',
                  src: THUMB_PATH + '?path=' + encodeURIComponent(entry.path) + '&v=' + thumbVersion(entry),
                  alt: '',
                  loading: 'lazy',
                  onError: function (event) {
                    if (event !== null && event !== undefined && event.target !== null && event.target !== undefined) {
                      event.target.style.display = 'none'
                    }
                  },
                }),
              )
            }
            thumbChildren.push(h('span', { className: 'cf-thumb-tag' }, extLabel(entry)))
            thumb = h('div', { className: 'cf-thumb' }, thumbChildren)
          } else if (canPreviewDoc(entry)) {
            thumb = h(DocThumb, { path: entry.path, label: extLabel(entry), kind: entry.kind, version: thumbVersion(entry) })
          } else if (canPreviewText(entry)) {
            thumb = h(TextThumb, { path: entry.path, label: extLabel(entry), kind: entry.kind, ext: entry.ext })
          } else {
            thumb = h(
              'div',
              { className: 'cf-thumb cf-thumb-file' },
              h('span', { className: 'cf-ext' }, extLabel(entry)),
              h('span', { className: 'cf-thumb-kind' }, kindIcon(entry.kind, 14)),
              h('span', { className: 'cf-thumb-tag' }, extLabel(entry)),
            )
          }

          return h(
            'div',
            {
              key: entry.path,
              className: 'cf-card',
              'data-copied': isCopied ? 'true' : 'false',
              title: t('openHint') + ' · ' + entry.path,
              onClick: function (item) {
                return function () {
                  openWith(item, false)
                }
              }(entry),
            },
            thumb,
            h('div', { className: 'cf-card-name', 'data-missing': entry.exists === false ? 'true' : 'false', title: entry.name }, entry.name),
            entry.exists === false ? h('div', { className: 'cf-card-deleted' }, t('deleted')) : null,
            convLine(entry),
            h('div', { className: 'cf-card-meta' }, isCopied ? t('copied') : metaBits.join(' · ')),
            menuButton(entry),
            cardMenu(entry),
          )
        }

        var buckets = {}
        for (var bucketIndex = 0; bucketIndex < visible.length; bucketIndex += 1) {
          var bucketFile = visible[bucketIndex]
          var bucketKey = typeof bucketFile.group === 'string' ? bucketFile.group : 'other'
          if (buckets[bucketKey] === undefined) buckets[bucketKey] = []
          buckets[bucketKey].push(bucketFile)
        }
        var sections = []
        for (var groupIndex = 0; groupIndex < GROUP_ORDER.length; groupIndex += 1) {
          var groupId = GROUP_ORDER[groupIndex]
          var members = buckets[groupId]
          if (members === undefined || members.length === 0) continue
          var cards = []
          for (var cardIndex = 0; cardIndex < members.length; cardIndex += 1) cards.push(cardOf(members[cardIndex]))
          var isCollapsed = collapsed[groupId] === true
          sections.push(
            h(
              'section',
              { key: groupId, className: 'cf-group', 'data-collapsed': isCollapsed ? 'true' : 'false' },
              h(
                'div',
                {
                  className: 'cf-group-head',
                  role: 'button',
                  tabIndex: 0,
                  title: isCollapsed ? t('expandHint') : t('collapseHint'),
                  'aria-expanded': isCollapsed ? 'false' : 'true',
                  onClick: function (gid) {
                    return function () {
                      toggleGroup(gid)
                    }
                  }(groupId),
                  onKeyDown: function (gid) {
                    return function (event) {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        toggleGroup(gid)
                      }
                    }
                  }(groupId),
                },
                h('span', { className: 'cf-group-caret' }, caretIcon(12)),
                h('span', { className: 'cf-group-name' }, groupLabel(groupId)),
                h('span', { className: 'cf-group-count' }, String(members.length)),
              ),
              h(
                'div',
                { className: 'cf-group-body', 'data-collapsed': isCollapsed ? 'true' : 'false' },
                h('div', { className: 'cf-grid-wrap' }, h('div', { className: 'cf-grid' }, cards)),
              ),
            ),
          )
        }

        if (viewer !== null) {
          return h(
            'div',
            { className: 'cf-panel' },
            h(FileViewer, {
              entry: viewer,
              version: thumbVersion(viewer),
              t: t,
              onClose: function () {
                setViewer(null)
              },
            }),
          )
        }

        var body
        if (error !== null) {
          body = h(
            'div',
            { className: 'cf-empty' },
            h('div', { className: 'cf-empty-icon', style: { color: 'var(--dsw-alias-state-error-primary)' } }, kindIcon('other', 34)),
            h('div', { className: 'cf-empty-title' }, t('errorTitle')),
            h('div', { className: 'cf-error' }, error),
            h('button', { type: 'button', className: 'cf-retry', onClick: load }, t('retry')),
          )
        } else if (data === null) {
          body = h('div', { className: 'cf-empty' }, h('div', { className: 'cf-empty-title' }, t('loading')))
        } else if (visible.length === 0) {
          body = h(
            'div',
            { className: 'cf-empty' },
            h('div', { className: 'cf-empty-icon' }, folderIcon(34)),
            h('div', { className: 'cf-empty-title' }, t('emptyTitle')),
            h('div', { className: 'cf-empty-hint' }, t('emptyHint')),
          )
        } else {
          body = sections
        }

        var footLeft = ''
        if (data !== null && typeof data.generatedAt === 'number') footLeft = formatTime(data.generatedAt)

        return h(
          'div',
          { className: 'cf-panel' },
          h(
            'div',
            { className: 'cf-head' },
            h(
              'div',
              { className: 'cf-head-main' },
              h('div', { className: 'cf-title' }, t('title')),
              h('div', { className: 'cf-sub' }, headSummary),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'cf-refresh',
                'data-busy': busy ? 'true' : 'false',
                title: t('refresh'),
                'aria-label': t('refresh'),
                onClick: load,
              },
              refreshIcon(15),
            ),
          ),
          data !== null
            ? h(
                'div',
                { className: 'cf-toolbar' },
                chips.map(function (chip) {
                  return h(
                    'button',
                    {
                      key: chip.id,
                      type: 'button',
                      className: 'cf-chip',
                      'data-kind': chip.id === 'all' ? undefined : chip.id,
                      'data-active': filter === chip.id ? 'true' : 'false',
                      onClick: function () {
                        setFilter(chip.id)
                      },
                    },
                    chip.label,
                    h('span', { className: 'cf-chip-count' }, String(chip.count)),
                  )
                }),
                h(
                  'select',
                  {
                    className: 'cf-select',
                    value: typeFilter,
                    'aria-label': t('typeAll'),
                    onChange: function (event) {
                      setTypeFilter(event.target.value)
                    },
                  },
                  h('option', { key: 'all', value: 'all' }, t('typeAll')),
                  GROUP_ORDER.map(function (groupId) {
                    var groupCount = groupCounts[groupId] || 0
                    if (groupCount === 0) return null
                    return h('option', { key: groupId, value: groupId }, groupLabel(groupId) + ' (' + String(groupCount) + ')')
                  }),
                ),
                h(
                  'select',
                  {
                    className: 'cf-select cf-select-ext',
                    value: extFilter,
                    'aria-label': t('extAll'),
                    onChange: function (event) {
                      setExtFilter(event.target.value)
                    },
                  },
                  h('option', { key: 'all', value: 'all' }, t('extAll')),
                  extOptions.map(function (extKey) {
                    return h('option', { key: extKey, value: extKey }, extKey.replace('.', '').toUpperCase() + ' (' + String(extCounts[extKey]) + ')')
                  }),
                ),
                h('input', {
                  className: 'cf-search',
                  type: 'search',
                  value: query,
                  placeholder: t('search'),
                  'aria-label': t('search'),
                  onChange: function (event) {
                    setQuery(event.target.value)
                  },
                }),
              )
            : null,
          h('div', { className: 'cf-list' }, body),
          h(
            'div',
            { className: 'cf-foot' },
            h(
              'span',
              { className: 'cf-foot-id' },
              data === null ? t('loading') : data.stale === true ? footLeft + ' · ' + t('refreshing') : footLeft,
            ),
            h('span', null, t('foot')),
          ),
        )
      }
    }

    function makeSidebarIcon(ctx) {
      return function GeneratedFilesEntry(props) {
        var size = props !== null && typeof props === 'object' && typeof props.size === 'number' ? props.size : 20
        return folderIcon(size)
      }
    }

    function apply(ctx) {
      ensureStyle()


      var t = ctx.locale.bind(NS)

      ctx.effect(
        function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        },
        'dsh-conversation-files: dictionaries',
      )

      ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: ID,
            order: 50,
            label: function () {
              return t('title')
            },
            locale: NS,
          },
          makeSidebarIcon(ctx),
        )
      })

      ctx.slots.inject('main', function () {
        return ctx.slots.register(
          {
            name: 'main',
            key: ID,
            locale: NS,
          },
          makePanel(ctx),
        )
      })
    }

    module.exports = { apply: apply, inject: inject }
    return module.exports
  },
})
