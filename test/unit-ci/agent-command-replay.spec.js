const { test } = require('node:test')
const assert = require('node:assert/strict')

test('only command tool cards can be replayed', async () => {
  const { canReplayCommand, getReplayableCommand } = await import('../../src/client/components/ai/agent-command-replay.js')

  assert.equal(getReplayableCommand({ args: { command: '  nginx -v  ' } }), 'nginx -v')
  assert.equal(canReplayCommand({ status: 'completed', args: { command: 'nginx -v' } }), true)
  assert.equal(canReplayCommand({ status: 'running', args: { command: 'nginx -v' } }), false)
  assert.equal(canReplayCommand({ status: 'pending_confirm', args: { command: 'rm old.log' } }), false)
  assert.equal(canReplayCommand({ status: 'completed', args: { path: '/tmp' } }), false)
})

test('replay only confirms destructive commands', async () => {
  const { shouldConfirmCommandReplay } = await import('../../src/client/components/ai/agent-command-replay.js')

  assert.equal(shouldConfirmCommandReplay({ args: { command: 'journalctl -u nginx -n 50' } }), false)
  assert.equal(shouldConfirmCommandReplay({ args: { command: 'systemctl restart nginx' } }), false)
  assert.equal(shouldConfirmCommandReplay({ args: { command: 'rm -rf /tmp/example' } }), true)
  assert.equal(shouldConfirmCommandReplay({ args: { command: 'docker volume prune' } }), true)
})
