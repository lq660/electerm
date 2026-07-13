const { encrypt, decrypt } = require('./enc')
const { getStorageKey } = require('./storage-key')
const { safeDecrypt } = require('./safe-storage')

const LOCAL_PREFIX = 'v3:local:'
const SAFE_PREFIX = 'v2:safe:'

function encryptDbValue (value) {
  return LOCAL_PREFIX + encrypt(value, getStorageKey())
}

function decryptDbValue (value) {
  if (value.startsWith(LOCAL_PREFIX)) {
    return decrypt(value.slice(LOCAL_PREFIX.length), getStorageKey())
  }
  if (value.startsWith(SAFE_PREFIX)) {
    return safeDecrypt(value)
  }
  return value
}

module.exports = {
  encryptDbValue,
  decryptDbValue
}
