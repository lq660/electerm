const {
  BrowserWindow
} = require('electron')
const { resolve } = require('path')
const {
  isDev, packInfo, iconPath, isMac,
  minWindowWidth, minWindowHeight
} = require('../common/runtime-constants')
const defaults = require('../common/default-setting')
const {
  getWindowSize,
  getScreenSize,
  setWindowPos
} = require('./window-control')
const { onClose } = require('./on-close')
const { initIpc, initAppServer } = require('./ipc')
const { disableShortCuts } = require('./key-bind')
const _ = require('./lodash.js')
const getPort = require('./get-port')
const globalState = require('./glob-state')
const webviewHandler = require('./webview-handler')
const log = require('../common/log')

function escapeHtml (value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char])
}

function getStartupErrorPage (error) {
  const detail = escapeHtml(error?.message || error)
  return `<!doctype html><meta charset="utf-8"><title>云舵工作台启动失败</title>
    <style>body{margin:0;background:#f4f7fb;color:#1f2937;font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{max-width:680px;margin:12vh auto;padding:32px;border:1px solid #d7e0ec;border-radius:16px;background:#fff;box-shadow:0 12px 36px rgba(38,63,91,.12)}h1{font-size:22px;margin:0 0 12px}p{line-height:1.7;color:#64748b}code{display:block;padding:14px;border-radius:10px;background:#f6f8fb;color:#b42318;white-space:pre-wrap;word-break:break-word}</style>
    <main class="card"><h1>后台服务启动失败</h1><p>云舵无法完成初始化，请重启应用。如果问题持续出现，请保留下方信息以便排查。</p><code>${detail}</code></main>`
}

exports.createWindow = async function (userConfig) {
  globalState.set('closeAction', 'closeApp')
  globalState.set('requireAuth', !!userConfig.hashedPassword)
  const { width, height, x, y } = await getWindowSize()
  const { useSystemTitleBar = defaults.useSystemTitleBar } = userConfig
  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    fullscreenable: true,
    minWidth: minWindowWidth,
    minHeight: minWindowHeight,
    title: packInfo.productName || packInfo.name,
    frame: useSystemTitleBar,
    transparent: !useSystemTitleBar,
    // 2026-07-04 coder(lq): Match the light China workbench shell so uncovered window edges never show dark borders.
    backgroundColor: '#f4f7fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      preload: resolve(__dirname, '../preload/preload.js'),
      webviewTag: true,
      devTools: !userConfig.disableDeveloperTool,
      spellcheck: false
    },
    titleBarStyle: useSystemTitleBar ? 'default' : 'hidden',
    icon: iconPath
  })
  // 2026-08-30 coder(lq): Reset the Electron web contents scale on every window creation.
  win.webContents.setZoomFactor(1)
  // hides the traffic lights
  if (isMac) {
    win.setWindowButtonVisibility(true)
  }

  win.webContents.session.setSpellCheckerDictionaryDownloadURL('https://00.00/')

  webviewHandler.init(win)

  globalState.set('win', win)
  const maximizeWorkbenchWindow = () => {
    if (win.isDestroyed()) {
      return
    }
    const bounds = getScreenSize()
    if (bounds.width >= minWindowWidth && bounds.height >= minWindowHeight) {
      win.setBounds(bounds)
    }
    if (!win.isMaximized()) {
      win.maximize()
    }
  }
  // Cloud workbench is a desktop workspace; start maximized instead of restoring a cramped session size.
  maximizeWorkbenchWindow()
  win.once('ready-to-show', maximizeWorkbenchWindow)

  try {
    await initAppServer()
  } catch (error) {
    // 2026-10-04 coder(lq): Surface service startup failures in the window instead of leaving an empty shell with no recovery guidance.
    log.error('background service startup failed', error)
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(getStartupErrorPage(error))}`
    await win.loadURL(dataUrl)
    return win
  }
  initIpc()
  const port = isDev
    ? process.env.devPort || 5570
    : await getPort()
  const opts = `http://127.0.0.1:${port}/index.html?v=${packInfo.version}`
  // 2026-07-06 coder(lq): Local preview rebuilds keep the same asset version, so clear Electron HTTP cache before loading the app.
  await win.webContents.session.clearCache()
  // If loading the URL fails (e.g. proxy/firewall interference), show error page
  win.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load app URL:', errorCode, errorDescription)
    const htmlContent = require('./error-page')(port)
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
    win.loadURL(dataUrl)
  })
  win.loadURL(opts)
  win.webContents.once('dom-ready', () => {
    maximizeWorkbenchWindow()
    if (isDev && process.env.ELECTERM_OPEN_DEVTOOLS === '1' && !userConfig.disableDeveloperTool) {
      win.webContents.openDevTools()
    }
    win.on('unmaximize', () => {
      const { width, height } = win.getBounds()
      if (width < minWindowWidth || height < minWindowHeight) {
        win.setBounds({
          x: 0,
          y: 0,
          width: minWindowWidth,
          height: minWindowHeight
        })
        win.center()
      }
    })
    win.on('resize', _.debounce(() => {
      if (!win.isMaximized()) {
        globalState.set('oldRectangle', win.getBounds())
      }
    }, 200))
    win.on('move', _.debounce(() => {
      const { x, y } = win.getBounds()
      setWindowPos({ x, y })
    }, 100))

    win.on('focus', () => {
      win.webContents.send('focused', null)
    })
    win.on('blur', () => {
      win.webContents.send('blur', null)
    })
    disableShortCuts(win)
  })
  win.on('close', onClose)
}
