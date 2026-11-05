// Lists the applications macOS can open a file with, best match first.
// Run as: osascript -l JavaScript lib/apps.jxa.js <absolute-path>
function run(argv) {
  ObjC.import('AppKit')
  ObjC.import('Foundation')
  var target = argv[0]
  var workspace = $.NSWorkspace.sharedWorkspace
  var url = $.NSURL.fileURLWithPath(target)
  var out = []
  var seen = {}
  var defaultPath = null
  try {
    var def = workspace.URLForApplicationToOpenURL(url)
    if (def && def.path) defaultPath = String(ObjC.unwrap(def.path))
  } catch (error) {}
  try {
    var apps = workspace.URLsForApplicationsToOpenURL(url)
    if (apps && apps.count !== undefined) {
      for (var i = 0; i < apps.count; i += 1) {
        var item = apps.objectAtIndex(i)
        var path = String(ObjC.unwrap(item.path))
        if (seen[path] === true) continue
        seen[path] = true
        var name = String(ObjC.unwrap($.NSFileManager.defaultManager.displayNameAtPath(path)))
        name = name.replace(/\.app$/i, '')
        out.push({ name: name, path: path, isDefault: path === defaultPath })
      }
    }
  } catch (error) {}
  out.sort(function (a, b) {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return JSON.stringify({ defaultApp: defaultPath, apps: out })
}
