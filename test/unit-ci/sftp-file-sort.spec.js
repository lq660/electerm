const { test } = require('node:test')
const assert = require('node:assert/strict')

const directory = (name, bytes, status = 'done') => ({
  id: name,
  name,
  isDirectory: true,
  size: 4096,
  folderSizeBytes: bytes,
  folderSizeStatus: status
})

test('sorts directory sizes by calculated bytes instead of directory entry size', async () => {
  const { compareSftpFiles } = await import('../../src/client/components/sftp/file-sort.js')
  const files = [
    directory('medium', 451.94 * 1024 * 1024),
    directory('largest', 78.38 * 1024 * 1024 * 1024),
    directory('smallest', 16.38 * 1024)
  ]

  files.sort((a, b) => compareSftpFiles(a, b, 'size', 'desc'))

  assert.deepEqual(files.map(file => file.name), ['largest', 'medium', 'smallest'])
})

test('keeps unfinished directory sizes after calculated sizes', async () => {
  const { compareSftpFiles } = await import('../../src/client/components/sftp/file-sort.js')
  const files = [
    directory('loading', null, 'loading'),
    directory('known', 1024)
  ]

  files.sort((a, b) => compareSftpFiles(a, b, 'size', 'asc'))

  assert.deepEqual(files.map(file => file.name), ['known', 'loading'])
})

test('recognizes sort state updates as immediate UI work', async () => {
  const { hasSftpSortUpdate } = await import('../../src/client/components/sftp/file-sort.js')

  assert.equal(hasSftpSortUpdate({ 'sortDirection.remote': 'asc' }), true)
  assert.equal(hasSftpSortUpdate({ 'sortProp.local': 'size' }), true)
  assert.equal(hasSftpSortUpdate({ remotePath: '/var' }), false)
})
