const { test } = require('node:test')
const assert = require('node:assert/strict')

test('parses ordered directory candidates from strings and arrays', async () => {
  const { parseStartDirectories, getStartDirectoryCandidates } = await import('../../src/client/common/start-directory.js')
  assert.deepEqual(parseStartDirectories(' /srv/app\n/srv/data, /srv/app; /srv/log '), ['/srv/app', '/srv/data', '/srv/log'])
  assert.deepEqual(getStartDirectoryCandidates({ startDirectory: '/legacy' }, {}, 'remote'), ['/legacy'])
  assert.deepEqual(getStartDirectoryCandidates({ startDirectoryRemote: '/new\n/next', startDirectory: '/legacy' }, {}, 'remote'), ['/new', '/next'])
  assert.deepEqual(getStartDirectoryCandidates({}, { startDirectoryLocal: ['/tmp', '/var/tmp'] }, 'local'), ['/tmp', '/var/tmp'])
})

test('restores the exact last path only when no initial directory is configured', async () => {
  const { getStartDirectoryCandidates } = await import('../../src/client/common/start-directory.js')
  assert.deepEqual(getStartDirectoryCandidates({}, {}, 'remote', '/srv/a,b;c'), ['/srv/a,b;c'])
  assert.deepEqual(getStartDirectoryCandidates({ startDirectoryRemote: '/configured\n/fallback' }, {}, 'remote', '/last'), ['/configured', '/fallback'])
  assert.deepEqual(getStartDirectoryCandidates({}, {}, 'remote', ''), [])
})

test('directory memory separates accounts and panes and survives new tab ids', async () => {
  const { readLastDirectory, rememberLastDirectory } = await import('../../src/client/common/start-directory.js')
  const values = new Map()
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  const tab = { host: 'server', username: 'root', id: 'one' }
  rememberLastDirectory(tab, 'ssh', '/srv/app', storage)
  rememberLastDirectory(tab, 'sftp', '/var/log', storage)
  assert.equal(readLastDirectory({ ...tab, id: 'two', port: '22' }, 'ssh', storage), '/srv/app')
  assert.equal(readLastDirectory(tab, 'sftp', storage), '/var/log')
  assert.equal(readLastDirectory({ ...tab, username: 'deploy' }, 'ssh', storage), '')
  assert.equal(readLastDirectory({ ...tab, port: 2222 }, 'ssh', storage), '')
  rememberLastDirectory(tab, 'ssh', '', storage)
  assert.equal(readLastDirectory(tab, 'ssh', storage), '/srv/app')
  const unavailable = { getItem () { throw new Error('disabled') }, setItem () { throw new Error('full') } }
  assert.equal(readLastDirectory(tab, 'ssh', unavailable), '')
  assert.doesNotThrow(() => rememberLastDirectory(tab, 'ssh', '/tmp', unavailable))
})
