const { test } = require('node:test')
const assert = require('node:assert/strict')

test('AI chat scope uses terminal session id when present', async () => {
  const {
    filterAiChatHistoryByTerminal,
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
})
