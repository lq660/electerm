const { test } = require('node:test')
const assert = require('node:assert/strict')

const reply = content => ({ message: { role: 'assistant', content } })
const command = (id, command) => ({ message: { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'send_terminal_command', arguments: JSON.stringify({ command }) } }] } })

test('alias clarification carries scoped observations and recovers from prose to tools, then verifies fresh logs', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const { buildAgentConversation } = await import('../../src/client/components/ai/agent-conversation.js')
  const task = { id: 'now', conversationId: 'chat', machineKey: 'host-a', prompt: 'multica也叫missionos' }
  const previous = { ...task, id: 'prior', prompt: '查一下missionos的日志', response: '缺少日志，不能继续', agentRuntime: { state: 'blocked' }, toolCalls: [{ id: 'path', name: 'send_terminal_command', args: { command: 'ls /deploy' }, executed: true, result: { stdout: 'multica\nmultica-staging', exitCode: 0 } }] }
  task.conversationContext = buildAgentConversation(task, [previous, { ...previous, machineKey: 'host-b', prompt: 'SECRET_OTHER_HOST' }, task])
  const choices = []
  const executed = []
  let checks = 0
  const run = createAgentRun({
    requestModel: async (messages, config, choice) => {
      choices.push(choice)
      const context = JSON.stringify(messages)
      assert.match(context, /查一下missionos的日志/)
      assert.match(context, /multica也叫missionos/)
      assert.match(context, /multica-staging/)
      assert.doesNotMatch(context, /SECRET_OTHER_HOST/)
      if (choices.length === 1) return reply('还需要查看日志')
      if (choices.length === 2) { assert.equal(choice, 'required'); return command('logs', 'docker logs --tail 20 multica-backend-1') }
      assert.equal(choice, undefined)
      return reply('日志有连接超时')
    },
    requestVerification: async input => {
      assert.equal(input.conversation[0].turnId, 'prior')
      assert.ok(!input.observations.some(item => item.id === 'path'))
      return ++checks === 1
        ? { status: 'continue', nextAction: 'tool', reason: '需要实际日志' }
        : { status: 'complete', answer: 'MissionOS 后端日志显示数据库连接超时。', evidence: [{ toolCallId: 'logs', quote: 'database connection timeout' }] }
    },
    executeTool: async (name, args) => { executed.push(args.command); return { stdout: 'database connection timeout', exitCode: 0 } }
  })
  const result = await run.start(task)
  assert.equal(result.agentRuntime.state, 'final')
  assert.equal(executed.length, 1)
  assert.match(result.response, /数据库连接超时/)
  assert.equal(result.agentDiagnostics.filter(item => item.phase === 'model').length, 3)
  assert.doesNotMatch(JSON.stringify(result.agentDiagnostics), /multica|missionos|database|docker/)
})

test('context is rebuilt after queued work finishes, bounded, excludes later turns and new conversations', async () => {
  const { buildAgentConversation } = await import('../../src/client/components/ai/agent-conversation.js')
  const prior = { id: 'prior', conversationId: 'chat', machineKey: 'host', prompt: '查看服务日志', pending: true }
  const task = { ...prior, id: 'now', prompt: '继续' }
  const history = [prior, task, { ...prior, id: 'later', prompt: 'FUTURE' }]
  assert.equal(buildAgentConversation(task, history)[0].state, 'pending')
  prior.pending = false
  prior.toolCalls = [{ id: 'fresh', executed: true, result: { stdout: 'new result' } }]
  assert.match(JSON.stringify(buildAgentConversation(task, history)), /new result/)
  assert.doesNotMatch(JSON.stringify(buildAgentConversation(task, history)), /FUTURE/)
  assert.deepEqual(buildAgentConversation({ ...task, conversationId: 'new-chat' }, history), [])
  const large = Array.from({ length: 12 }, (_, id) => ({ ...prior, id: String(id), prompt: 'x'.repeat(4000), toolCalls: Array.from({ length: 10 }, (_, id) => ({ id: String(id), executed: true, args: { command: 'x'.repeat(8000) }, result: { stdout: 'x'.repeat(80000) } })) }))
  assert.ok(JSON.stringify(buildAgentConversation(task, large)).length <= 32000)
})

