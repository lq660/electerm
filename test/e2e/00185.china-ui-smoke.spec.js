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
    // 2026-07-14 coder(lq): Guard the portal search controls against inheriting the active terminal's dark theme.
    const serverSearchWrapper = serverSelector.locator('.ant-input-affix-wrapper').first()
    const serverSearchInput = serverSearchWrapper.locator('input').first()
    const serverSearchButton = serverSelector.locator('.ant-input-search-btn').first()
    await expect(serverSearchWrapper).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(serverSearchWrapper).toHaveCSS('border-top-width', '1px')
    await expect(serverSearchInput).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(serverSearchInput).toHaveCSS('border-top-width', '0px')
    await expect(serverSearchInput).toHaveCSS('color', 'rgb(31, 41, 55)')
    await expect(serverSearchButton).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    const closeServerSelector = serverSelector.getByRole('button', { name: '关闭服务器选择' })
    await expect(closeServerSelector).toBeVisible()
    await expect(serverSelector.getByRole('button', { name: '添加服务器' })).toBeVisible()
    await expect(serverSelector.locator('.cn-quick-connect-bar')).toHaveCount(0)
    await expect(serverSelector.getByText('AI 生成连接')).toHaveCount(0)
    await closeServerSelector.click()
    await expect(serverSelector).toBeHidden()

    await expect(client.locator('.cn-side-icon-menu .cn-yunduo-logo-glyph')).toHaveText('云')
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

  test('previews and imports multiple connection files from the resource toolbar', async () => {
    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    const stamp = Date.now()
    const xshellTitle = `xshell-import-${stamp}`
    const openSshTitle = `openssh-import-${stamp}`
    const targetGroupId = `import-target-${stamp}`
    const targetGroupTitle = `批量导入分组-${stamp}`
    const xshellFile = path.join(os.tmpdir(), `${xshellTitle}.xsh`)
    const openSshFile = path.join(os.tmpdir(), `${openSshTitle}.ssh-config`)
    let preexistingGroupIds = {}
    fs.writeFileSync(xshellFile, [
      '[CONNECTION]',
      'Host=192.0.2.80',
      'Port=2222',
      'Protocol=SSH',
      '[CONNECTION:AUTHENTICATION]',
      'UserName=deploy',
      'Password=encrypted-value'
    ].join('\r\n'))
    fs.writeFileSync(openSshFile, [
      `Host ${openSshTitle}`,
      '  HostName 192.0.2.81',
      '  Port 2200',
      '  User ops'
    ].join('\n'))

    try {
      await client.waitForSelector('.cn-workbench-home')
      preexistingGroupIds = await client.evaluate(() => {
        return Object.fromEntries(['Xshell 导入', 'OpenSSH 导入'].map(title => [
          title,
          window.store.bookmarkGroups.find(item => item.title === title)?.id || ''
        ]))
      })
      await client.evaluate(({ id, title }) => {
        window.store.bookmarkGroups.push({
          id,
          title,
          level: 1,
          color: '#1677ff',
          bookmarkIds: [],
          bookmarkGroupIds: []
        })
      }, { id: targetGroupId, title: targetGroupTitle })
      await electronApp.evaluate(({ ipcMain }, filePaths) => {
        ipcMain.removeHandler('show-open-dialog-sync')
        ipcMain.handle('show-open-dialog-sync', async (event, options) => {
          global.__connectionImportDialogProperties = options.properties
          return filePaths
        })
      }, [xshellFile, openSshFile])
      await client.evaluate(() => {
        window.store.onNewSsh()
      })

      await client.getByLabel('导入服务器资源', { exact: true }).click({ timeout: 5000 })
      const dialogProperties = await electronApp.evaluate(() => {
        return global.__connectionImportDialogProperties
      })
      expect(dialogProperties).toContain('multiSelections')
      const modal = client.locator('.connection-import-modal')
      await expect(modal).toBeVisible()
      await expect(modal).toContainText('Xshell')
      await expect(modal).toContainText('OpenSSH')
      await expect(modal).toContainText('已选择 2 个文件')
      await expect(modal).toContainText(path.basename(xshellFile))
      await expect(modal).toContainText(path.basename(openSshFile))
      await expect(modal).toContainText('需补充凭据')
      await expect(modal.getByText('跳过已有连接')).toBeVisible()
      const groupSelect = modal.locator('.connection-import-group-select')
      await expect(groupSelect).toHaveValue('__preserve_source_groups__')
      await expect(groupSelect.locator('option:checked'))
        .toHaveText('保留文件原分组')
      await groupSelect.selectOption(targetGroupId)
      await expect(groupSelect).toHaveValue(targetGroupId)
      await expect(groupSelect.locator('option:checked'))
        .toHaveText(targetGroupTitle)

      await modal.getByRole('button', { name: /导入所选连接/ }).click()
      await expect(modal).toBeHidden()

      const imported = await client.evaluate((specs) => {
        return specs.map(spec => {
          const bookmark = window.store.bookmarks.find(item => item.title === spec.title)
          const group = window.store.bookmarkGroups.find(item => item.title === spec.groupTitle)
          return {
            bookmark: bookmark && {
              host: bookmark.host,
              port: bookmark.port,
              username: bookmark.username,
              hasPassword: Boolean(bookmark.password)
            },
            inGroup: Boolean(bookmark && group?.bookmarkIds?.includes(bookmark.id))
          }
        })
      }, [
        { title: xshellTitle, groupTitle: targetGroupTitle },
        { title: openSshTitle, groupTitle: targetGroupTitle }
      ])
      expect(imported).toEqual([{
        bookmark: {
          host: '192.0.2.80',
          port: 2222,
          username: 'deploy',
          hasPassword: false
        },
        inGroup: true
      }, {
        bookmark: {
          host: '192.0.2.81',
          port: 2200,
          username: 'ops',
          hasPassword: false
        },
        inGroup: true
      }])
    } finally {
      await client.evaluate(({ titles, previousGroupIds, targetGroupId }) => {
        titles.forEach(title => {
          const bookmark = window.store.bookmarks.find(item => item.title === title)
          if (bookmark) {
            window.store.delItem(bookmark, 'bookmarks')
            window.store.bookmarkGroups.forEach(group => {
              group.bookmarkIds = (group.bookmarkIds || []).filter(id => id !== bookmark.id)
            })
          }
        })
        const targetGroupIndex = window.store.bookmarkGroups.findIndex(group => (
          group.id === targetGroupId
        ))
        if (targetGroupIndex >= 0) {
          window.store.bookmarkGroups.splice(targetGroupIndex, 1)
        }
        const groupTitles = ['Xshell 导入', 'OpenSSH 导入']
        groupTitles.forEach(groupTitle => {
          const groupIndex = window.store.bookmarkGroups.findIndex(group => (
            group.title === groupTitle &&
            group.id !== previousGroupIds[groupTitle] &&
            !(group.bookmarkIds || []).length &&
            !(group.bookmarkGroupIds || []).length
          ))
          if (groupIndex >= 0) {
            window.store.bookmarkGroups.splice(groupIndex, 1)
          }
        })
      }, {
        titles: [xshellTitle, openSshTitle],
        previousGroupIds: preexistingGroupIds,
        targetGroupId
      }).catch(() => {})
      await electronApp.close()
      fs.rmSync(xshellFile, { force: true })
      fs.rmSync(openSshFile, { force: true })
    }
  })
})
