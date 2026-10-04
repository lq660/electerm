const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const { setTimeout: delay } = require('node:timers/promises')

const answer = text => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }] })
const tools = [{ type: 'function', function: { name: 'send_terminal_command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } }]

async function fixture (t, handler) {
  const previousEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  t.after(() => { if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv })
  const ai = require('../../src/app/lib/ai')
  const requests = []
  const failures = []
  const server = http.createServer(async (req, res) => {
    try {
      let body = ''
      for await (const chunk of req) body += chunk
      const data = JSON.parse(body)
      requests.push(data)
      res.setHeader('Content-Type', 'application/json')
      await handler(data, res, req)
    } catch (error) {
      failures.push(error)
      res.statusCode = 500
      res.end(JSON.stringify({ error: { message: error.message } }))
    }
  })
  t.after(() => { server.closeAllConnections(); server.close(); assert.deepEqual(failures, []) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    ai,
    requests,
    chat: (path, stream = false) => ai.AIchat('Hi', 'test-model', 'system', base, path, 'test-secret', null, stream, null, 'high'),
    model: (messages, path = '/v1/responses', id, definitions = tools, choice = 'auto', stream = false) => ai.AIchatWithTools(messages, 'test-model', base, path, 'test-secret', null, definitions, null, 'high', definitions.length ? choice : undefined, id, stream)
  }
}

test('connection tests use Responses or Chat according to the actual endpoint', async t => {
  const f = await fixture(t, (data, res, req) => {
    if (req.url === '/v1/responses') {
      assert.equal(data.messages, undefined)
      assert.deepEqual(data.input, [{ role: 'system', content: 'system' }, { role: 'user', content: 'Hi' }])
      assert.deepEqual(data.reasoning, { effort: 'high' })
      res.end(JSON.stringify(answer('Responses 可用')))
    } else {
      assert.equal(data.input, undefined)
      assert.equal(data.messages[1].content, 'Hi')
      assert.equal(data.reasoning_effort, 'high')
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Chat 可用' } }] }))
    }
  })
  assert.equal((await f.chat('/v1/responses')).response, 'Responses 可用')
  assert.equal((await f.chat('/v1/chat/completions')).response, 'Chat 可用')
})

test('required tool recovery reaches both HTTP protocols and exposes explicit control downgrade without payloads', async t => {
  let rejectControl = false
  const f = await fixture(t, (data, res, req) => {
    if (data.tool_choice) {
      assert.equal(data.tool_choice, 'required')
      if (rejectControl) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: { message: 'tool_choice is not supported' } }))
        return
      }
    } else {
      assert.equal(rejectControl, true)
      assert.equal(data.parallel_tool_calls, undefined)
    }
    assert.equal(data.tools.length, 1)
    res.end(JSON.stringify(req.url === '/v1/responses' ? answer('private response') : { choices: [{ message: { role: 'assistant', content: 'private response' } }] }))
  })
  for (const path of ['/v1/responses', '/v1/chat/completions']) {
    for (const fallback of [false, true]) {
      rejectControl = fallback
      const result = await f.model([{ role: 'user', content: 'private prompt' }], path, undefined, tools, 'required')
      assert.equal(result.error, undefined)
      assert.equal(result.diagnostics.controlsFallback, fallback)
      assert.equal(result.diagnostics.toolCount, 1)
      assert.equal(result.diagnostics.httpStatus, 200)
      assert.ok(result.diagnostics.durationMs >= 0)
      assert.doesNotMatch(JSON.stringify(result.diagnostics), /private|test-secret/)
    }
  }
  assert.equal(f.requests.length, 6)
})

