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

  await initAppServer()
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
