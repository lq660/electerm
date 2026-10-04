import resolve from '../../common/resolve.js'
import sanitizeFilename from '../../common/sanitize-filename.js'

// 2026-09-04 coder(lq): Keep drop destination resolution shared so blank-space drops stay in the visible directory.
export const resolveDropDestination = file => {
  if (!file?.name) {
    return file?.path || ''
  }
  return resolve(file.path, sanitizeFilename(file.name))
}
