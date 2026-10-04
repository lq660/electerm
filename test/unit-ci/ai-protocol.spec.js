const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getAIProtocol, buildAIRequest, parseAIResponse } = require('../../src/app/lib/ai-protocol')

const tools = [{ type: 'function', function: { name: 'inspect', description: 'inspect files', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }]
const output = [
  { id: 'rs_1', type: 'reasoning', summary: [], encrypted_content: 'opaque' },
  { id: 'msg_1', type: 'message', role: 'assistant', phase: 'commentary', status: 'completed', content: [{ type: 'output_text', text: '正在检查', annotations: [] }] },
  { id: 'fc_1', type: 'function_call', status: 'completed', call_id: 'call_1', name: 'inspect', arguments: '{"path":"/opt"}' }
]

test('endpoint determines protocol without changing custom Chat paths', () => {
  assert.equal(getAIProtocol('https://example.com/v1/responses/?v=1'), 'responses')
  assert.equal(getAIProtocol('https://example.com/v1/chat/completions'), 'chat')
  assert.equal(getAIProtocol('https://example.com/custom?next=/responses'), 'chat')
})

test('Responses converts prompts, images, reasoning and function schemas', () => {
  const messages = [{ role: 'system', content: 'system' }, { role: 'user', content: [{ type: 'text', text: 'file.txt\ncontents' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'high' } }] }]
  const data = buildAIRequest({ model: 'test', messages, stream: false, tools, reasoningEffort: 'high', toolChoice: { type: 'function', function: { name: 'inspect' } } }, 'responses')
  assert.equal(data.messages, undefined)
  assert.equal(data.store, false)
  assert.deepEqual(data.reasoning, { effort: 'high' })
  assert.equal(data.reasoning_effort, undefined)
  assert.deepEqual(data.input[1].content, [{ type: 'input_text', text: 'file.txt\ncontents' }, { type: 'input_image', image_url: 'data:image/png;base64,abc', detail: 'high' }])
  assert.equal(data.tools[0].name, 'inspect')
  assert.equal(data.tools[0].strict, false)
  assert.equal(data.tools[0].function, undefined)
  assert.deepEqual(data.tool_choice, { type: 'function', name: 'inspect' })
  assert.equal(data.parallel_tool_calls, false)
  assert.deepEqual(buildAIRequest({ model: 'test', messages, reasoningEffort: 'auto' }, 'chat').messages, messages)
})

test('reasoning, phase and tool call IDs survive AgentRun normalization and history compaction', async () => {
  const { normalizeAssistantMessage } = await import('../../src/client/components/ai/agent-policy.js')
  const { compactAgentMessages } = await import('../../src/client/components/ai/agent-runtime.js')
  const parsed = parseAIResponse({ status: 'completed', output }, 'responses')
  assert.equal(parsed.message.tool_calls[0].id, 'call_1')
  const messages = compactAgentMessages([
    { role: 'system', content: 'system' }, { role: 'user', content: 'inspect' },
    ...Array.from({ length: 30 }, () => ({ role: 'user', content: 'old' })),
    normalizeAssistantMessage(parsed.message), { role: 'tool', tool_call_id: 'call_1', content: '{"exitCode":0}' }
  ])
  const request = buildAIRequest({ messages, model: 'test' }, 'responses')
  assert.deepEqual(request.input.slice(-4, -1), output)
  assert.deepEqual(request.input.at(-1), { type: 'function_call_output', call_id: 'call_1', output: '{"exitCode":0}' })
  const chat = buildAIRequest({ messages, model: 'test', tools, reasoningEffort: 'high' }, 'chat')
  assert.equal(chat.messages.at(-2).responsesOutput, undefined)
  assert.deepEqual(chat.tools, tools)
  assert.equal(chat.reasoning_effort, 'high')
})

test('Responses supports plain Chat history and refuses incomplete or malformed tool calls', () => {
  const assistant = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'inspect', arguments: '{}' } }] }
  assert.deepEqual(buildAIRequest({ messages: [assistant] }, 'responses').input, [{ type: 'function_call', call_id: 'call_1', name: 'inspect', arguments: '{}' }])
  for (const status of ['incomplete', 'failed', 'in_progress', undefined]) {
    assert.throws(() => parseAIResponse({ status, output }, 'responses'), /未完成/)
  }
  assert.throws(() => parseAIResponse({ status: 'completed', output: [{ ...output[2], call_id: undefined }] }, 'responses'), /call_id/)
  assert.throws(() => parseAIResponse({ status: 'completed', output: [{ ...output[2], arguments: 'bad' }] }, 'responses'), /JSON/)
  assert.equal(parseAIResponse({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: '不能执行' }] }] }, 'responses').message.content, '不能执行')
})
