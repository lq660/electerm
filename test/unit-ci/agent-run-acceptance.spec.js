const { test } = require('node:test')
const assert = require('node:assert/strict')

const reply = (content, calls) => ({ message: { role: 'assistant', content, ...(calls ? { tool_calls: calls } : {}) } })
const call = (id, command, name = 'send_terminal_command') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(name === 'sftp_del' ? { remotePath: command } : { command }) } })
const task = { id: 'acceptance', prompt: '检查并修复应用，确认恢复正常' }
const deferred = () => {
  let resolve
  const promise = new Promise(_resolve => { resolve = _resolve })
  return { promise, resolve }
}

test('identical provider tool ids in concurrent runs get separate approval handles', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const ids = []
  const makeRun = () => createAgentRun({
    requestModel: async () => reply('', [call('same-provider-id', '/tmp/test', 'sftp_del')]),
    requestApproval: async id => { ids.push(id); return { approved: false } },
    executeTool: () => assert.fail('unapproved deletion must not execute')
  })
  await Promise.all([makeRun().start({ ...task, id: 'one' }), makeRun().start({ ...task, id: 'two' })])
  assert.deepEqual(ids.sort(), ['one:same-provider-id', 'two:same-provider-id'])
})

test('failed verification allows corrective work and a fresh post-change check', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const steps = [reply('', [call('initial', 'cat /tmp/app-state')]), reply('已经正常'), reply('', [call('fix', 'appctl repair')]), reply('', [call('after', 'cat /tmp/app-state')]), reply('正常')]
  const commands = []
  let checks = 0
  const run = createAgentRun({
    requestModel: async () => steps.shift(),
    requestVerification: async ({ observations }) => ++checks === 1
      ? { status: 'continue', reason: '实际状态为 failed，应修复后重新检查' }
      : { status: 'complete', answer: '应用已恢复正常，修复后检查为 healthy。', evidence: [{ toolCallId: observations.at(-1).id, quote: 'healthy' }] },
    executeTool: async (name, args) => { commands.push(args.command); return { stdout: commands.length === 1 ? 'failed' : 'healthy', exitCode: 0 } }
  })
  const result = await run.start(task)
  assert.equal(result.agentRuntime.state, 'final')
  assert.deepEqual(commands, ['cat /tmp/app-state', 'appctl repair', 'cat /tmp/app-state'])
  assert.equal(checks, 2)
})

test('enough evidence finishes even when the candidate merely promises another check', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let turns = 0
  let commands = 0
  const run = createAgentRun({
    requestModel: async () => turns++ === 0 ? reply('', [call('state', 'cat /tmp/app-state')]) : reply('我再确认一次'),
    requestVerification: async () => ({ status: 'complete', answer: '应用正常。', evidence: [{ toolCallId: 'state', quote: 'healthy' }] }),
    executeTool: async () => { commands++; return { stdout: 'healthy', exitCode: 0 } }
  })
  const result = await run.start(task)
  assert.equal(result.response, '### 结论\n\n应用正常。')
  assert.equal(turns, 2)
  assert.equal(commands, 1)
})

test('malformed verification and unsupported conclusions never leak as final success', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let calls = 0
  const run = createAgentRun({
    requestModel: async () => { calls++; return reply('已成功升级') },
    requestVerification: async () => { throw new Error('invalid JSON') }
  })
  const result = await run.start(task)
  assert.equal(result.agentRuntime.state, 'blocked')
  assert.equal(calls, 3)
  assert.doesNotMatch(result.response, /已成功升级/)
})

test('repeated state-changing commands execute once and terminate a no-progress loop', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let executions = 0
  let round = 0
  const run = createAgentRun({
    requestModel: async () => reply('', [call(`repeat-${round++}`, 'systemctl restart example')]),
    executeTool: async () => { executions++; return { exitCode: 1, stderr: 'unavailable' } }
  })
  const result = await run.start(task)
  assert.equal(executions, 1)
  assert.equal(round, 4)
  assert.equal(result.agentRuntime.state, 'blocked')
})

