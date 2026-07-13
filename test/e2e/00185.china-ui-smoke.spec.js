const { _electron: electron, test, expect } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appOptions = require('./common/app-options')

test.describe('China workbench UI smoke test', () => {
  test('opens primary pages and routes commands to the selected child terminal', async () => {
    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    await client.waitForSelector('.cn-workbench-home')

    const addSessionButton = client.locator('.tabs-add-btn').first()
    await addSessionButton.click()
    const serverSelector = client.locator('.add-menu-wrap')
    await expect(serverSelector).toContainText('选择服务器')
    await expect(serverSelector).toContainText('点击已保存的服务器，直接打开连接')
    const serverSelectorBox = await serverSelector.boundingBox()
    expect(serverSelectorBox.width).toBeGreaterThanOrEqual(420)
    expect(serverSelectorBox.height).toBeGreaterThanOrEqual(440)
    await expect(serverSelector.getByRole('button', { name: '添加服务器' })).toBeVisible()
    await expect(serverSelector.locator('.cn-quick-connect-bar')).toHaveCount(0)
    await expect(serverSelector.getByText('AI 生成连接')).toHaveCount(0)
    await client.keyboard.press('Escape')

    await expect(client.locator('.cn-side-icon-menu .anticon-appstore')).toBeVisible()
    await expect(client.locator('.cn-side-icon-theme, .cn-side-icon-setting, .cn-side-icon-sync, .cn-side-icon-tools')).toHaveCount(0)
    const resourceEntry = client.locator('.cn-side-icon-server')
    await resourceEntry.hover()
    await expect(client.getByRole('tooltip')).toContainText('服务器资源')

    await expect(client.locator('.cn-side-icon-transfer')).toBeVisible()
    await client.locator('.cn-side-icon-transfer').click()
    await expect(client.locator('.cn-transfer-side-panel')).toContainText('暂无传输任务')
    await client.evaluate(() => window.store.setOpenedSideBar(''))

    const managementEntry = client.locator('.cn-side-icon-manage')
    const managementMenu = client.locator('.cn-sidebar-manage-menu')
    await managementEntry.click()
    await expect(managementMenu).toContainText('配置管理')
    await expect(managementMenu).toContainText('扩展能力')
    await managementMenu.getByText('系统设置', { exact: true }).click()
    await expect(client.locator('.cn-setting-header')).toContainText('设置中心')
    await expect(client.locator('input[placeholder="搜索名称或关键词"]')).toBeVisible()
    await client.evaluate(() => window.store.hideSettingModal())

    await client.evaluate(() => window.store.onNewSsh())
    await expect(client.locator('.cn-bookmark-form-title')).toContainText('新建服务器连接')
    await expect(client.getByRole('button', { name: '测试连接' })).toBeVisible()
    const newServerButton = client.getByRole('button', { name: '新建服务器', exact: true })
    await newServerButton.hover()
    await expect(client.getByRole('tooltip')).toContainText('新建服务器')
    await client.evaluate(() => window.store.hideSettingModal())

    await managementEntry.click()
    await managementMenu.getByText('终端主题', { exact: true }).click()
    await expect(client.locator('.cn-setting-header')).toContainText('终端主题')
    await client.evaluate(() => window.store.hideSettingModal())

    await managementEntry.click()
    await managementMenu.getByText('数据同步', { exact: true }).click()
    await expect(client.locator('.cn-setting-header')).toContainText('设置中心')
    await expect(client.locator('.item-list-unit.active')).toContainText('设置同步')
    await client.evaluate(() => window.store.hideSettingModal())

    await managementEntry.click()
    await managementMenu.getByText('扩展工具', { exact: true }).click()
    await expect(client.locator('.cn-setting-header')).toContainText('工具面板')
    await client.evaluate(() => window.store.hideSettingModal())

    await client.evaluate(() => window.store.openAbout())
    await expect(client.locator('.info-modal')).toContainText('云舵工作台')
    await client.evaluate(() => { window.store.showInfoModal = false })

    await client.evaluate(() => window.store.addTab())
    await client.waitForSelector('.cn-terminal-session-tabs')
    const ownerTabId = await client.evaluate(() => window.store.activeTabId)
    await client.locator('.cn-terminal-session-tabs button.add').first().click()
    await expect(client.getByRole('button', { name: /终端 1/ })).toBeVisible()

    const childTarget = await client.evaluate((ownerId) => {
      const childId = window.store.activeTerminalIds[ownerId]
      const owner = window.refs.get('term-' + ownerId)
      const child = window.refs.get('term-' + childId)
      window.__commandTarget = ''
      owner.runQuickCommand = () => { window.__commandTarget = ownerId }
      child.runQuickCommand = () => { window.__commandTarget = childId }
      window.store.runQuickCommand('echo child')
      return {
        childId,
        target: window.__commandTarget
      }
    }, ownerTabId)
    expect(childTarget.target).toBe(childTarget.childId)

    await client.locator('.cn-terminal-session-tabs button.fixed').first().click()
    const defaultTarget = await client.evaluate((ownerId) => {
      window.__commandTarget = ''
      window.store.runQuickCommand('echo default')
      return window.__commandTarget
    }, ownerTabId)
    expect(defaultTarget).toBe(ownerTabId)

    await electronApp.close()
  })

  test('previews and imports an Xshell connection from the resource toolbar', async () => {
    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    const importedTitle = `xshell-import-${Date.now()}`
    const importFile = path.join(os.tmpdir(), `${importedTitle}.xsh`)
    let preexistingGroupId = ''
    fs.writeFileSync(importFile, [
      '[CONNECTION]',
      'Host=192.0.2.80',
      'Port=2222',
      'Protocol=SSH',
      '[CONNECTION:AUTHENTICATION]',
      'UserName=deploy',
      'Password=encrypted-value'
    ].join('\r\n'))

    try {
      await client.waitForSelector('.cn-workbench-home')
      preexistingGroupId = await client.evaluate(() => {
        return window.store.bookmarkGroups.find(item => item.title === 'Xshell 导入')?.id || ''
      })
      await electronApp.evaluate(({ ipcMain }, filePath) => {
        ipcMain.removeHandler('show-open-dialog-sync')
        ipcMain.handle('show-open-dialog-sync', async () => [filePath])
      }, importFile)
      await client.evaluate(() => {
        window.store.onNewSsh()
      })

      await client.getByLabel('导入服务器资源', { exact: true }).click({ timeout: 5000 })
      const modal = client.locator('.connection-import-modal')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Xshell')
      await expect(modal).toContainText(importedTitle)
      await expect(modal).toContainText('需补充凭据')
      await expect(modal.getByText('跳过已有连接')).toBeVisible()

      await modal.getByRole('button', { name: /导入所选连接/ }).click()
      await expect(modal).toBeHidden()

      const imported = await client.evaluate((title) => {
        const bookmark = window.store.bookmarks.find(item => item.title === title)
        const group = window.store.bookmarkGroups.find(item => item.title === 'Xshell 导入')
        return {
          bookmark: bookmark && {
            host: bookmark.host,
            port: bookmark.port,
            username: bookmark.username,
            hasPassword: Boolean(bookmark.password)
          },
          inGroup: Boolean(bookmark && group?.bookmarkIds?.includes(bookmark.id))
        }
      }, importedTitle)
      expect(imported).toEqual({
        bookmark: {
          host: '192.0.2.80',
          port: 2222,
          username: 'deploy',
          hasPassword: false
        },
        inGroup: true
      })
    } finally {
      await client.evaluate(({ title, previousGroupId }) => {
        const bookmark = window.store.bookmarks.find(item => item.title === title)
        if (bookmark) {
          window.store.delItem(bookmark, 'bookmarks')
          window.store.bookmarkGroups.forEach(group => {
            group.bookmarkIds = (group.bookmarkIds || []).filter(id => id !== bookmark.id)
          })
        }
        const groupIndex = window.store.bookmarkGroups.findIndex(group =>
          group.title === 'Xshell 导入' &&
          group.id !== previousGroupId &&
          !(group.bookmarkIds || []).length &&
          !(group.bookmarkGroupIds || []).length
        )
        if (groupIndex >= 0) {
          window.store.bookmarkGroups.splice(groupIndex, 1)
        }
      }, { title: importedTitle, previousGroupId: preexistingGroupId }).catch(() => {})
      await electronApp.close()
      fs.rmSync(importFile, { force: true })
    }
  })
})
