const { _electron: electron } = require('@playwright/test')
const {
  test: it
} = require('@playwright/test')
const { expect } = require('./common/expect')
const delay = require('./common/wait')
const log = require('./common/log')
const appOptions = require('./common/app-options')
const extendClient = require('./common/client-extend')
const { describe } = it
it.setTimeout(100000)

describe('workspace', function () {
  it('workspace feature should work properly', async function () {
    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    extendClient(client, electronApp)
    await delay(3500)

    async function openWorkspaceMenu () {
      if (await client.countElem('.cn-workspaces-settings')) {
        return
      }
      if (!(await client.countElem('.cn-setting-header'))) {
        await client.click('.cn-toolbar-actions button:has-text("设置")')
      }
      await client.click('.cn-setting-tabs-all .ant-tabs-tab:has-text("工作区")')
    }

    // 2026-10-04 coder(lq): Workspaces moved from the removed tab dropdown
    // into the current app menu; test the user-visible route.
    log('Test 1: Opening workspace menu')
    await openWorkspaceMenu()
    const workspaceContent = await client.countElem('.cn-workspaces-settings .workspace-menu-content')
    expect(workspaceContent).equal(1)

    log('Test 2: Verifying save button')
    const saveBtn = await client.countElem('.workspace-save-btn button')
    expect(saveBtn).equal(1)

    // Save a non-default layout so restoration verifies the stored layout.
    await client.evaluate(() => window.store.setLayout('c2'))
    log('Test 3: Opening save modal')
    await client.click('.workspace-save-btn button')
    await delay(300)
    const saveModal = await client.countElem('.custom-modal-close')
    expect(saveModal).equal(1)

    log('Test 4: Verifying save modal input')
    const nameInput = await client.countElem('.custom-modal-wrap .ant-input')
    expect(nameInput).greaterThan(0)

    log('Test 5: Saving workspace')
    const workspaceName = 'Test Workspace ' + Date.now()
    await client.setValue('.custom-modal-wrap .ant-input', workspaceName)
    await delay(200)
    await client.click('.custom-modal-wrap .ant-btn-primary')
    await delay(500)

    log('Test 6: Verifying modal closed and state persisted')
    const modalAfterSave = await client.countElem('.custom-modal-close')
    expect(modalAfterSave).equal(0)
    const savedWorkspace = await client.evaluate((name) => {
      const item = window.store.workspaces.find(workspace => workspace.name === name)
      return item && { id: item.id, layout: item.layout }
    }, workspaceName)
    expect(savedWorkspace.layout).equal('c2')

    log('Test 7: Reopening workspace menu')
    await openWorkspaceMenu()
    const workspaceItems = await client.countElem('.workspace-item')
    expect(workspaceItems).greaterThan(0)

    log('Test 8: Testing workspace layout restore')
    await client.evaluate(() => window.store.setLayout('c1'))
    await openWorkspaceMenu()
    await client.click(`.workspace-item:has-text("${workspaceName}")`)
    await delay(500)
    const restoredLayout = await client.evaluate(() => window.store.layout)
    expect(restoredLayout).equal('c2')

    log('Test 9: Testing workspace delete')
    await openWorkspaceMenu()
    const target = client.locator('.workspace-item', { hasText: workspaceName })
    await target.hover()
    await target.locator('.workspace-delete-icon').click()
    await delay(300)
    await client.click('.ant-popconfirm .ant-btn-primary')
    await delay(500)
    const deleted = await client.evaluate((id) => {
      return !window.store.workspaces.some(workspace => workspace.id === id)
    }, savedWorkspace.id)
    expect(deleted).equal(true)

    await electronApp.close().catch(console.log)
  })
})
