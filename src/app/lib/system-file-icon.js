/**
 * Best-effort native file icon lookup.
 *
 * Native icon providers are outside Electron's JavaScript exception boundary;
 * callers must always be able to fall back to an application-provided icon.
 */

const fs = require('fs')
const path = require('path')

// 2026-09-01 coder(lq): Reject paths that cannot safely be passed to a native icon provider.
function isSafeLocalFilePath (filePath) {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) {
    return false
  }
  if (!path.isAbsolute(filePath)) {
    return false
  }
  try {
    return fs.existsSync(filePath)
  } catch (err) {
    return false
  }
}

// 2026-09-01 coder(lq): Keep macOS on stable bundled icons because IconServices can SIGTRAP in Electron.
async function getSystemFileIcon (electronApp, filePath, platform = process.platform) {
  if (platform === 'darwin' || !isSafeLocalFilePath(filePath) ||
    !electronApp || typeof electronApp.getFileIcon !== 'function') {
    return null
  }
  try {
    const icon = await electronApp.getFileIcon(filePath, { size: 'large' })
    if (!icon || (typeof icon.isEmpty === 'function' && icon.isEmpty())) {
      return null
    }
    return typeof icon.toDataURL === 'function' ? icon.toDataURL() : null
  } catch (err) {
    return null
  }
}

module.exports = {
  getSystemFileIcon,
  isSafeLocalFilePath
}
