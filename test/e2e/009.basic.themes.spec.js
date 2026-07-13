const { _electron: electron } = require('@playwright/test')
const {
  test: it
} = require('@playwright/test')
const { describe } = it
it.setTimeout(100000)
const delay = require('./common/wait')
const log = require('./common/log')
const { expect } = require('./common/expect')
const appOptions = require('./common/app-options')
const extendClient = require('./common/client-extend')

describe('terminal themes', function () {
  it('all buttons open proper terminal themes tab', async function () {
    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    extendClient(client, electronApp)
    await delay(3500)

    log('open terminal themes')
    await client.evaluate(() => window.store.openTerminalThemes())
    await client.waitForSelector('.setting-tabs-terminal-themes .cn-theme-form')
    const sel = '.setting-wrap .ant-tabs-nav-list .ant-tabs-tab-active'
    await client.hasElem(sel)
    await delay(500)
    const text = await client.getText(sel)
    expect(text).equal('终端主题')

    const v = await client.getValue('.setting-wrap #terminal-theme-form_themeName')
    const tx = await client.getText('.setting-wrap .item-list-unit.active')
    const txd = await client.getText('.setting-wrap .item-list-unit.current')
    expect(v).equal('新主题')
    expect(tx).equal('新主题')
    expect(txd).equal('默认')

    // create theme
    log('create theme')
    const themePrev = await client.evaluate(() => {
      return window.store.terminalThemes.length
    })
    const themeIterm = await client.evaluate(() => {
      return window.store.itermThemes.length
    })
    await client.click('.cn-theme-toolbar .ant-btn')
    const themeText = client.locator('#terminal-theme-form_themeText')
    const themeValue = await themeText.inputValue()
    await themeText.fill(
      themeValue
        .replace(/^main=.*$/m, 'main=#f5f7fa')
        .replace(/^terminal:background=.*$/m, 'terminal:background=#123456')
    )
    await client.click('.cn-theme-action-row .ant-btn-primary')

    const themeNow = await client.evaluate(() => {
      return window.store.terminalThemes.length
    })
    await delay(1000)
    expect(themeNow).equal(themePrev + 1)
    expect(themeIterm > 10).equal(true)

    const appliedTheme = await client.evaluate(() => {
      return window.store.getSidebarList('terminalThemes')
        .find(item => item.id === window.store.config.theme)
    })
    expect(appliedTheme.uiThemeConfig.main).equal('#f5f7fa')
    expect(appliedTheme.themeConfig.background).equal('#123456')

    await client.evaluate(() => window.store.addTab())
    await client.waitForSelector('.session-batch-active .terms-box')
    const terminalBackground = await client.evaluate(() => {
      const terminal = document.querySelector('.session-batch-active .terms-box')
      return window.getComputedStyle(terminal).backgroundColor
    })
    expect(terminalBackground).equal('rgb(18, 52, 86)')

    await client.evaluate(() => {
      const themeId = window.store.config.theme
      window.store.setTheme('default')
      window.store.delTheme({ id: themeId })
    })
    await electronApp.close().catch(console.log)
  })
})