test('long tasks continue past the former turn cap with compact rolling context', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const prompt = '依次检查多个不同状态，取得完整证据后汇总结论'
  const requestBatches = []
  const commands = []
  let round = 0
  const run = createAgentRun({
    requestModel: async messages => {
      // 2026-09-23 coder(lq): Snapshot each provider request because early uncompressed
      // requests may share the live transcript array, which keeps growing after return.
      requestBatches.push(messages.map(message => ({ ...message })))
      round++
      return round <= 35
        ? reply('', [call(`long-${round}`, `echo step-${round}`)])
        : reply('检查完成')
    },
    requestVerification: async ({ observations }) => ({
      status: 'complete',
      answer: '长任务已完成。',
      evidence: [{ toolCallId: observations.at(-1).id, quote: 'step-35' }]
    }),
    executeTool: async (name, args) => {
      commands.push(args.command)
      return { stdout: args.command.replace('echo ', ''), exitCode: 0 }
    }
  })
  const result = await run.start({ id: 'long-run', prompt })
  const finalBatch = requestBatches.at(-1)
  assert.equal(result.agentRuntime.state, 'final')
  assert.equal(round, 36)
  assert.equal(commands.length, 35)
  assert.ok(requestBatches.every(messages => messages.length <= 24))
  assert.ok(finalBatch.some(message => message.role === 'user' && String(message.content).includes(prompt)))
  assert.ok(finalBatch.some(message => message.role === 'tool' && String(message.content).includes('step-35')))
  assert.doesNotMatch(result.response, /轮次上限/)
})

test('stop settles while provider is hanging and ignores its eventual response', { timeout: 2000 }, async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const started = deferred()
  const provider = deferred()
  const updates = []
  let signal
  const run = createAgentRun({
    requestModel: (messages, config, choice, options) => { signal = options.signal; started.resolve(); return provider.promise },
    executeTool: () => assert.fail('late tool must never execute'),
    onUpdate: value => updates.push(value)
  })
  const pending = run.start(task)
  await started.promise
  run.stop()
  const result = await pending
  assert.equal(signal.aborted, true)
  assert.equal(result.agentRuntime.state, 'cancelled')
  const count = updates.length
  provider.resolve(reply('', [call('late', 'pwd')]))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(updates.length, count)
})

test('stopping a pending tool signals its execution id without cancelling another run', { timeout: 2000 }, async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const started = deferred()
  let toolContext
  const one = createAgentRun({
    requestModel: async () => reply('', [call('owned', 'sleep 20')]),
    executeTool: (name, args, context) => { toolContext = context; started.resolve(); return new Promise(() => {}) }
  })
  const two = createAgentRun({
    requestModel: async () => reply('你好'),
    requestVerification: async () => ({ status: 'complete', scope: 'conversation', answer: '你好！' })
  })
  const pending = one.start(task)
  await started.promise
  one.stop()
  assert.equal((await pending).agentRuntime.state, 'cancelled')
  assert.equal(toolContext.executionId, 'acceptance:owned')
  assert.equal(toolContext.signal.aborted, true)
  assert.equal((await two.start({ id: 'other', prompt: '你好' })).response, '你好！')
})

test('deletion through SFTP requires approval and stopping that wait never executes it', { timeout: 2000 }, async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const waiting = deferred()
  const run = createAgentRun({
    requestModel: async () => reply('', [call('delete', '/tmp/example', 'sftp_del')]),
    requestApproval: () => { waiting.resolve(); return new Promise(() => {}) },
    executeTool: () => assert.fail('unapproved deletion')
  })
  const pending = run.start({ ...task, prompt: '删除指定文件' })
  await waiting.promise
  run.stop()
  assert.equal((await pending).agentRuntime.state, 'cancelled')
})

test('stop during verification discards a late success', { timeout: 2000 }, async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  const waiting = deferred()
  const verification = deferred()
  const run = createAgentRun({
    requestModel: async () => reply('done'),
    requestVerification: () => { waiting.resolve(); return verification.promise }
  })
  const pending = run.start(task)
  await waiting.promise
  run.stop()
  assert.equal((await pending).agentRuntime.state, 'cancelled')
  verification.resolve({ status: 'complete', answer: 'success' })
})