test('AgentRun completes command, observation and verification through Responses HTTP', async t => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const { buildAttachmentContent } = await import('../../src/client/components/ai/ai-attachments.js')
  const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque-reasoning' }
  const f = await fixture(t, (data, res) => {
    if (!data.tools) {
      res.end(JSON.stringify(answer(JSON.stringify({ status: 'complete', answer: 'Nginx 当前版本为 1.27.5。', evidence: [{ toolCallId: 'version', quote: 'nginx/1.27.5' }] }))))
    } else if (!data.input.some(item => item.type === 'function_call_output')) {
      assert.equal(data.tools[0].name, 'send_terminal_command')
      assert.equal(data.tools[0].strict, false)
      res.end(JSON.stringify({ status: 'completed', output: [reasoning, { id: 'fc_not_the_call_id', type: 'function_call', call_id: 'version', name: 'send_terminal_command', arguments: '{"command":"nginx -v"}' }] }))
    } else {
      assert.deepEqual(data.input.find(item => item.type === 'reasoning'), reasoning)
      const observation = data.input.find(item => item.type === 'function_call_output')
      assert.equal(observation.call_id, 'version')
      assert.match(observation.output, /nginx\/1\.27\.5/)
      res.end(JSON.stringify(answer('Nginx 当前版本为 1.27.5。')))
    }
  })
  const executions = []
  const run = createAgentRun({
    requestModel: messages => f.model(messages),
    requestVerification: async () => {
      const result = await f.model([{ role: 'user', content: 'verify' }], '/v1/responses', undefined, [])
      return JSON.parse(result.message.content)
    },
    executeTool: async (name, args) => {
      executions.push(args.command)
      return JSON.stringify({ exitCode: 0, stderr: 'nginx version: nginx/1.27.5' })
    }
  })
  const result = await run.start({ id: 'protocol-run', prompt: '查 nginx 版本', terminalSessionId: 'server-a' })
  assert.equal(result.agentRuntime.state, 'final')
  assert.match(result.response, /1\.27\.5/)
  assert.deepEqual(executions, ['nginx -v'])
  assert.equal(f.requests.length, 3)
  const content = buildAttachmentContent('分析附件', [{ kind: 'image', name: 'shot.png', dataUrl: 'data:image/png;base64,abc' }, { kind: 'text', name: 'log.txt', text: 'sample log' }])
  const attachmentResult = await f.model([{ role: 'user', content }])
  assert.equal(attachmentResult.error, undefined)
  assert.ok(f.requests.at(-1).input[0].content.some(item => item.type === 'input_image'))
  assert.match(JSON.stringify(f.requests.at(-1).input), /sample log/)
})

async function readStream (f, path) {
  const started = await f.chat(path, true)
  assert.ok(started.sessionId, started.error)
  for (let i = 0; i < 100; i++) {
    const state = f.ai.getStreamContent(started.sessionId)
    if (!state.hasMore) return state
    await delay(10)
  }
  f.ai.stopStream(started.sessionId)
  assert.fail('Stream did not complete')
}

async function readModelStream (f, path) {
  const started = await f.model([{ role: 'user', content: 'inspect' }], path, undefined, tools, 'auto', true)
  if (!started.isStream) return started
  for (let i = 0; i < 100; i++) {
    const state = f.ai.getStreamContent(started.sessionId)
    if (!state.hasMore) return state
    await delay(10)
  }
  f.ai.stopStream(started.sessionId)
  assert.fail('Tool stream did not complete')
}

test('tool-enabled streaming waits for complete tool arguments in Responses and Chat protocols', async t => {
  const f = await fixture(t, (data, res, req) => {
    assert.equal(data.stream, true)
    res.setHeader('Content-Type', 'text/event-stream')
    if (req.url === '/v1/responses') {
      const response = {
        status: 'completed',
        output: [{ type: 'function_call', call_id: 'response-call', name: 'send_terminal_command', arguments: '{"command":"docker ps -a"}' }]
      }
      res.end(`data: {"type":"response.output_text.delta","delta":"正在检查"}\n\ndata: ${JSON.stringify({ type: 'response.completed', response })}\n\n`)
      return
    }
    res.end([
      'data: {"choices":[{"delta":{"content":"正在检查","tool_calls":[{"index":0,"id":"chat-call","type":"function","function":{"name":"send_terminal_","arguments":"{\\"command\\":\\"docker "}}]}}]}',
      '',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"command","arguments":"ps -a\\"}"}}]},"finish_reason":"tool_calls"}]}',
      '',
      'data: [DONE]',
      '',
      ''
    ].join('\n'))
  })
  for (const path of ['/v1/responses', '/v1/chat/completions']) {
    const result = await readModelStream(f, path)
    assert.equal(result.error, undefined)
    assert.equal(result.content, path.includes('responses') ? '' : '正在检查')
    assert.equal(result.message.tool_calls[0].function.name, 'send_terminal_command')
    assert.equal(result.message.tool_calls[0].function.arguments, '{"command":"docker ps -a"}')
  }
})

