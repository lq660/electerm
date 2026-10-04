/**
 * disable some default keyboard shortcuts
 */

const { isMac } = require('../common/runtime-constants')

exports.disableShortCuts = function (win) {
  win.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase()
    const zoomShortcut = (
      (isMac ? input.meta : input.control) &&
      (key === '+' || key === '=' || key === '-' || key === '_' || key === '0' || input.type === 'mouseWheel')
    )
    // 2026-08-30 coder(lq): Prevent Chromium's native zoom shortcuts so the app remains at 100%.
    if (zoomShortcut) {
      event.preventDefault()
      return
    }
    if (
      key === 'r' &&
      (
        (isMac && input.meta) ||
        (!isMac && input.control && input.shift)
      )
    ) {
      event.preventDefault()
    }
  })
}
