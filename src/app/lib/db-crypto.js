const { encrypt, decrypt } = require('./enc')
const { getStorageKey } = require('./storage-key')

const LOCAL_PREFIX = 'v3:local:'
const SAFE_PREFIX = 'v2:safe:'

class LegacySafeStorageDisabledError extends Error {
  constructor () {
    super('旧版系统钥匙串加密数据已停用，请重建本地配置后继续使用')
    this.name = 'LegacySafeStorageDisabledError'
    this.code = 'SAFE_STORAGE_DISABLED'
  }
}

function encryptDbValue (value) {
  return LOCAL_PREFIX + encrypt(value, getStorageKey())
}

function decryptDbValue (value) {
  if (value.startsWith(LOCAL_PREFIX)) {
    return decrypt(value.slice(LOCAL_PREFIX.length), getStorageKey())
  }
  if (value.startsWith(SAFE_PREFIX)) {
    // 2026-07-23 coder(lq): Do not touch OS keychain/credential storage at startup; legacy safeStorage rows stay locked until rebuilt locally.
    throw new LegacySafeStorageDisabledError()
  }
  return value
}

module.exports = {
  encryptDbValue,
  decryptDbValue,
  LegacySafeStorageDisabledError
}
