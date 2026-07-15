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

    log('open terminal before changing theme')
    await client.evaluate(() => window.store.addTab())
    await client.waitForSelector('.session-batch-active .terms-box')
    const terminalBefore = await client.evaluate(() => {
      const terminal = document.querySelector('.session-batch-active .terms-box')
      window.__themeTerminalBefore = terminal
      return window.getComputedStyle(terminal).backgroundColor
    })

    log('open terminal themes')
    await client.evaluate(() => window.store.openTerminalThemes())
    await client.waitForSelector('#terminal-theme-form.cn-theme-form')
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

    log('apply theme by selecting its list row')
    await client.locator(
      '.theme-item',
      { hasText: '默认浅色' }
    ).first().click()
    await delay(500)
    const selectedThemeState = await client.evaluate(() => {
      const terminal = document.querySelector('.session-batch-active .terms-box')
      const terminalRef = Array.from(window.refs.entries())
        .find(([id, ref]) => id.startsWith('term-') && ref.term)?.[1]
      return {
        themeId: window.store.config.theme,
        background: window.getComputedStyle(terminal).backgroundColor,
        xtermTheme: terminalRef?.term?.options?.theme
      }
    })
    expect(selectedThemeState.themeId).equal('defaultLight')
    expect(selectedThemeState.background).equal('rgb(18, 18, 20)')
    expect(selectedThemeState.xtermTheme.foreground).equal('#af9a91')

    await client.locator(
      '.theme-item',
      { hasText: '新主题' }
    ).first().click()
    await client.waitForSelector('.setting-wrap #terminal-theme-form_themeName')

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
        .replace(/^terminal:foreground=.*$/m, 'terminal:foreground=#abcdef')
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

    // 2026-07-13 coder(lq): Theme changes must update the terminal that was already open, not only terminals created afterward.
    const terminalState = await client.evaluate(() => {
      const terminal = document.querySelector('.session-batch-active .terms-box')
      return {
        sameTerminal: terminal === window.__themeTerminalBefore,
        background: window.getComputedStyle(terminal).backgroundColor
      }
    })
    expect(terminalState.sameTerminal).equal(true)
    expect(terminalState.background === terminalBefore).equal(false)
    expect(terminalState.background).equal('rgb(18, 52, 86)')

    log('edit and reapply active theme')
    await client.evaluate(() => {
      const currentTheme = window.store.getSidebarList('terminalThemes')
        .find(item => item.id === window.store.config.theme)
      window.store.setSettingItem(currentTheme)
    })
    await client.waitForSelector('.setting-wrap #terminal-theme-form_themeName')
    const terminalBackgroundSlot = client.locator(
      '.theme-edit-slot',
      { hasText: '终端底色' }
    )
    await terminalBackgroundSlot.locator('.color-picker-choose').click()
    await client.locator(
      '.ant-popover .color-picker-unit',
      { hasText: '#d73a49' }
    ).last().click()
    const terminalForegroundSlot = client.locator(
      '.theme-edit-slot',
      { hasText: '终端文字' }
    )
    await terminalForegroundSlot.locator('.color-picker-choose').click()
    await client.locator(
      '.ant-popover .color-picker-unit',
      { hasText: '#28a745' }
    ).last().click()
    await client.click('.cn-theme-action-row .ant-btn-primary')
    await delay(500)

    const reappliedThemeState = await client.evaluate(() => {
      const terminal = document.querySelector('.session-batch-active .terms-box')
      const currentTheme = window.store.getSidebarList('terminalThemes')
        .find(item => item.id === window.store.config.theme)
      const terminalRef = Array.from(window.refs.entries())
        .find(([id, ref]) => id.startsWith('term-') && ref.term)?.[1]
      return {
        themeId: currentTheme.id,
        configuredBackground: currentTheme.themeConfig.background,
        configuredForeground: currentTheme.themeConfig.foreground,
        sameTerminal: terminal === window.__themeTerminalBefore,
        background: window.getComputedStyle(terminal).backgroundColor,
        xtermTheme: terminalRef?.term?.options?.theme
      }
    })
    expect(reappliedThemeState.themeId).equal(appliedTheme.id)
    expect(reappliedThemeState.configuredBackground).equal('#d73a49')
    expect(reappliedThemeState.configuredForeground).equal('#28a745')
    expect(reappliedThemeState.sameTerminal).equal(true)
    expect(reappliedThemeState.background).equal('rgb(215, 58, 73)')
    expect(reappliedThemeState.xtermTheme.foreground).equal('#28a745')
    expect(reappliedThemeState.xtermTheme.background).equal('rgba(0,0,0,0)')

    await client.evaluate(() => {
      const themeId = window.store.config.theme
      window.store.setTheme('default')
      window.store.delTheme({ id: themeId })
    })
    await electronApp.close().catch(console.log)
  })
})
