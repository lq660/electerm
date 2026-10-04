const { test } = require('node:test')
const assert = require('node:assert/strict')

const tools = [{
  type: 'function',
  function: {
    name: 'send_terminal_command',
    description: 'Run one terminal command',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'Command to execute' } },
      required: ['command']
    }
  }
}]

test('recovery planner emits a bounded provider-neutral action request', async () => {
  const { buildActionRecoveryMessages } = await import('../../src/client/components/ai/agent-action-recovery.js')
  const messages = buildActionRecoveryMessages({
    goal: '查今天的服务日志',
    context: '服务在 /deploy，由 Docker 部署',
    conversation: [{ user: 'multica 也叫 missionos' }],
    candidate: '我不知道',
    observations: [{ output: 'x'.repeat(30000) }],
    availableTools: tools
  })
  assert.equal(messages.length, 2)
  assert.match(messages[0].content, /只输出一个 JSON 对象/)
  assert.match(messages[1].content, /send_terminal_command/)
  assert.ok(messages[1].content.length < 19000)
})

test('strict recovery parser accepts only a declared structured tool action', async () => {
  const { parseRecoveredToolCall } = await import('../../src/client/components/ai/agent-action-recovery.js')
  const parsed = parseRecoveredToolCall('{"name":"send_terminal_command","arguments":{"command":"pwd"}}', tools, 'recovered')
  assert.equal(parsed.tool_calls[0].id, 'recovered')
  assert.equal(parsed.tool_calls[0].function.name, 'send_terminal_command')
  assert.deepEqual(JSON.parse(parsed.tool_calls[0].function.arguments), { command: 'pwd' })
  assert.equal(parseRecoveredToolCall('先执行：\n{"name":"send_terminal_command","arguments":{"command":"pwd"}}', tools), null)
  assert.equal(parseRecoveredToolCall('{"name":"unknown","arguments":{}}', tools), null)
  assert.equal(parseRecoveredToolCall('{"name":"send_terminal_command","arguments":{}}', tools), null)
})
