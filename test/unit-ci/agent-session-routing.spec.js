const { test } = require('node:test')
const assert = require('node:assert/strict')
const api = require('../../src/app/server/session-api')
const state = require('../../src/app/server/global-state')
const { runLocalCommand, cancelCommand } = require('../../src/app/server/agent-command-execution')

test('session API routes owned background start, status and cancellation without touching another session', async (t) => {
  const owner = {
    runCmdStructured (command, conn, timeout, executionId, background) {
      return runLocalCommand(this, { shell: '/bin/sh', command, timeout, executionId, background })
    },
    cancelCmdStructured (id) { return cancelCommand(this, id) }
  }
  state.setSession('acceptance-owned', owner)
  t.after(() => { cancelCommand(owner, 'bg'); state.removeSession('acceptance-owned') })
  const base = { pid: 'acceptance-owned', executionId: 'bg' }
  const started = await api.runCmdStructured({ ...base, operation: 'background-start', cmd: 'sleep 20' })
  assert.equal(started.taskId, 'bg')
  assert.equal(started.status, 'running')
  assert.equal((await api.runCmdStructured({ ...base, pid: 'missing', cancel: true })).cancelled, false)
  assert.equal((await api.runCmdStructured({ ...base, operation: 'background-status' })).status, 'running')
  const foreground = await api.runCmdStructured({ ...base, executionId: 'fg', cmd: 'printf independent' })
  assert.equal(foreground.stdout, 'independent')
  assert.equal(foreground.exitCode, 0)
  assert.equal((await api.runCmdStructured({ ...base, cancel: true })).cancelled, true)
  assert.equal((await api.runCmdStructured({ ...base, operation: 'background-status' })).status, 'cancelled')
})

test('session API does not turn missing execution capability into a successful empty result', async () => {
  const result = await api.runCmdStructured({ pid: 'missing', cmd: 'printf test' })
  assert.equal(result.exitCode, null)
  assert.match(result.stderr, /unavailable/)
})
