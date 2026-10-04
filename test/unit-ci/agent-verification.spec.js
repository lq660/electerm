const { test } = require('node:test')
const assert = require('node:assert/strict')

const command = (id, value) => ({ id, type: 'function', function: { name: 'send_terminal_command', arguments: JSON.stringify({ command: value }) } })
const reply = (content, calls) => ({ message: { role: 'assistant', content, ...(calls ? { tool_calls: calls } : {}) } })

test('verifier preserves structured file results, excludes unexecuted tools and bounds evidence size', async () => {
  const { buildRunObservations, buildVerificationMessages } = await import('../../src/client/components/ai/agent-verification.js')
  const observations = buildRunObservations([
    { id: 'skip', status: 'skipped', result: 'fake' },
    { id: 'files', name: 'sftp_list', executed: true, result: { list: [{ name: '.env' }] } },
    { id: 'large', name: 'send_terminal_command', executed: true, result: { stdout: 'x'.repeat(1000000) + 'last-line', exitCode: 0 } }
  ])
  assert.deepEqual(observations.map(item => item.id), ['files', 'large'])
  assert.match(observations[0].result.output, /\.env/)
  assert.ok(observations[1].result.output.length <= 16000)
  assert.ok(observations[1].result.outputTruncated)
  assert.match(observations[1].result.output, /last-line/)
  assert.ok(JSON.stringify(buildVerificationMessages({ observations })).length < 60000)
})

test('long command output preserves important middle evidence with a stable reference id', async () => {
  const { buildRunObservations, validateRunConclusion } = await import('../../src/client/components/ai/agent-verification.js')
  const output = [
    ...Array.from({ length: 500 }, (_, index) => `backend | INFO heartbeat ${index}`),
    'postgres | ERROR duplicate key value violates unique constraint "idx_one_pending_task_per_issue_agent_v2"',
    'postgres | DETAIL Key (issue_id, agent_id)=(issue-1, agent-1) already exists.',
    ...Array.from({ length: 500 }, (_, index) => `frontend | INFO request ${index}`)
  ].join('\n')
  const observations = buildRunObservations([
    { id: 'logs', name: 'send_terminal_command', executed: true, result: { stdout: output, exitCode: 0 } }
  ])
  const excerpt = observations[0].result.evidenceExcerpts.find(item => item.text.includes('duplicate key value'))
  assert.ok(excerpt)
  assert.match(excerpt.id, /^logs:line-/)
  assert.equal(validateRunConclusion({
    status: 'complete',
    answer: '今天的日志存在数据库唯一约束冲突。',
    evidence: [{ toolCallId: 'logs', evidenceId: excerpt.id, quote: 'duplicate key value violates unique constraint' }]
  }, observations, 'query').status, 'complete')
})

test('final gate rejects invented, cancelled and pending evidence, but accepts a verified failure fact', async () => {
  const { validateRunConclusion } = await import('../../src/client/components/ai/agent-verification.js')
  const verdict = { status: 'complete', answer: '查到结果', evidence: [{ toolCallId: 'a', quote: 'denied' }] }
  for (const result of [{ output: 'different' }, { output: 'denied', cancelled: true }, { output: 'denied', timedOut: true }, { output: 'denied', status: 'running' }]) {
    assert.equal(validateRunConclusion(verdict, [{ id: 'a', result }], 'query').status, 'continue')
  }
  assert.equal(validateRunConclusion(verdict, [{ id: 'a', result: { output: 'permission denied', exitCode: 1 } }], 'query').status, 'complete')
  assert.equal(validateRunConclusion({ ...verdict, evidence: [] }, [], 'query').status, 'continue')
})

test('verified plain text is normalized into a readable result without changing structured Markdown', async () => {
  const { buildVerificationMessages, formatRunAnswer } = await import('../../src/client/components/ai/agent-verification.js')
  assert.equal(formatRunAnswer('服务运行正常。'), '### 结论\n\n服务运行正常。')
  assert.equal(
    formatRunAnswer('结论：服务运行正常。\n\n- 状态为 active\n- 端口为 8080'),
    '### 结论\n\n服务运行正常。\n\n### 关键发现\n\n- 状态为 active\n- 端口为 8080'
  )
  assert.equal(formatRunAnswer('### 结论\n\n服务运行正常。'), '### 结论\n\n服务运行正常。')
  const presentationContract = buildVerificationMessages({ observations: [] })[0].content
  assert.match(presentationContract, /结论最多两句/)
  assert.match(presentationContract, /\*\*标签：\*\* 内容/)
  assert.match(presentationContract, /命令、路径、服务名、接口和状态码使用行内代码/)
})

test('unfinished owned background work prevents success even when earlier evidence is valid', async () => {
  const { validateRunConclusion } = await import('../../src/client/components/ai/agent-verification.js')
  const verdict = { status: 'complete', answer: '已完成', evidence: [{ toolCallId: 'a', quote: 'ok' }] }
  const observations = [
    { id: 'a', result: { output: 'ok', exitCode: 0 } },
    { id: 'b', tool: 'run_background_command', result: { taskId: 'job', status: 'running' } }
  ]
  assert.equal(validateRunConclusion(verdict, observations, 'mutation').status, 'continue')
  observations.push({ id: 'c', tool: 'get_background_task_status', result: { taskId: 'job', status: 'completed', exitCode: 0, output: 'done' } })
  assert.equal(validateRunConclusion(verdict, observations, 'mutation').status, 'complete')
})

test('AgentRun rejects an unsupported conclusion, continues collecting evidence and stops on a verified answer', async () => {
  const { createAgentRun } = await import('../../src/client/components/ai/agent-run.js')
  let turn = 0
  let checks = 0
  const executed = []
  const updates = []
  const run = createAgentRun({
    requestModel: async () => [
      reply('', [command('path', 'command -v nginx')]),
      reply('Nginx 版本是 2.0。'),
      reply('', [command('version', 'nginx -v')]),
      reply('Nginx 版本是 1.27.5。')
    ][turn++],
    requestVerification: async ({ observations }) => {
      checks++
      assert.ok(observations.every(item => item.id && item.result))
      if (checks === 1) return { status: 'continue', reason: '路径不能证明版本，读取实际版本。' }
      return { status: 'complete', answer: 'Nginx 当前版本为 1.27.5。', evidence: [{ toolCallId: 'version', quote: 'nginx/1.27.5' }] }
    },
    executeTool: async (name, args) => {
      executed.push(args.command)
      return { exitCode: 0, stdout: executed.length === 1 ? '/usr/sbin/nginx' : 'nginx version: nginx/1.27.5' }
    },
    onUpdate: value => updates.push(value)
  })
  const result = await run.start({ id: 'verify', prompt: '查 nginx 版本' })
  assert.equal(checks, 2)
  assert.equal(turn, 4)
  assert.deepEqual(executed, ['command -v nginx', 'nginx -v'])
  assert.equal(result.agentRuntime.state, 'final')
  assert.equal(result.response, '### 结论\n\nNginx 当前版本为 1.27.5。')
  assert.ok(updates.every(value => !value.response?.includes('2.0')))
})
