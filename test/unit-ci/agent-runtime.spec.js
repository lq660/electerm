const { test } = require('node:test')
const assert = require('node:assert/strict')

test('runtime only accepts structured shell tool calls', async () => {
  const runtime = await import('../../src/client/components/ai/agent-runtime.js')

  assert.equal(runtime.isStructuredShellToolCall({
    id: 'call-1',
    function: { name: 'send_terminal_command', arguments: '{"command":"uname -a"}' }
  }), true)
  assert.equal(runtime.isStructuredShellToolCall({
    content: 'command -v nginx'
  }), false)
  assert.equal(runtime.isStructuredShellToolCall({
    function: { name: 'send_terminal_command', arguments: '{"command":"Up 33 minutes"}' }
  }), true)
  assert.deepEqual(runtime.getStructuredToolArguments({
    id: 'call-2',
    function: { name: 'send_terminal_command', arguments: '{"command":"pwd","tabId":"tab-1"}' }
  }), {
    name: 'send_terminal_command',
    callId: 'call-2',
    command: 'pwd',
    tabId: 'tab-1',
    timeout: null
  })
})

test('risk policy only escalates destructive operations', async () => {
  const { classifyCommandRisk, isDestructiveCommand } = await import('../../src/client/components/ai/agent-runtime.js')

  assert.equal(classifyCommandRisk('systemctl restart nginx'), 'medium')
  assert.equal(classifyCommandRisk('npm install -g openclaw@latest'), 'medium')
  assert.equal(classifyCommandRisk('rm -rf /tmp/example'), 'high')
  assert.equal(classifyCommandRisk('docker volume prune'), 'high')
  assert.equal(isDestructiveCommand('journalctl -u codexapi -n 50 --no-pager'), false)
})

test('runtime does not finalize without evidence', async () => {
  const {
    AGENT_EVENTS,
    AGENT_STATES,
    canFinalizeAgentTask,
    createAgentRuntimeState,
    transitionAgentRuntime
  } = await import('../../src/client/components/ai/agent-runtime.js')

  let state = createAgentRuntimeState({ taskId: 'task-1', goal: '查 nginx 版本', kind: 'terminal' })
  state = transitionAgentRuntime(state, AGENT_EVENTS.START)
  state = transitionAgentRuntime(state, AGENT_EVENTS.TOOL_REQUESTED, { requiresApproval: false, toolCall: true })
  state = transitionAgentRuntime(state, AGENT_EVENTS.TOOL_FINISHED, { toolCall: true })
  assert.equal(state.state, AGENT_STATES.OBSERVING)
  assert.equal(canFinalizeAgentTask({ state: state.state, hasEvidence: false }), false)

  state = transitionAgentRuntime(state, AGENT_EVENTS.EVIDENCE_FOUND, { evidence: 'call-1' })
  state = transitionAgentRuntime(state, AGENT_EVENTS.VERIFICATION_PASSED)
  assert.equal(canFinalizeAgentTask({ state: state.state, hasEvidence: true }), true)
  assert.equal(state.state, AGENT_STATES.FINAL)
})

test('approval and cancellation are terminally visible states', async () => {
  const { AGENT_EVENTS, AGENT_STATES, createAgentRuntimeState, transitionAgentRuntime } = await import('../../src/client/components/ai/agent-runtime.js')

  let state = transitionAgentRuntime(createAgentRuntimeState({ taskId: 'task-2' }), AGENT_EVENTS.START)
  state = transitionAgentRuntime(state, AGENT_EVENTS.APPROVAL_REQUIRED)
  assert.equal(state.state, AGENT_STATES.AWAITING_APPROVAL)
  state = transitionAgentRuntime(state, AGENT_EVENTS.CANCEL)
  assert.equal(state.state, AGENT_STATES.CANCELLED)
})

test('compacts long transcripts without dangling tool responses', async () => {
  const { compactAgentMessages } = await import('../../src/client/components/ai/agent-runtime.js')
  const messages = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: '查 nginx 版本' },
    { role: 'assistant', content: '先检查路径', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'send_terminal_command', arguments: '{"command":"command -v nginx"}' } }] },
    { role: 'tool', tool_call_id: 'call-1', content: 'x'.repeat(20000) },
    { role: 'assistant', content: '继续确认版本', tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'send_terminal_command', arguments: '{"command":"nginx -v 2>&1"}' } }] },
    { role: 'tool', tool_call_id: 'call-2', content: 'nginx version: nginx/1.27.5' },
    { role: 'assistant', content: '结论：nginx 1.27.5' }
  ]

  const compacted = compactAgentMessages(messages, { maxMessages: 6, maxChars: 3000, toolOutputMaxChars: 500 })
  assert.equal(compacted[0].role, 'system')
  assert.equal(compacted[1].role, 'user')
  assert.ok(compacted.some(item => item.role === 'tool' && item.tool_call_id === 'call-2'))
  assert.ok(compacted.some(item => item.role === 'assistant' && item.tool_calls?.some(call => call.id === 'call-2')))
  assert.ok(compacted.every(item => item.content?.length <= 2200 || item.role === 'assistant' || item.role === 'system'))
})

test('detects repeated actions and unchanged observations', async () => {
  const {
    createAgentProgressTracker,
    recordAgentProgress
  } = await import('../../src/client/components/ai/agent-runtime.js')

  let tracker = createAgentProgressTracker({ maxRepeatedActions: 2, maxUnchangedObservations: 2 })
  let progress = recordAgentProgress(tracker, { action: 'systemctl status nginx', observation: 'inactive' })
  tracker = progress.tracker
  assert.equal(progress.stuck, false)
  progress = recordAgentProgress(tracker, { action: 'systemctl status nginx', observation: 'inactive' })
  tracker = progress.tracker
  assert.equal(progress.stuck, false)
  progress = recordAgentProgress(tracker, { action: 'systemctl status nginx', observation: 'inactive' })
  assert.equal(progress.stuck, true)
  assert.match(progress.reason, /重复|相同结果/)
})
