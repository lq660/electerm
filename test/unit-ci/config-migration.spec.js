const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')

const configMigrationPath = path.resolve(__dirname, '../../src/app/lib/config-migration.js')

async function withMockedConfigMigration (dbRows, callback) {
  const originalLoad = Module._load
  const appPath = await fs.mkdtemp(path.join(os.tmpdir(), 'electerm-config-migration-'))
  const calls = []
  delete require.cache[configMigrationPath]
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        dialog: {
          showSaveDialog: async () => ({ canceled: true })
        }
      }
    }
    if (request === './db' && parent?.filename === configMigrationPath) {
      return {
        tables: [
          'bookmarks',
          'bookmarkGroups',
          'addressBookmarks',
          'terminalThemes',
          'lastStates',
          'data',
          'quickCommands',
          'log',
          'dbUpgradeLog',
          'profiles',
          'workspaces',
          'history',
          'terminalCommandHistory',
          'aiChatHistory',
          'autoRunWidgets'
        ],
        dbAction: async (name, action, query, data, options) => {
          calls.push({
            name,
            action,
            query,
            data,
            options
          })
          if (action === 'find') {
            return dbRows[name] || []
          }
          if (action === 'remove') {
            dbRows[name] = (dbRows[name] || []).filter(row => row._id !== query._id)
            return 1
          }
          if (action === 'update') {
            const rows = dbRows[name] || []
            const index = rows.findIndex(row => row._id === query._id)
            if (index === -1) {
              rows.push(data)
            } else {
              rows[index] = data
            }
            dbRows[name] = rows
            return 1
          }
          throw new Error(`Unexpected db action: ${action}`)
        }
      }
    }
    if (request === '../common/app-props' && parent?.filename === configMigrationPath) {
      return {
        appPath,
        defaultUserName: 'default_user',
        packInfo: {
          productName: '云舵工作台',
          name: 'electerm',
          version: '0.0.0-test'
        }
      }
    }
    return originalLoad.apply(this, arguments)
  }
  try {
    const migration = require(configMigrationPath)
    await callback(migration, calls)
  } finally {
    Module._load = originalLoad
    delete require.cache[configMigrationPath]
    await fs.rm(appPath, { recursive: true, force: true })
  }
}

test('migration export keeps only selected allowed tables', async () => {
  await withMockedConfigMigration({
    bookmarks: [{ _id: 'bookmark-1', title: 'prod' }],
    data: [{ _id: 'userConfig', theme: 'dark' }],
    history: [{ _id: 'history-1' }]
  }, async ({ buildMigrationPackage, parseMigrationPackage }, calls) => {
    const data = await buildMigrationPackage('secret', {
      tables: ['bookmarks', 'notAllowed', 'data', 'bookmarks']
    })
    const parsed = parseMigrationPackage(JSON.stringify(data), 'secret')

    assert.deepEqual(Object.keys(parsed.tables).sort(), ['bookmarks', 'data'])
    assert.deepEqual(calls.map(call => call.name), ['bookmarks', 'data'])
    assert.deepEqual(data.summary, {
      bookmarks: 1,
      data: 1
    })
  })
})

test('migration import preview reports additions and conflicts', async () => {
  const dbRows = {
    bookmarks: [
      { _id: 'shared', title: 'package value' },
      { _id: 'new', title: 'new value' }
    ]
  }
  const packagePath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'electerm-config-migration-preview-')),
    'preview.ydmig'
  )
  try {
    await withMockedConfigMigration(dbRows, async ({ buildMigrationPackage, previewConfigMigration }) => {
      const data = await buildMigrationPackage('secret', {
        tables: ['bookmarks']
      })
      await fs.writeFile(packagePath, JSON.stringify(data, null, 2))
      dbRows.bookmarks = [
        { _id: 'shared', title: 'current value' },
        { _id: 'local', title: 'local only' }
      ]

      const preview = await previewConfigMigration(packagePath, 'secret')

      assert.deepEqual(preview.summary, { bookmarks: 2 })
      assert.deepEqual(preview.conflicts.bookmarks, {
        incoming: 2,
        current: 2,
        conflicts: 1,
        additions: 1
      })
      assert.equal(preview.externalKeyFileCount, 0)
    })
  } finally {
    await fs.rm(path.dirname(packagePath), { recursive: true, force: true })
  }
})

