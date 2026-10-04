const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

for (const backend of ['sqlite', 'nedb']) {
  test(`${backend} awaits async decryption, preserves rows and bounds concurrent work`, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-async-db-'))
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    const { createDb } = require(`../../src/app/lib/${backend}`)
    let active = 0
    let peak = 0
    let calls = 0
    const db = createDb(dir, 'test', {
      enc: text => Buffer.from(text).toString('base64'),
      dec: () => { throw new Error('Synchronous decryption must not run') },
      decAsync: async text => {
        calls++
        active++
        peak = Math.max(active, peak)
        await new Promise(resolve => setImmediate(resolve))
        active--
        return Buffer.from(text, 'base64').toString()
      }
    })
    const rows = Array.from({ length: 10 }, (_, i) => ({ _id: String(i), text: `saved-${i}` }))
    await db.dbAction('aiChatHistory', 'insert', rows)
    const found = await db.dbAction('aiChatHistory', 'find', {})
    assert.deepEqual(found, rows)
    assert.equal(peak, 4)
    assert.equal(calls, 10)
    assert.deepEqual(await db.dbAction('aiChatHistory', 'findOne', { _id: '2' }), rows[2])
    assert.equal(calls, 11)
    assert.equal(await db.dbAction('aiChatHistory', 'findOne', { _id: 'absent' }), null)
    await db.dbAction('lastStates', 'insert', { _id: 'plain', value: 3 })
    assert.equal((await db.dbAction('lastStates', 'findOne', { _id: 'plain' })).value, 3)
    assert.equal(calls, 11)

    active = 0
    peak = 0
    calls = 0
    const startupRows = Array.from({ length: 4 }, (_, i) => ({ _id: `bookmark-${i}`, title: `server-${i}` }))
    await db.dbAction('bookmarks', 'insert', startupRows)
    assert.deepEqual(await db.dbAction('bookmarks', 'find', {}), startupRows)
    assert.equal(peak, 1)
    assert.equal(calls, 4)
  })
}

test('sqlite locks unreadable ciphertext when async decryption rejects', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-locked-db-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const { createDb } = require('../../src/app/lib/sqlite')
  const db = createDb(dir, 'test', {
    enc: () => 'unreadable-ciphertext',
    decAsync: async () => { throw new Error('Invalid authentication tag') }
  })
  await db.dbAction('aiChatHistory', 'insert', { _id: 'protected', text: 'saved' })
  assert.deepEqual(await db.dbAction('aiChatHistory', 'find', {}), [])
  assert.equal(db.getStorageStatus().lockedCount, 1)
  await assert.rejects(db.dbAction('aiChatHistory', 'insert', { _id: 'protected', text: '' }), /锁定/)
  await assert.rejects(db.dbAction('aiChatHistory', 'remove', { _id: 'protected' }), /锁定/)
})