test('tool streaming falls back only when a provider explicitly rejects stream mode', async t => {
  const f = await fixture(t, (data, res) => {
    if (data.stream) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: { message: 'streaming is not supported by this gateway' } }))
      return
    }
    res.end(JSON.stringify(answer('降级请求可用')))
  })
  const result = await readModelStream(f, '/v1/responses')
  assert.equal(result.message.content, '降级请求可用')
  assert.equal(result.diagnostics.streamingFallback, true)
  assert.deepEqual(f.requests.map(request => request.stream), [true, false])
})

test('streaming handles split UTF-8, completion, refusal, interruption and Chat deltas', async t => {
  let mode = 'responses'
  const f = await fixture(t, async (data, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    if (mode === 'chat') {
      res.end('data: {"choices":[{"delta":{"content":"旧接口"}}]}\n\ndata: [DONE]\n\n')
      return
    }
    if (mode === 'error') {
      res.end('data: {"type":"error","message":"provider refused"}\n\n')
      return
    }
    const text = mode === 'refusal' ? '无法执行' : '中文结果'
    const event = mode === 'refusal' ? 'response.refusal.delta' : 'response.output_text.delta'
    const bytes = Buffer.from(`event: ${event}\r\ndata: ${JSON.stringify({ type: event, delta: text })}\r\n\r\n`)
    const split = bytes.indexOf(Buffer.from(text)) + 1
    res.write(bytes.subarray(0, split))
    await delay(5)
    res.write(bytes.subarray(split))
    if (mode === 'truncated') { res.end(); return }
    const response = mode === 'incomplete' ? { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } : answer(text)
    if (mode === 'refusal') response.output[0].content = [{ type: 'refusal', refusal: text }]
    res.end(`data: ${JSON.stringify({ type: mode === 'incomplete' ? 'response.incomplete' : 'response.completed', response })}\n\n`)
  })
  assert.equal((await readStream(f, '/v1/responses')).content, '中文结果')
  mode = 'refusal'
  assert.equal((await readStream(f, '/v1/responses')).content, '无法执行')
  mode = 'truncated'
  assert.match((await readStream(f, '/v1/responses')).error, /未收到完成事件/)
  mode = 'incomplete'
  assert.match((await readStream(f, '/v1/responses')).error, /max_output_tokens/)
  mode = 'error'
  assert.match((await readStream(f, '/v1/responses')).error, /provider refused/)
  mode = 'chat'
  assert.equal((await readStream(f, '/v1/chat/completions')).content, '旧接口')
})

test('HTTP 400 details are preserved for both modes, redact the key and do not blindly retry', async t => {
  const f = await fixture(t, (data, res) => {
    res.statusCode = 400
    res.end(JSON.stringify({ error: { message: 'Unsupported model test-secret' } }))
  })
  for (const result of [await f.chat('/v1/responses'), await f.chat('/v1/responses', true), await f.model([{ role: 'user', content: 'test' }])]) {
    assert.equal(result.status, 400)
    assert.match(result.error, /HTTP 400.*Unsupported model/)
    assert.doesNotMatch(JSON.stringify(result), /test-secret/)
  }
  assert.equal(f.requests.length, 3)
})

test('Responses cancellation and manual stream stop clear only their own requests', async t => {
  let arrived
  const arrival = new Promise(resolve => { arrived = resolve })
  const f = await fixture(t, (data, res) => {
    if (data.stream) { res.setHeader('Content-Type', 'text/event-stream'); res.write(': connected\n\n') }
    arrived()
  })
  const pending = f.model([{ role: 'user', content: 'test' }], '/v1/responses', 'responses-cancel')
  t.after(() => f.ai.cancelAIRequest('responses-cancel'))
  await arrival
  assert.equal(f.ai.cancelAIRequest('responses-cancel').cancelled, true)
  assert.equal((await pending).cancelled, true)
  assert.equal(f.ai.cancelAIRequest('responses-cancel').cancelled, false)
  const stream = await f.chat('/v1/responses', true)
  assert.equal(f.ai.stopStream(stream.sessionId).stopped, true)
  assert.equal(f.ai.getStreamContent(stream.sessionId).error, 'Session not found')
})
