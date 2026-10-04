const { test } = require('node:test')
const assert = require('node:assert/strict')

test('AI chat scope uses terminal session id when present', async () => {
  const {
    filterAiChatHistoryByTerminal,
    filterAiChatHistoryByMachine,
    getAiMachineKey,
    getAiMachineLabel,
    getAiChatScope,
    getAiHistoryTerminalId
  } = await import('../../src/client/common/ai-chat-scope.js')

  const scope = getAiChatScope({
    activeTabId: 'ssh-root',
    sessionRootId: 'ssh-root',
    terminalSessionId: 'ssh-root-terminal-1'
  })

  assert.deepEqual(scope, {
    sessionRootId: 'ssh-root',
    terminalSessionId: 'ssh-root-terminal-1'
  })

  const history = [
    { id: 'base', sessionRootId: 'ssh-root', prompt: 'legacy base' },
    { id: 'term-1', sessionRootId: 'ssh-root', terminalSessionId: 'ssh-root-terminal-1', prompt: 'current' },
    { id: 'term-2', sessionRootId: 'ssh-root', terminalSessionId: 'ssh-root-terminal-2', prompt: 'other' }
  ]

  assert.equal(getAiHistoryTerminalId(history[0]), 'ssh-root')
  assert.deepEqual(
    filterAiChatHistoryByTerminal(history, 'ssh-root-terminal-1').map(item => item.id),
    ['term-1']
  )
  assert.deepEqual(
    filterAiChatHistoryByTerminal(history, 'ssh-root').map(item => item.id),
    ['base']
  )

  const tabs = [
    { id: 'ssh-root', type: 'ssh', username: 'root', host: 'example.com', port: 22 },
    { id: 'other-root', type: 'ssh', username: 'root', host: 'other.example.com', port: 22 },
    { id: 'local-root' }
  ]
  const currentMachine = { sessionRootId: 'ssh-root', activeTabId: 'ssh-root' }
  assert.equal(getAiMachineKey(currentMachine, tabs), 'remote|ssh|root|example.com|22')
  assert.equal(getAiMachineLabel(currentMachine, tabs), 'root@example.com:22')
  const machineHistory = [
    { id: 'same-machine', sessionRootId: 'ssh-root', machineKey: 'remote|ssh|root|example.com|22' },
    { id: 'same-host-other-terminal', sessionRootId: 'ssh-root-2', machineKey: 'remote|ssh|root|example.com|22' },
    { id: 'other-machine', sessionRootId: 'other-root', machineKey: 'remote|ssh|root|other.example.com|22' }
  ]
  assert.deepEqual(
    filterAiChatHistoryByMachine(machineHistory, getAiMachineKey(currentMachine, tabs), tabs).map(item => item.id),
    ['same-machine', 'same-host-other-terminal']
  )
})
