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
