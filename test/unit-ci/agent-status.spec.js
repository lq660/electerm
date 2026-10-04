const { test } = require('node:test')
const assert = require('node:assert/strict')

test('Agent status does not present a blocked task as completed', async () => {
  const { deriveAgentStatus } = await import('../../src/client/components/ai/agent-status.js')
  const result = deriveAgentStatus({
    agentRuntime: { state: 'blocked' },
    toolCalls: Array.from({ length: 14 }, (_, index) => ({ id: index, status: 'completed' }))
  })

  assert.equal(result.status, '未完成')
  assert.equal(result.statusClass, 'error')
  assert.equal(result.detail, '任务未通过完成核验，请查看下方原因')
  assert.equal(result.progressText, '执行步骤：14/14')
})

test('Agent status only reports verified final tasks as completed', async () => {
  const { deriveAgentStatus } = await import('../../src/client/components/ai/agent-status.js')
  const result = deriveAgentStatus({
    agentRuntime: { state: 'final' },
    toolCalls: [{ id: 'check', status: 'completed' }]
  })

  assert.equal(result.status, '已完成')
  assert.equal(result.statusClass, 'done')
  assert.equal(result.progressText, '执行步骤：1/1')
})

test('Agent status keeps a stopped task distinct from a failed step', async () => {
  const { deriveAgentStatus } = await import('../../src/client/components/ai/agent-status.js')
  const result = deriveAgentStatus({
    agentRuntime: { state: 'cancelled' },
    toolCalls: [{ id: 'check', status: 'skipped' }]
  })

  assert.equal(result.status, '已停止')
  assert.equal(result.statusClass, 'error')
  assert.equal(result.progressText, '执行步骤：1/1')
})
