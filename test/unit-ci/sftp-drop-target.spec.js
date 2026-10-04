const { test } = require('node:test')
const assert = require('node:assert/strict')

test('drops onto blank space into the current directory', async () => {
  const { resolveDropDestination } = await import('../../src/client/components/sftp/drop-target.js')

  assert.equal(resolveDropDestination({ path: '/Users/test/Downloads', name: '' }), '/Users/test/Downloads')
  assert.equal(resolveDropDestination({ path: '/Users/test/Downloads', name: 'folder' }), '/Users/test/Downloads/folder')
})

test('sanitizes a real drop target name without changing its directory', async () => {
  const { resolveDropDestination } = await import('../../src/client/components/sftp/drop-target.js')

  assert.equal(resolveDropDestination({ path: '/Users/test/Downloads', name: 'report:2026' }), '/Users/test/Downloads/report_2026')
})
