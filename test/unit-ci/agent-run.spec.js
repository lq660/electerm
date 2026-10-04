const { test } = require('node:test')
const assert = require('node:assert/strict')

const command = (id, value) => ({ id, type: 'function', function: { name: 'send_terminal_command', arguments: JSON.stringify({ command: value }) } })
const reply = (content, calls) => ({ message: { role: 'assistant', content, ...(calls ? { tool_calls: calls } : {}) } })
const task = { id: 'run-test', prompt: '查一下 nginx 的版本', terminalSessionId: 'server-a' }

test('AgentRun runs without browser globals and pairs every requested tool before finalizing', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const executed = []
  let turns = 0
  const run = createAgentRun({
    requestVerification: async () => ({ status: 'complete', answer: 'Nginx 当前版本为 1.27.5。', evidence: [{ toolCallId: 'version', quote: 'nginx/1.27.5' }] }),
    requestModel: async messages => {
      if (turns++ === 0) return reply('我先检查。', [command('version', 'nginx -v'), command('extra', 'uname -a')])
      const toolMessages = messages.filter(message => message.role === 'tool')
      assert.deepEqual(toolMessages.map(message => message.tool_call_id), ['version', 'extra'])
      return reply('Nginx 当前版本为 1.27.5。')
    },
    executeTool: async (name, args) => {
      executed.push(args.command)
      return JSON.stringify({ exitCode: 0, stderr: 'nginx version: nginx/1.27.5' })
    }
  })
  const result = await run.start(task)
  assert.deepEqual(executed, ['nginx -v'])
  assert.equal(result.agentRuntime.state, 'final')
  assert.match(result.response, /1\.27\.5/)
  await assert.rejects(run.start(task), /only be started once/)
})

test('AgentRun stop discards a late model response before executing its command', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let release
  let notifyStarted
  const started = new Promise(resolve => { notifyStarted = resolve })
  let executions = 0
  const run = createAgentRun({
    requestModel: () => {
      notifyStarted()
      return new Promise(resolve => { release = resolve })
    },
    executeTool: async () => { executions++ }
  })
  const pending = run.start(task)
  await started
  run.stop()
  release(reply('', [command('late', 'nginx -v')]))
  const result = await pending
  assert.equal(executions, 0)
  assert.equal(result.agentRuntime.state, 'cancelled')
})

test('AgentRun does not call a plan or mark success when evidence is followed only by promises', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let turns = 0
  const run = createAgentRun({
    requestModel: async () => turns++ === 0
      ? reply('', [command('version', 'nginx -v')])
      : reply('我先确认当前终端状态，然后继续检查。'),
    requestPlan: async () => { throw new Error('Should not plan after sufficient evidence') },
    executeTool: async () => JSON.stringify({ exitCode: 0, stderr: 'nginx version: nginx/1.27.5' })
  })
  const result = await run.start(task)
  assert.equal(result.agentRuntime.state, 'blocked')
  assert.equal(turns, 4)
  assert.match(result.response, /未生成明确结论/)
})

test('AgentRun honors an existing UI abort signal before executing a late tool call', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const abortRef = { current: false }
  let executions = 0
  const run = createAgentRun({
    requestModel: async () => {
      abortRef.current = true
      return reply('', [command('late', 'nginx -v')])
    },
    executeTool: async () => { executions++ }
  })
  const result = await run.start(task, {}, abortRef)
  assert.equal(executions, 0)
  assert.equal(result.agentRuntime.state, 'cancelled')
})

test('AgentRun serializes structured observations for the provider', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let turns = 0
  const run = createAgentRun({
    requestVerification: async () => ({ status: 'complete', answer: 'Nginx 版本为 1.27.5。', evidence: [{ toolCallId: 'version', quote: 'nginx/1.27.5' }] }),
    requestModel: async messages => {
      if (turns++ === 0) return reply('', [command('version', 'nginx -v')])
      const observation = messages.find(message => message.role === 'tool')
      assert.equal(typeof observation.content, 'string')
      assert.equal(JSON.parse(observation.content).exitCode, 0)
      return reply('Nginx 版本为 1.27.5。')
    },
    executeTool: async () => ({ exitCode: 0, stderr: 'nginx version: nginx/1.27.5' })
  })
  assert.equal((await run.start(task)).agentRuntime.state, 'final')
})

test('AgentRun returns a blocked state and clears streaming on provider exceptions', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let streaming
  const run = createAgentRun({ requestModel: async () => { throw new Error('connection lost') } })
  const result = await run.start(task, {}, {}, value => { streaming = value })
  assert.equal(result.agentRuntime.state, 'blocked')
  assert.equal(streaming, false)
  assert.match(result.response, /^### 结论/)
  assert.match(result.response, /### 原因/)
  assert.match(result.response, /connection lost/)
})

test('AgentRun publishes streamed text but executes tools only after the final response', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const updates = []
  let executions = 0
  let turns = 0
  const run = createAgentRun({
    onUpdate: update => updates.push({ ...update }),
    requestVerification: async () => ({ status: 'complete', answer: 'Docker 中有 3 个容器。', evidence: [{ toolCallId: 'docker', quote: '3 containers' }] }),
    requestModel: async (messages, config, choice, options) => {
      if (turns++ === 0) {
        options.onDelta('正在检查 Docker')
        assert.equal(executions, 0)
        return reply('', [command('docker', 'docker ps -a')])
      }
      options.onDelta('已找到 3 个容器')
      assert.equal(executions, 1)
      return reply('Docker 中有 3 个容器。')
    },
    executeTool: async () => {
      executions++
      return JSON.stringify({ exitCode: 0, stdout: '3 containers' })
    }
  })
  const result = await run.start({ ...task, prompt: '查看 Docker 容器' })
  assert.equal(result.agentRuntime.state, 'final')
  assert.equal(result.streamingResponse, '')
  assert.deepEqual(result.agentProgress.map(item => item.content), ['正在检查 Docker', '已找到 3 个容器'])
  assert.ok(result.agentProgress.every(item => item.status === 'completed'))
  assert.equal(executions, 1)
  assert.ok(updates.some(update => update.streamingResponse === '正在检查 Docker'))
  assert.ok(updates.some(update => update.streamingResponse === '已找到 3 个容器'))
  assert.ok(updates.some(update => update.agentProgress?.length === 2 && update.agentProgress[0].content === '正在检查 Docker'))
})
