const { test } = require('node:test')
const assert = require('node:assert/strict')

test('transfer duplicate names use sequential numeric suffixes', async () => {
  const {
    buildDuplicateTransferName,
    findAvailableDuplicateTransferName,
    splitTransferName
  } = await import('../../src/client/components/file-transfer/transfer-name.js')

  assert.deepEqual(splitTransferName('report.txt'), {
    base: 'report',
    ext: '.txt'
  })
  assert.deepEqual(splitTransferName('.env'), {
    base: '.env',
    ext: ''
  })
  assert.equal(buildDuplicateTransferName('report.txt', 1), 'report(1).txt')
  assert.equal(buildDuplicateTransferName('a.tar.gz', 2), 'a.tar(2).gz')

  const result = await findAvailableDuplicateTransferName({
    dirPath: '/tmp',
    fileName: 'report.txt',
    resolvePath: (dirPath, name) => `${dirPath}/${name}`,
    exists: async (candidatePath) => {
      return candidatePath === '/tmp/report(1).txt' || candidatePath === '/tmp/report(2).txt'
    }
  })

  assert.deepEqual(result, {
    newName: 'report(3).txt',
    newPath: '/tmp/report(3).txt'
  })
})
