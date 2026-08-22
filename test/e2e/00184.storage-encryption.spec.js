const { _electron: electron, test, expect } = require('@playwright/test')
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')
const appOptions = require('./common/app-options')

test.describe('database encryption', () => {
  test('uses local AES-GCM and preserves unreadable encrypted rows', async () => {
    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    await client.waitForSelector('.layout-wrap')

    const inserted = await client.evaluate(() => {
      return window.pre.runGlobalAsync(
        'dbAction',
        'terminalCommandHistory',
        'insert',
        { _id: 'encrypted-test', command: 'echo test' }
      )
    })
    expect(inserted._id).toBe('encrypted-test')

    const dbPath = path.resolve(
      process.env.DATA_PATH,
      'users',
      'default_user',
      'electerm.db'
    )
    let db = new DatabaseSync(dbPath)
    const encryptedRow = db.prepare(
      'SELECT data FROM terminalCommandHistory WHERE _id = ?'
    ).get('encrypted-test')
    expect(encryptedRow.data.startsWith('enc:v3:local:gcm:')).toBe(true)

    const lockedCiphertext = 'enc:v3:local:gcm:invalid-ciphertext'
    db.prepare(
      'INSERT OR REPLACE INTO terminalCommandHistory (_id, data) VALUES (?, ?)'
    ).run('locked-test', lockedCiphertext)
    db.close()

    const lockedRead = await client.evaluate(() => {
      return window.pre.runGlobalAsync(
        'dbAction',
        'terminalCommandHistory',
        'findOne',
        { _id: 'locked-test' }
      )
    })
    expect(lockedRead).toBeNull()

    const storageStatus = await client.evaluate(() => {
      return window.pre.runGlobalAsync('getDbStorageStatus')
    })
    expect(storageStatus.lockedCount).toBe(1)

    const updateError = await client.evaluate(async () => {
      try {
        await window.pre.runGlobalAsync(
          'dbAction',
          'terminalCommandHistory',
          'update',
          { _id: 'locked-test' },
          { $set: { command: 'overwrite' } },
          { upsert: true }
        )
        return ''
      } catch (error) {
        return error.message
      }
    })
    expect(updateError).toContain('锁定')

    db = new DatabaseSync(dbPath, { readOnly: true })
    const preservedRow = db.prepare(
      'SELECT data FROM terminalCommandHistory WHERE _id = ?'
    ).get('locked-test')
    db.close()
    expect(preservedRow.data).toBe(lockedCiphertext)

    const keyPath = path.resolve(
      process.env.DATA_PATH,
      'users',
      'default_user',
      'storage-key.local'
    )
    expect(fs.statSync(keyPath).mode & 0o777).toBe(0o600)
    await electronApp.close()
  })

  test('keeps settings pages usable when unreadable local user config is locked', async () => {
    const dataDbPath = path.resolve(
      process.env.DATA_PATH,
      'users',
      'default_user',
      'electerm_data.db'
    )
    fs.mkdirSync(path.dirname(dataDbPath), { recursive: true })
    const lockedCiphertext = 'enc:v3:local:gcm:invalid-user-config'
    let db = new DatabaseSync(dataDbPath)
    db.exec('CREATE TABLE IF NOT EXISTS data (_id TEXT PRIMARY KEY, data TEXT)')
    db.prepare(
      'INSERT OR REPLACE INTO data (_id, data) VALUES (?, ?)'
    ).run('userConfig', lockedCiphertext)
    db.close()

    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    await client.waitForSelector('.layout-wrap')
    await client.waitForFunction(() => window.store.userConfigSaveLocked)

    const configState = await client.evaluate(async () => {
      window.store.setConfig({ sshReadyTimeout: 12345 })
      await new Promise(resolve => setTimeout(resolve, 200))
      return {
        timeout: window.store.config.sshReadyTimeout,
        saveLocked: window.store.userConfigSaveLocked,
        noticeShown: window.store.userConfigLockedNoticeShown
      }
    })
    expect(configState).toEqual({
      timeout: 12345,
      saveLocked: true,
      noticeShown: false
    })

    await client.evaluate(() => window.store.openTerminalThemes())
    await client.waitForSelector('#terminal-theme-form.cn-theme-form')

    db = new DatabaseSync(dataDbPath, { readOnly: true })
    const preservedRow = db.prepare(
      'SELECT data FROM data WHERE _id = ?'
    ).get('userConfig')
    db.close()
    expect(preservedRow.data).toBe(lockedCiphertext)
    await electronApp.close()
  })
})
