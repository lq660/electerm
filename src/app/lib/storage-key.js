const log = require('../common/log')
const { appPath, defaultUserName } = require('../common/app-props')
const { resolve: pathResolve } = require('path')
const fs = require('fs')
const { randomBytes } = require('crypto')

const appDataPath = process.env.DATA_PATH || pathResolve(appPath, 'electerm')
const keyFilePath = pathResolve(appDataPath, 'users', defaultUserName, 'storage-key.local')
const KEY_PREFIX = 'v1:local:'

let cachedStorageKey = null

function writeStorageKey (key) {
  const dir = pathResolve(appDataPath, 'users', defaultUserName)
  const temporaryPath = keyFilePath + '.tmp'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  // 2026-07-12 coder(lq): Use an atomic owner-only key file so database encryption does not depend on a surprising OS keychain prompt.
  fs.writeFileSync(temporaryPath, KEY_PREFIX + key, { mode: 0o600 })
  fs.renameSync(temporaryPath, keyFilePath)
  fs.chmodSync(keyFilePath, 0o600)
}

function getStorageKey () {
  if (cachedStorageKey) return cachedStorageKey
  try {
    if (fs.existsSync(keyFilePath)) {
      const stored = fs.readFileSync(keyFilePath, 'utf8').trim()
      if (!stored.startsWith(KEY_PREFIX)) {
        throw new Error('Unsupported local storage key format')
      }
      cachedStorageKey = stored.slice(KEY_PREFIX.length)
      if (!cachedStorageKey) {
        throw new Error('Local storage key is empty')
      }
      fs.chmodSync(keyFilePath, 0o600)
      return cachedStorageKey
    }
    cachedStorageKey = randomBytes(32).toString('base64')
    writeStorageKey(cachedStorageKey)
    return cachedStorageKey
  } catch (error) {
    cachedStorageKey = null
    log.error('[storage-key] error:', error.message)
    throw error
  }
}

module.exports = { getStorageKey }
