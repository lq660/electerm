const { test } = require('node:test')
const assert = require('node:assert/strict')

test('recognizes supported archive extensions case-insensitively', async () => {
  const { isArchiveFile, archiveExtensions } = await import('../../src/client/components/sftp/archive-utils.js')

  for (const extension of archiveExtensions) {
    assert.equal(isArchiveFile(`backup${extension.toUpperCase()}`), true)
  }
  assert.equal(isArchiveFile('backup.tar.gz.part'), false)
  assert.equal(isArchiveFile('notes.txt'), false)
  assert.equal(isArchiveFile('.zip'), true)
})

test('derives an isolated extraction directory from the archive name', async () => {
  const { getArchiveExtractName } = await import('../../src/client/components/sftp/archive-utils.js')

  assert.equal(getArchiveExtractName('release.zip'), 'release')
  assert.equal(getArchiveExtractName('backup.TAR.GZ'), 'backup')
  assert.equal(getArchiveExtractName('bundle.7Z'), 'bundle')
  assert.equal(getArchiveExtractName('.zip'), '.zip')
  assert.equal(getArchiveExtractName('notes.txt'), 'notes.txt')
})
