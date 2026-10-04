const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const dbCryptoPath = path.resolve(__dirname, '../../src/app/lib/db-crypto.js')
const storageKeyPath = path.resolve(__dirname, '../../src/app/lib/storage-key.js')

function withMockedDbCrypto (callback) {
  const originalLoad = Module._load
  let safeStorageRequested = false
  delete require.cache[dbCryptoPath]
  Module._load = function (request, parent, isMain) {
    if (request === './safe-storage' && parent?.filename === dbCryptoPath) {
      safeStorageRequested = true
      throw new Error('safe-storage should not be loaded')
    }
    const resolved = Module._resolveFilename(request, parent, isMain)
    if (resolved === storageKeyPath) {
      return {
        getStorageKey: () => 'unit-test-local-storage-key'
      }
    }
    return originalLoad.apply(this, arguments)
  }
  try {
    const crypto = require(dbCryptoPath)
    callback(crypto, () => safeStorageRequested)
  } finally {
    Module._load = originalLoad
    delete require.cache[dbCryptoPath]
  }
}

test('db crypto uses local key encryption and never loads legacy safe storage', () => {
  withMockedDbCrypto(({ encryptDbValue, decryptDbValue }, getSafeStorageRequested) => {
    const encrypted = encryptDbValue('hello')
    assert.ok(encrypted.startsWith('v3:local:gcm:'))
    assert.equal(decryptDbValue(encrypted), 'hello')
    assert.equal(getSafeStorageRequested(), false)
  })
})

test('legacy safeStorage ciphertext is locked without touching keychain', () => {
  withMockedDbCrypto(({ decryptDbValue }, getSafeStorageRequested) => {
    assert.throws(
      () => decryptDbValue('v2:safe:legacy-ciphertext'),
      error => error.code === 'SAFE_STORAGE_DISABLED'
    )
    assert.equal(getSafeStorageRequested(), false)
  })
})

test('async decryption reads existing ciphertext without changing the encryption format', async () => {
  let crypto
  withMockedDbCrypto(value => { crypto = value })
  const plain = JSON.stringify({ id: 'history', text: '历史记录 🔒' })
  const encrypted = crypto.encryptDbValue(plain)
  assert.equal(await crypto.decryptDbValueAsync(encrypted), plain)
  assert.equal(await crypto.decryptDbValueAsync(plain), plain)
  await assert.rejects(crypto.decryptDbValueAsync('v2:safe:legacy'), { code: 'SAFE_STORAGE_DISABLED' })
  const last = encrypted.endsWith('0') ? '1' : '0'
  await assert.rejects(crypto.decryptDbValueAsync(encrypted.slice(0, -1) + last))
})

test('async decryption yields to the event loop while deriving the key', async () => {
  let crypto
  withMockedDbCrypto(value => { crypto = value })
  const encrypted = crypto.encryptDbValue('history')
  let yielded = false
  const turn = new Promise(resolve => setImmediate(() => { yielded = true; resolve() }))
  for (let i = 0; i < 4; i++) assert.equal(await crypto.decryptDbValueAsync(encrypted), 'history')
  assert.equal(yielded, true)
  await turn
})
