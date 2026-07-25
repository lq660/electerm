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
        dbAction: async (name, action) => {
          calls.push({ name, action })
          assert.equal(action, 'find')
          return dbRows[name] || []
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
