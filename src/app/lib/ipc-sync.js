/**
 * ipc main
 */

const {
  shell,
  clipboard
} = require('electron')
const log = require('../common/log')
const constants = require('../common/runtime-constants')
const windowMove = require('./window-drag-move.js')
const globalState = require('./glob-state')
const { transferKeys } = require('../server/transfer')
const os = require('os')
const {
  isTest
} = require('../common/app-props')
const {
  getScreenSize
} = require('./window-control')
const _ = require('./lodash.js')
const { getStorageKey } = require('./storage-key')

const SFTP_CLIPBOARD_FORMAT = 'application/x-electerm-sftp-transfer'

const isMaximized = () => {
  const {
    width: widthMax,
    height: heightMax,
    x: sx,
    y: sy
  } = getScreenSize()
  const win = globalState.get('win')
  const { width, height, x, y } = win.getBounds()
  return widthMax === width &&
    heightMax === height &&
    x === sx &&
    y === sy
}

module.exports = {
  getStorageKey,
  nodePtyCheck: () => {
    try {
      return !!require('node-pty')
    } catch (err) {
      log.error('Failed to load node-pty:', err)
      return false
    }
  },
  windowMove,
  readClipboard: () => {
    return clipboard.readText()
  },
  writeClipboard: str => {
    clipboard.writeText(str)
  },
  readSftpClipboard: () => {
    try {
      if (!clipboard.availableFormats().includes(SFTP_CLIPBOARD_FORMAT)) {
        return null
      }
      const raw = clipboard.readBuffer(SFTP_CLIPBOARD_FORMAT).toString('utf8')
      if (!raw) {
        return null
      }
      return JSON.parse(raw)
    } catch (err) {
      return null
    }
  },
  writeSftpClipboard: payload => {
    try {
      // 2026-09-04 coder(lq): Keep SFTP clipboard metadata in a custom system clipboard format so other windows can paste with terminal context.
      clipboard.writeText(payload?.text || '')
      clipboard.writeBuffer(
        SFTP_CLIPBOARD_FORMAT,
        Buffer.from(JSON.stringify(payload || {}), 'utf8')
      )
      return true
    } catch (err) {
      log.error('writeSftpClipboard failed', err)
      return false
    }
  },
  resolve: (...args) => require('path').resolve(...args),
  join: (...args) => require('path').join(...args),
  basename: (...args) => require('path').basename(...args),
  showItemInFolder: (href) => {
    shell.showItemInFolder(href)
  },
  openExternal: (url) => {
    shell.openExternal(url)
  },
  getArgs: () => {
    return globalState.get('rawArgs')
  },
  shouldAuth: () => globalState.get('requireAuth'),
  getLoadTime: () => {
    return globalState.get('loadTime')
      ? { loadTime: globalState.get('loadTime') }
      : { initTime: globalState.get('initTime') }
  },
  setLoadTime: (loadTime) => {
    globalState.set('loadTime', loadTime)
  },
  getInitTime: () => {
    return globalState.get('initTime')
  },
  isMaximized,
  isSecondInstance: () => {
    return isTest ? false : globalState.get('isSecondInstance')
  },
  osInfo: () => {
    return Object.keys(os).map((k, i) => {
      const vf = os[k]
      if (!_.isFunction(vf)) {
        return null
      }
      let v
      try {
        v = vf()
      } catch (e) {
        return null
      }
      if (!v) {
        return null
      }
      v = JSON.stringify(v, null, 2)
      return { k, v }
    }).filter(d => d)
  },
  getConstants: () => {
    return {
      sep: require('path').sep,
      ...constants,
      versions: JSON.stringify(process.versions),
      transferKeys,
      fsFunctions: [
        'run',
        'runWinCmd',
        'access',
        'statAsync',
        'lstatAsync',
        'cp',
        'mv',
        'mkdir',
        'touch',
        'chmod',
        'rename',
        'unlink',
        'rmrf',
        'readdirAsync',
        'readFile',
        'readFileAsBase64',
        'writeFile',
        'openFile',
        'zipFolder',
        'unzipFile',
        'extractArchive',
        'readCustom',
        'exists',
        'readdir',
        'mkdir',
        'realpath',
        'statCustom',
        'openCustom',
        'closeCustom',
        'writeCustom',
        'getFolderSize'
      ]
    }
  }
}