test('compaction preserves both prior goal context and current correction across a long run', async () => {
  const { compactAgentMessages } = await import('../../src/client/components/ai/agent-runtime.js')
  const anchors = [{ role: 'system', content: 'system' }, { role: 'user', content: 'prior goal' }, { role: 'user', content: 'latest correction' }]
  const tail = Array.from({ length: 40 }, (_, i) => ({ role: 'assistant', content: String(i) }))
  const compacted = compactAgentMessages([...anchors, ...tail], { pinnedMessages: anchors })
  assert.ok(compacted.some(item => item.content === 'latest correction'))
  assert.ok(compacted.some(item => item.content === 'prior goal'))
  assert.ok(compacted.length <= 24)
})

test('provider ignoring required calls recovers a structured action and returns verified evidence', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const choices = []
  const executed = []
  let checks = 0
  const run = createAgentRun({
    requestModel: async (messages, config, choice) => {
      choices.push(choice)
      return choices.length < 3 ? reply('我先查一下') : reply('已找到日志')
    },
    requestVerification: async ({ observations }) => ++checks < 3
      ? { status: 'continue', reason: '没有日志证据', nextAction: 'tool' }
      : { status: 'complete', answer: '今天的日志显示数据库连接超时。', evidence: [{ toolCallId: observations[0].id, quote: 'database timeout' }] },
    requestRecoveryAction: async () => command('recovered-logs', 'cd /deploy && docker compose logs --since today --tail 200'),
    executeTool: async (name, args) => { executed.push(args.command); return { stdout: 'database timeout', exitCode: 0 } }
  })
  const result = await run.start({ id: 'ignored', prompt: 'multica也叫missionos，在/deploy目录下，是docker部署的，查今天的日志' })
  assert.deepEqual(choices, [undefined, 'required', undefined])
  assert.deepEqual(executed, ['cd /deploy && docker compose logs --since today --tail 200'])
  assert.equal(result.agentRuntime.state, 'final')
  assert.match(result.response, /数据库连接超时/)
  assert.equal(result.agentDiagnostics.filter(item => item.phase === 'action_recovery').length, 1)
})

test('action recovery can make multiple evidence-driven steps when the provider repeatedly ignores tools', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const choices = []
  const executed = []
  const recoveryInputs = []
  let checks = 0
  const run = createAgentRun({
    requestModel: async (messages, config, choice) => {
      choices.push(choice)
      return choices.length < 5 ? reply('我继续确认一下') : reply('已经定位今天的错误日志')
    },
    requestVerification: async ({ observations }) => ++checks < 5
      ? { status: 'continue', reason: observations.length ? '还需要下一步证据' : '尚未执行检查', nextAction: 'tool' }
      : { status: 'complete', answer: 'MissionOS 今天出现数据库连接超时。', evidence: [{ toolCallId: observations[1].id, quote: 'database timeout' }] },
    requestRecoveryAction: async input => {
      recoveryInputs.push(input)
      return recoveryInputs.length === 1
        ? command('services', 'cd /deploy && docker compose config --services')
        : command('logs', 'cd /deploy && docker compose logs --since 24h backend')
    },
    executeTool: async (name, args) => {
      executed.push(args.command)
      return args.command.includes('config --services')
        ? { stdout: 'frontend\nbackend\npostgres', exitCode: 0 }
        : { stdout: 'backend | database timeout', exitCode: 0 }
    }
  })
  const result = await run.start({ id: 'multi-recovery', prompt: 'multica也叫missionos，在/deploy目录下，是docker部署的，查今天的日志' })
  assert.deepEqual(choices, [undefined, 'required', undefined, 'required', undefined])
  assert.deepEqual(executed, [
    'cd /deploy && docker compose config --services',
    'cd /deploy && docker compose logs --since 24h backend'
  ])
  assert.equal(recoveryInputs.length, 2)
  assert.match(JSON.stringify(recoveryInputs[1].observations), /frontend.*backend.*postgres/)
  assert.equal(result.agentRuntime.state, 'final')
  assert.match(result.response, /数据库连接超时/)
})

