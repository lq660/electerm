const commonLogNames = new Set([
  'nohup.out',
  'catalina.out',
  'stdout',
  'stderr',
  'syslog',
  'messages',
  'access_log',
  'error_log'
])

// 2026-09-22 coder(lq): Keep log recognition conservative because clearing a falsely matched file is irreversible.
export function isLogFileName (name) {
  const normalized = String(name || '').trim().toLowerCase()
  if (!normalized) {
    return false
  }
  return commonLogNames.has(normalized) ||
    /\.(?:log|out|err|trace)(?:\.\d+)?$/.test(normalized)
}

export function isClearableLogFile (file) {
  return Boolean(
    file &&
    file.id &&
    !file.isDirectory &&
    !file.isEmpty &&
    !file.isParent &&
    isLogFileName(file.name)
  )
}
