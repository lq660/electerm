const { _electron: electron, test, expect } = require('@playwright/test')
const appOptions = require('./common/app-options')

test.describe('layout divider', () => {
  test('resizes both workspace panes when dragged', async () => {
    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    await client.waitForSelector('.layout-wrap')

    await client.evaluate(() => window.store.setLayout('c2'))
    const panes = client.locator('.layout-item')
    const divider = client.locator('.layout-handle.vertical')
    await expect(panes).toHaveCount(2)
    await expect(divider).toHaveCount(1)

    const firstBefore = await panes.nth(0).boundingBox()
    const dividerBox = await divider.boundingBox()
    await client.mouse.move(
      dividerBox.x + dividerBox.width / 2,
      dividerBox.y + dividerBox.height / 2
    )
    await client.mouse.down()
    await client.mouse.move(dividerBox.x + 100, dividerBox.y + 20)
    await client.mouse.up()

    const firstAfter = await panes.nth(0).boundingBox()
    expect(firstAfter.width).toBeGreaterThan(firstBefore.width + 50)
    await electronApp.close()
  })
})
