const { test } = require('node:test')
const assert = require('node:assert/strict')

test('routes remote clipboard transfers to another terminal through staging', async () => {
  const { partitionClipboardTransfers } = await import('../../src/client/components/file-transfer/transfer-routing.js')
  const targetTab = { id: 'terminal-b' }
  const { remote, direct } = partitionClipboardTransfers([
    {
      id: 'remote-cross',
      typeFrom: 'remote',
      typeTo: 'remote',
      fromFile: { tabId: 'terminal-a' }
    },
    {
      id: 'remote-same',
      typeFrom: 'remote',
      typeTo: 'remote',
      fromFile: { tabId: 'terminal-b' }
    },
    {
      id: 'local-upload',
      typeFrom: 'local',
      typeTo: 'remote',
      fromFile: { tabId: 'terminal-b' }
    }
  ], targetTab)

  assert.deepEqual(remote.map(item => item.id), ['remote-cross'])
  assert.deepEqual(direct.map(item => item.id), ['remote-same', 'local-upload'])
})

test('does not route incomplete clipboard metadata as cross-terminal', async () => {
  const { partitionClipboardTransfers } = await import('../../src/client/components/file-transfer/transfer-routing.js')
  const { remote, direct } = partitionClipboardTransfers([{
    id: 'missing-source-tab',
    typeFrom: 'remote',
    typeTo: 'remote',
    fromFile: { host: 'server-a' }
  }], { id: 'terminal-b' })

  assert.equal(remote.length, 0)
  assert.equal(direct.length, 1)
})