test('new conversation intent does not resume an old mutation and genuine user-input blockers stop', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const { validateRunConclusion } = await import('../../src/client/components/ai/agent-verification.js')
  const choices = []
  const run = createAgentRun({
    requestModel: async (messages, config, choice) => { choices.push(choice); return reply('你好') },
    requestVerification: async () => ({ status: 'complete', scope: 'conversation', answer: '你好！' }),
    executeTool: () => assert.fail('greeting does not authorize old modifications')
  })
  const result = await run.start({ id: 'new-intent', prompt: '你好', conversationContext: [{ user: '重启服务', state: 'blocked' }] })
  assert.equal(result.response, '你好！')
  assert.deepEqual(choices, [undefined])
  assert.equal(validateRunConclusion({ status: 'blocked', reason: '缺少日志' }, [], 'terminal').status, 'continue')
  assert.equal(validateRunConclusion({ status: 'blocked', blocker: 'user_input', reason: '请明确操作哪台机器' }, [], 'terminal').status, 'blocked')
})

test('answer-only repair does not force another command after sufficient evidence', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const choices = []
  let checks = 0
  let executions = 0
  const run = createAgentRun({
    requestModel: async (messages, config, choice) => {
      choices.push(choice)
      return choices.length === 1 ? command('version', 'nginx -v') : reply('当前版本')
    },
    requestVerification: async () => ++checks === 1
      ? { status: 'continue', nextAction: 'answer', reason: '只需修正版本表述，无需更多命令' }
      : { status: 'complete', answer: '版本为 1.27.5。', evidence: [{ toolCallId: 'version', quote: 'nginx/1.27.5' }] },
    executeTool: async () => { executions++; return { stderr: 'nginx/1.27.5', exitCode: 0 } }
  })
  const result = await run.start({ id: 'answer-repair', prompt: '查 nginx 版本' })
  assert.equal(result.agentRuntime.state, 'final')
  assert.deepEqual(choices, [undefined, undefined, undefined])
  assert.equal(executions, 1)
})

test('a complete verifier verdict with an invalid citation repairs the answer without rerunning a command', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const choices = []
  let checks = 0
  let executions = 0
  const run = createAgentRun({
    requestModel: async (messages, config, choice) => {
      choices.push(choice)
      return choices.length === 1 ? command('logs', 'docker compose logs --since 24h') : reply('今天的日志存在唯一约束冲突。')
    },
    requestVerification: async ({ observations }) => {
      const excerpt = observations[0].result.evidenceExcerpts.find(item => item.text.includes('duplicate key'))
      return ++checks === 1
        ? { status: 'complete', answer: '今天的日志存在唯一约束冲突。', evidence: [{ toolCallId: 'logs', evidenceId: 'logs:missing', quote: 'duplicate key' }] }
        : { status: 'complete', answer: '今天的日志存在唯一约束冲突。', evidence: [{ toolCallId: 'logs', evidenceId: excerpt.id, quote: 'duplicate key' }] }
    },
    executeTool: async () => {
      executions++
      return { stdout: `${'INFO ok\n'.repeat(3000)}ERROR duplicate key value violates unique constraint\n${'INFO ok\n'.repeat(3000)}`, exitCode: 0 }
    }
  })
  const result = await run.start({ id: 'citation-repair', prompt: '查今天的日志' })
  assert.equal(result.agentRuntime.state, 'final')
  assert.equal(executions, 1)
  assert.ok(choices.every(choice => choice !== 'required'))
})

test('failed execution is distinguished from a model that never calls tools', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let calls = 0
  const run = createAgentRun({
    requestModel: async () => ++calls === 2 ? command('logs', 'docker ps') : reply('需要继续检查'),
    requestVerification: async () => ({ status: 'continue', nextAction: 'tool', reason: '没有日志证据' }),
    executeTool: async () => { throw new Error('SSH channel unavailable') }
  })
  const result = await run.start({ id: 'connection-failure', prompt: '查服务日志' })
  assert.equal(result.agentRuntime.state, 'blocked')
  assert.match(result.response, /已收到工具调用/)
  assert.doesNotMatch(result.response, /模型未提供/)
})
