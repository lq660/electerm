// 2026-09-03 coder(lq): Shared parsing keeps terminal and SFTP startup paths consistent.

/**
 * Convert a configured directory value into ordered, unique candidates.
 * Values may be a string (one path per line, comma, or semicolon) or an array.
 */
export function parseStartDirectories (value) {
  const values = Array.isArray(value) ? value : [value]
  const result = []
  values.forEach(item => {
    if (typeof item !== 'string') return
    item.split(/[\n,;]+/).map(path => path.trim()).filter(Boolean).forEach(path => {
      if (!result.includes(path)) result.push(path)
    })
  })
  return result
}

/**
 * Read the new fields while preserving bookmarks using the legacy remote field.
 */
export function getStartDirectoryCandidates (tab = {}, config = {}, type = 'remote', rememberedPath = '') {
  if (type === 'local') {
    return parseStartDirectories(tab.startDirectoryLocal || config.startDirectoryLocal)
  }
  const configured = parseStartDirectories(tab.startDirectoryRemote || tab.startDirectory)
  return configured.length ? configured : (rememberedPath ? [rememberedPath] : [])
}

function directoryMemoryKey (tab, pane) {
  if (!tab.host || !['ssh', 'sftp'].includes(tab.type || 'ssh')) return ''
  return 'last-remote-directory:' + JSON.stringify([tab.host.toLowerCase(), String(tab.port || 22), tab.username || '', pane])
}

export function readLastDirectory (tab, pane, storage = globalThis.localStorage) {
  try {
    const key = directoryMemoryKey(tab, pane)
    return key ? storage.getItem(key) || '' : ''
  } catch {
    return ''
  }
}

export function rememberLastDirectory (tab, pane, path, storage = globalThis.localStorage) {
  // 2026-09-08 coder(lq): Persist only observed absolute directories, separately for shell and SFTP; unavailable storage must not break a connection.
  if (typeof path !== 'string' || !path.startsWith('/')) return
  try {
    const key = directoryMemoryKey(tab, pane)
    if (key) storage.setItem(key, path)
  } catch {}
}
