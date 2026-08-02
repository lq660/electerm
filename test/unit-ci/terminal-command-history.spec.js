import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeTerminalCommand,
  normalizeTerminalCommandForHistory,
  isSameTerminalCommand,
  shouldMergeCommandSignal
} from '../../src/client/common/terminal-command-history.mjs'

test('terminal command history helpers', async (t) => {
  await t.test('normalizes command edges without changing shell-significant spaces', () => {
    assert.equal(normalizeTerminalCommand('  echo   hello\r\n'), 'echo   hello')
    assert.equal(normalizeTerminalCommand('\n\n'), '')
    assert.equal(isSameTerminalCommand(' pwd ', 'pwd'), true)
    assert.equal(isSameTerminalCommand('echo a', 'echo  a'), false)
  })

  await t.test('removes shell-added ls color flag from reusable history', () => {
    assert.equal(normalizeTerminalCommandForHistory('ls --color=auto'), 'ls')
    assert.equal(normalizeTerminalCommandForHistory('ls --color=auto -lah'), 'ls -lah')
    assert.equal(normalizeTerminalCommandForHistory('ls -lah'), 'ls -lah')
    assert.equal(normalizeTerminalCommandForHistory('grep --color=auto nginx access.log'), 'grep --color=auto nginx access.log')
  })

  await t.test('merges manual and shell signals from the same session in a short window', () => {
    const now = Date.parse('2026-07-29T10:00:01.000Z')
    const existing = {
      cmd: 'pwd',
      lastSessionId: 'ssh-a',
      lastCommandSignal: 'manual',
      lastUseTime: '2026-07-29T10:00:00.000Z'
    }

    assert.equal(shouldMergeCommandSignal(existing, 'ssh-a', 'shell', now), true)
    assert.equal(shouldMergeCommandSignal(existing, 'ssh-b', 'shell', now), false)
    assert.equal(shouldMergeCommandSignal(existing, 'ssh-a', 'manual', now), false)
    assert.equal(shouldMergeCommandSignal(existing, 'ssh-a', 'shell', now + 2000), false)
  })
})
