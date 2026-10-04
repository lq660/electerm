const { test } = require('node:test')
const assert = require('node:assert/strict')

test('file type-ahead joins keys typed within one second', async () => {
  const { appendTypeaheadKey } = await import('../../src/client/components/sftp/file-list-keyboard.js')
  const first = appendTypeaheadKey({}, 's', 1000)
  const second = appendTypeaheadKey(first, 'h', 1999)
  assert.equal(second.query, 'sh')
})

test('file type-ahead starts a new query after one second', async () => {
  const { appendTypeaheadKey } = await import('../../src/client/components/sftp/file-list-keyboard.js')
  const result = appendTypeaheadKey({ query: 'sh', lastTypedAt: 1000 }, 'r', 2001)
  assert.equal(result.query, 'r')
})

test('file type-ahead finds the first case-insensitive prefix match', async () => {
  const { findTypeaheadFileIndex } = await import('../../src/client/components/sftp/file-list-keyboard.js')
  const files = [{ name: 'README.md' }, { name: 'shell.sh' }, { name: 'server.log' }]
  assert.equal(findTypeaheadFileIndex(files, 'SH'), 1)
  assert.equal(findTypeaheadFileIndex(files, 'missing'), -1)
})

test('file keyboard navigation clamps at list boundaries', async () => {
  const { getKeyboardTargetIndex } = await import('../../src/client/components/sftp/file-list-keyboard.js')
  assert.equal(getKeyboardTargetIndex({ currentIndex: -1, fileCount: 5, key: 'ArrowDown' }), 0)
  assert.equal(getKeyboardTargetIndex({ currentIndex: 0, fileCount: 5, key: 'ArrowUp' }), 0)
  assert.equal(getKeyboardTargetIndex({ currentIndex: 4, fileCount: 5, key: 'ArrowDown' }), 4)
  assert.equal(getKeyboardTargetIndex({ currentIndex: 1, fileCount: 5, key: 'PageDown', pageSize: 3 }), 4)
  assert.equal(getKeyboardTargetIndex({ currentIndex: 3, fileCount: 5, key: 'Home' }), 0)
  assert.equal(getKeyboardTargetIndex({ currentIndex: 1, fileCount: 5, key: 'End' }), 4)
})
