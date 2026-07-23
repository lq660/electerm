let log
try {
  log = require('electron-log')
} catch (err) {
  // 2026-07-22 coder(lq): Some local preview launch paths can make Electron return a null log path; keep the main process alive with a console fallback.
  const write = (level) => (...args) => console[level] ? console[level](...args) : console.log(...args)
  log = {
    transports: {
      console: {},
      file: {}
    },
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error')
  }
  log.warn('electron-log init failed, fallback to console logger:', err)
}
const { isDev } = require('./runtime-constants')

log.transports.console.format = '{h}:{i}:{s} {level} › {text}'

if (!isDev) {
  log.transports.console.level = 'warn'
  log.transports.file.level = 'warn'
}

module.exports = exports.default = log