test('migration import can skip existing records and keep local data', async () => {
  const dbRows = {
    bookmarks: [
      { _id: 'shared', title: 'package value' },
      { _id: 'new', title: 'new value' }
    ]
  }
  const packagePath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'electerm-config-migration-skip-')),
    'skip.ydmig'
  )
  try {
    await withMockedConfigMigration(dbRows, async ({ buildMigrationPackage, importConfigMigration }) => {
      const data = await buildMigrationPackage('secret', {
        tables: ['bookmarks']
      })
      await fs.writeFile(packagePath, JSON.stringify(data, null, 2))
      dbRows.bookmarks = [
        { _id: 'shared', title: 'current value' },
        { _id: 'local', title: 'local only' }
      ]

      const res = await importConfigMigration(packagePath, 'secret', {
        mode: 'skipExisting',
        createBackup: false
      })

      assert.equal(res.mode, 'skipExisting')
      assert.deepEqual(res.imported, { bookmarks: 1 })
      assert.deepEqual(dbRows.bookmarks, [
        { _id: 'shared', title: 'current value' },
        { _id: 'local', title: 'local only' },
        { _id: 'new', title: 'new value' }
      ])
    })
  } finally {
    await fs.rm(path.dirname(packagePath), { recursive: true, force: true })
  }
})

test('migration import automatic backup includes current external key files', async () => {
  const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'electerm-config-migration-backup-key-'))
  const keyPath = path.join(keyDir, 'id_ed25519')
  const packagePath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'electerm-config-migration-backup-')),
    'backup-source.ydmig'
  )
  await fs.writeFile(keyPath, 'current-private-key')
  try {
    const dbRows = {
      bookmarks: [
        { _id: 'incoming', title: 'package value' }
      ]
    }
    await withMockedConfigMigration(dbRows, async ({
      buildMigrationPackage,
      importConfigMigration,
      parseMigrationPackage
    }) => {
      const data = await buildMigrationPackage('secret', {
        tables: ['bookmarks']
      })
      await fs.writeFile(packagePath, JSON.stringify(data, null, 2))
      dbRows.bookmarks = [
        { _id: 'current', title: 'current value', privateKeyPath: keyPath }
      ]

      const res = await importConfigMigration(packagePath, 'secret', {
        mode: 'replace'
      })
      const backupText = await fs.readFile(res.backupFilePath, 'utf8')
      const backup = parseMigrationPackage(backupText, 'secret')

      assert.equal(backup.tables.bookmarks[0].privateKeyPath, keyPath)
      assert.equal(backup.externalKeyFiles.length, 1)
      assert.deepEqual(backup.externalKeyFiles[0].sourcePaths, [keyPath])
    })
  } finally {
    await fs.rm(keyDir, { recursive: true, force: true })
    await fs.rm(path.dirname(packagePath), { recursive: true, force: true })
  }
})

test('migration export includes external key files only from selected tables', async () => {
  const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'electerm-config-migration-key-'))
  const keyPath = path.join(keyDir, 'id_ed25519')
  await fs.writeFile(keyPath, 'unit-test-private-key')
  try {
    await withMockedConfigMigration({
      bookmarks: [{ _id: 'bookmark-1', privateKeyPath: keyPath }],
      data: [{ _id: 'userConfig', privateKeyPath: path.join(keyDir, 'not-selected') }]
    }, async ({ buildMigrationPackage, parseMigrationPackage }) => {
      const data = await buildMigrationPackage('secret', {
        includeExternalKeys: true,
        tables: ['bookmarks']
      })
      const parsed = parseMigrationPackage(JSON.stringify(data), 'secret')

      assert.deepEqual(Object.keys(parsed.tables), ['bookmarks'])
      assert.equal(parsed.externalKeyFiles.length, 1)
      assert.deepEqual(parsed.externalKeyFiles[0].sourcePaths, [keyPath])
    })
  } finally {
    await fs.rm(keyDir, { recursive: true, force: true })
  }
})
