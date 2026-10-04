const { test } = require('node:test')
const assert = require('node:assert/strict')

test('background waiting returns completed results immediately', async () => {
  const { waitForAgentTask } = await import('../../src/client/components/ai/agent-task-wait.js')
  const result = { status: 'completed', exitCode: 0, stdout: 'done' }
  assert.deepEqual(await waitForAgentTask(async () => result), result)
})

test('background waiting has a deadline and does not spin on running status', async () => {
  const { waitForAgentTask } = await import('../../src/client/components/ai/agent-task-wait.js')
  let reads = 0
  const result = await waitForAgentTask(async () => { reads++; return { status: 'running' } }, { waitSeconds: 0.03 })
  assert.equal(result.status, 'running')
  assert.ok(reads >= 1 && reads <= 3)
})

test('manual stop interrupts background waiting before another status read', async () => {
  const { waitForAgentTask } = await import('../../src/client/components/ai/agent-task-wait.js')
  const controller = new AbortController()
  let reads = 0
  const waiting = waitForAgentTask(async () => { reads++; return { status: 'running' } }, { signal: controller.signal })
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(waiting, /停止/)
  assert.equal(reads, 1)
})

test('legacy text command adapter propagates transport errors instead of returning empty success', async () => {
  const { commonExtends } = require('../../src/app/server/session-common')
  class Session {}
  commonExtends(Session)
  const session = new Session()
  session.runCmdStructured = async () => ({ exitCode: null, stderr: 'connection closed', success: false })
  await assert.rejects(session.runCmd('read file'), /connection closed/)
  session.runCmdStructured = async () => ({ exitCode: 0, stdout: 'contents' })
  assert.equal(await session.runCmd('read file'), 'contents')
})
