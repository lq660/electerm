const { test } = require('node:test')
const assert = require('node:assert/strict')

test('native icon lookup rejects unsafe or missing paths', async () => {
  const { getSystemFileIcon, isSafeLocalFilePath } = require('../../src/app/lib/system-file-icon.js')

  assert.equal(isSafeLocalFilePath(''), false)
  assert.equal(isSafeLocalFilePath('relative/file.txt'), false)
  assert.equal(isSafeLocalFilePath('/definitely/not/a/real/file'), false)
  assert.equal(await getSystemFileIcon({ getFileIcon: () => { throw new Error('must not run') } }, '/definitely/not/a/real/file', 'linux'), null)
})

test('macOS uses bundled icons instead of unstable IconServices', async () => {
  const { getSystemFileIcon } = await import('../../src/app/lib/system-file-icon.js')
  let called = false
  const result = await getSystemFileIcon({
    getFileIcon: () => {
      called = true
      return Promise.resolve({ toDataURL: () => 'data:image/png;base64,test' })
    }
  }, __filename, 'darwin')

  assert.equal(result, null)
  assert.equal(called, false)
})

test('native icon errors safely fall back to bundled icons', async () => {
  const { getSystemFileIcon } = await import('../../src/app/lib/system-file-icon.js')
  const result = await getSystemFileIcon({
    getFileIcon: () => Promise.reject(new Error('icon provider failed'))
  }, __filename, 'linux')

  assert.equal(result, null)
})
