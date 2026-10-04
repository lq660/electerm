/**
 * Archive file helpers used by the SFTP context menu.
 */

const ARCHIVE_EXTENSIONS = [
  '.zip',
  '.tar',
  '.tar.gz',
  '.tgz',
  '.tar.bz2',
  '.tbz2',
  '.tar.xz',
  '.txz',
  '.7z',
  '.rar'
]

export const isArchiveFile = (name = '') => {
  const value = String(name).toLowerCase()
  return ARCHIVE_EXTENSIONS.some(ext => value.endsWith(ext))
}

// 2026-09-03 coder(lq): Keep extracted entries isolated under a directory named after the archive.
export const getArchiveExtractName = (name = '') => {
  const value = String(name)
  const lower = value.toLowerCase()
  const extension = ARCHIVE_EXTENSIONS.find(ext => lower.endsWith(ext))
  if (!extension) {
    return value
  }
  const baseName = value.slice(0, -extension.length)
  return baseName || value
}

export const archiveExtensions = ARCHIVE_EXTENSIONS
