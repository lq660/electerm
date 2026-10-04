/**
 * Small, provider-agnostic control layer for AI Shell tasks.
 * The model proposes actions; this module owns lifecycle and completion rules.
 */

export const AGENT_STATES = Object.freeze({
  UNDERSTANDING: 'understanding',
  PLANNING: 'planning',
  AWAITING_APPROVAL: 'awaiting_approval',
  EXECUTING: 'executing',
  OBSERVING: 'observing',
  VERIFYING: 'verifying',
  FINAL: 'final',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled'
})

export const AGENT_EVENTS = Object.freeze({
  START: 'task.started',
  TOOL_REQUESTED: 'tool.requested',
  APPROVAL_REQUIRED: 'approval.required',
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_REJECTED: 'approval.rejected',
  TOOL_STARTED: 'tool.started',
  TOOL_FINISHED: 'tool.finished',
  EVIDENCE_FOUND: 'verification.required',
  VERIFICATION_PASSED: 'verification.passed',
  VERIFICATION_FAILED: 'verification.failed',
  BLOCK: 'task.blocked',
  CANCEL: 'task.cancelled',
  FINAL: 'task.final'
})

const TERMINAL_STATES = new Set([
  AGENT_STATES.FINAL,
  AGENT_STATES.BLOCKED,
  AGENT_STATES.CANCELLED
])

const DESTRUCTIVE_PATTERNS = [
  /(?:^|[\s;&|])(?:rm|rmdir|unlink|shred|wipefs|mkfs(?:\.[\w-]+)?|dd|fdisk|parted)(?:\s|$)/i,
  /(?:^|[\s;&|])(?:drop|truncate|destroy|purge|format)(?:\s|$)/i,
  /\b(?:docker|podman)\s+(?:volume\s+)?(?:rm|remove|prune)\b/i,
  /\b(?:kubectl\s+delete|helm\s+uninstall)\b/i,
  /\bgit\s+(?:reset\s+--hard|clean\s+-[^\n]*f)\b/i,
  /(?:^|[\s;&|])find\b[^\n;|]*\s-delete\b/i,
  /(?:^|[\s;&|])(?:curl|wget)\b[^\n;|]*\|\s*(?:ba)?sh\b/i,
  /(?:^|[\s;&|])\d*>>?\s*(?!&|\/dev\/null\b)/
]

function normalizeCommand (command = '') {
  return String(command || '').trim()
}

export function isDestructiveCommand (command = '') {
  const normalized = normalizeCommand(command)
  return Boolean(normalized) && DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(normalized))
}

export function classifyCommandRisk (command = '') {
  return isDestructiveCommand(command) ? 'high' : 'medium'
}

export function isStructuredShellToolCall (toolCall) {
  const fn = toolCall?.function || toolCall
  if (!fn || typeof fn !== 'object') return false
  if (!['send_terminal_command', 'run_background_command'].includes(fn.name)) return false
  let args = fn.arguments
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return false
    }
  }
  return Boolean(args && typeof args.command === 'string' && args.command.trim())
}

export function getStructuredToolArguments (toolCall) {
  if (!isStructuredShellToolCall(toolCall)) return null
  const fn = toolCall.function || toolCall
  const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments
  return {
    name: fn.name,
    callId: toolCall.id || null,
    command: normalizeCommand(args.command),
    tabId: args.tabId || null,
    timeout: args.timeout || null
  }
}

export function createAgentRuntimeState ({ taskId, goal, kind = 'conversation' } = {}) {
  return {
    taskId: taskId || null,
    goal: String(goal || '').trim(),
    kind,
    state: AGENT_STATES.UNDERSTANDING,
    iteration: 0,
    toolCalls: 0,
    evidence: [],
    lastError: null,
    updatedAt: Date.now()
  }
}

function nextStateForEvent (state, event, payload = {}) {
  if (event === AGENT_EVENTS.CANCEL) return AGENT_STATES.CANCELLED
  if (event === AGENT_EVENTS.BLOCK) return AGENT_STATES.BLOCKED
  if (event === AGENT_EVENTS.START) return AGENT_STATES.PLANNING
  if (event === AGENT_EVENTS.TOOL_REQUESTED) {
    return payload.requiresApproval ? AGENT_STATES.AWAITING_APPROVAL : AGENT_STATES.EXECUTING
  }
  if (event === AGENT_EVENTS.APPROVAL_REQUIRED) return AGENT_STATES.AWAITING_APPROVAL
  if (event === AGENT_EVENTS.APPROVAL_GRANTED) return AGENT_STATES.EXECUTING
  if (event === AGENT_EVENTS.APPROVAL_REJECTED) return AGENT_STATES.BLOCKED
  if (event === AGENT_EVENTS.TOOL_STARTED) return AGENT_STATES.EXECUTING
  if (event === AGENT_EVENTS.TOOL_FINISHED) return AGENT_STATES.OBSERVING
  if (event === AGENT_EVENTS.EVIDENCE_FOUND) return AGENT_STATES.VERIFYING
  if (event === AGENT_EVENTS.VERIFICATION_FAILED) return AGENT_STATES.PLANNING
  if (event === AGENT_EVENTS.VERIFICATION_PASSED) return AGENT_STATES.FINAL
  if (event === AGENT_EVENTS.FINAL && payload.canFinish) return AGENT_STATES.FINAL
  return state
}

export function transitionAgentRuntime (current, event, payload = {}) {
  const state = current || createAgentRuntimeState()
  if (TERMINAL_STATES.has(state.state) && event !== AGENT_EVENTS.CANCEL) {
    return state
  }
  const next = nextStateForEvent(state.state, event, payload)
  const evidence = payload.evidence
    ? [...new Set([...state.evidence, ...[].concat(payload.evidence).filter(Boolean)])]
    : state.evidence
  return {
    ...state,
    state: next,
    iteration: payload.iteration === undefined ? state.iteration : payload.iteration,
    toolCalls: payload.toolCall ? state.toolCalls + 1 : state.toolCalls,
    evidence,
    lastError: payload.error || (event === AGENT_EVENTS.BLOCK ? payload.reason || state.lastError : null),
    updatedAt: Date.now()
  }
}

export function canFinalizeAgentTask ({ state, hasEvidence, hasVerifiedMutation = true, blocked = false } = {}) {
  if (blocked || state === AGENT_STATES.BLOCKED || state === AGENT_STATES.CANCELLED) return false
  if (!hasEvidence) return false
  return hasVerifiedMutation
}

export function buildAgentEvent (type, payload = {}) {
  return {
    type,
    timestamp: Date.now(),
    ...payload
  }
}

// 2026-09-02 coder(lq): Detect agents that keep issuing the same action or
// receiving an unchanged observation. A bounded repair turn is safer than
// allowing a provider to burn the whole iteration budget in a loop.
export function createAgentProgressTracker (options = {}) {
  return {
    maxRepeatedActions: Math.max(1, Number(options.maxRepeatedActions) || 2),
    maxUnchangedObservations: Math.max(1, Number(options.maxUnchangedObservations) || 2),
    lastAction: '',
    repeatedActions: 0,
    lastObservation: '',
    unchangedObservations: 0
  }
}

function progressFingerprint (value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ').slice(0, 8000)
  try {
    return JSON.stringify(value).slice(0, 8000)
  } catch {
    return String(value).slice(0, 8000)
  }
}

export function recordAgentProgress (tracker, { action = '', observation = '' } = {}) {
  const current = tracker || createAgentProgressTracker()
  const actionFingerprint = progressFingerprint(action)
  const observationFingerprint = progressFingerprint(observation)
  const repeatedActions = actionFingerprint && actionFingerprint === current.lastAction
    ? current.repeatedActions + 1
    : 0
  const unchangedObservations = observationFingerprint && observationFingerprint === current.lastObservation
    ? current.unchangedObservations + 1
    : 0
  const next = {
    ...current,
    lastAction: actionFingerprint,
    repeatedActions,
    lastObservation: observationFingerprint,
    unchangedObservations
  }
  const repeated = repeatedActions >= current.maxRepeatedActions
  const unchanged = unchangedObservations >= current.maxUnchangedObservations
  return {
    tracker: next,
    stuck: repeated || unchanged,
    reason: repeated
      ? '代理重复提交了相同命令'
      : unchanged
        ? '连续命令返回了相同结果'
        : ''
  }
}

// 2026-09-02 coder(lq): Keep the goal and the latest tool evidence while bounding provider context.
// Tool messages are retained with their assistant tool-call parent so providers never receive a
// dangling tool response after older transcript entries are compacted.
export function compactAgentMessages (messages = [], options = {}) {
  const source = Array.isArray(messages) ? messages : []
  const maxMessages = Math.max(6, Number(options.maxMessages) || 24)
  const maxChars = Math.max(12000, Number(options.maxChars) || 80000)
  const toolOutputMaxChars = Math.max(1200, Number(options.toolOutputMaxChars) || 12000)
  if (source.length <= maxMessages && source.reduce((sum, item) => sum + contentLength(item), 0) <= maxChars) {
    return source
  }

  const systemIndex = source.findIndex(item => item?.role === 'system')
  const goalIndex = source.findIndex((item, index) => index !== systemIndex && item?.role === 'user')
  const selected = new Set()
  if (systemIndex >= 0) selected.add(systemIndex)
  if (goalIndex >= 0) selected.add(goalIndex)
  // 2026-09-09 coder(lq): Multi-turn context and the latest instruction are separate anchors; compaction must not discard the user's correction.
  for (const message of options.pinnedMessages || []) {
    const index = source.indexOf(message)
    if (index >= 0) selected.add(index)
  }
  const anchors = new Set(selected)

  const tailStart = Math.max(0, source.length - maxMessages)
  for (let index = tailStart; index < source.length; index++) selected.add(index)

  // Keep assistant/tool pairs valid after selecting the recent tail.
  for (const index of [...selected]) {
    const item = source[index]
    if (item?.role === 'tool') {
      const parentIndex = findToolCallParent(source, index)
      if (parentIndex >= 0) selected.add(parentIndex)
    }
    if (item?.role === 'assistant' && Array.isArray(item.tool_calls)) {
      const callIds = new Set(item.tool_calls.map(call => call?.id).filter(Boolean))
      source.forEach((candidate, candidateIndex) => {
        if (candidateIndex > index && candidate?.role === 'tool' && callIds.has(candidate.tool_call_id)) {
          selected.add(candidateIndex)
        }
      })
    }
  }

  const compacted = [...selected].sort((a, b) => a - b).map(index => ({
    ...source[index],
    __sourceIndex: index,
    content: compactMessageContent(source[index], toolOutputMaxChars)
  }))

  // Trim oldest non-anchor messages first if pair preservation still exceeds the budget.
  while (compacted.length > maxMessages) {
    const removable = compacted.findIndex(item => {
      if (anchors.has(item.__sourceIndex)) return false
      return !isToolPairMessage(item, compacted)
    })
    if (removable >= 0) {
      compacted.splice(removable, 1)
      continue
    }
    // Every remaining item belongs to a pair. Remove the oldest complete pair together.
    const firstPairIndex = compacted.findIndex(item => !anchors.has(item.__sourceIndex))
    if (firstPairIndex < 0) break
    const pairIndexes = getToolPairIndexes(compacted, firstPairIndex)
    pairIndexes.sort((a, b) => b - a).forEach(index => compacted.splice(index, 1))
  }

  let total = compacted.reduce((sum, item) => sum + contentLength(item), 0)
  if (total > maxChars) {
    for (let index = 0; index < compacted.length && total > maxChars; index++) {
      const item = compacted[index]
      if (item.role !== 'tool') continue
      const shortened = compactMessageContent(item, 2000)
      total -= contentLength(item) - contentLength(shortened)
      item.content = shortened
    }
  }
  if (total > maxChars) {
    for (let index = 0; index < compacted.length && total > maxChars; index++) {
      const item = compacted[index]
      if (item.role === 'system' || item.role === 'tool') continue
      const shortened = compactMessageContent(item, 4000)
      total -= contentLength(item) - contentLength(shortened)
      item.content = shortened
    }
  }

  return compacted.map(({ __sourceIndex, ...message }) => message)
}

function contentLength (message) {
  const content = message?.content
  if (typeof content === 'string') return content.length
  if (content == null) return 0
  // 2026-09-09 coder(lq): Base64 transport bytes are not text tokens; otherwise one screenshot prematurely truncates all subsequent tool evidence.
  if (Array.isArray(content)) return content.reduce((sum, part) => sum + (part.type === 'image_url' ? 4000 : String(part.text || '').length), 0)
  try {
    return JSON.stringify(content).length
  } catch {
    return String(content).length
  }
}

function compactMessageContent (message, maxLength) {
  if (typeof message?.content !== 'string' || message.content.length <= maxLength) {
    return message?.content
  }
  const omitted = message.content.length - maxLength
  return `${message.content.slice(0, maxLength).trimEnd()}\n…（已压缩较早输出 ${omitted} 个字符）`
}

function findToolCallParent (messages, toolIndex) {
  const toolCallId = messages[toolIndex]?.tool_call_id
  if (!toolCallId) return -1
  for (let index = toolIndex - 1; index >= 0; index--) {
    const calls = messages[index]?.tool_calls
    if (messages[index]?.role === 'assistant' && Array.isArray(calls) && calls.some(call => call?.id === toolCallId)) {
      return index
    }
  }
  return -1
}

function getToolPairIndexes (messages, index) {
  const item = messages[index]
  if (item?.role === 'tool') {
    const parent = messages.findIndex(candidate => candidate?.role === 'assistant' && candidate.tool_calls?.some(call => call?.id === item.tool_call_id))
    return parent >= 0 ? [parent, index] : [index]
  }
  if (item?.role === 'assistant' && Array.isArray(item.tool_calls)) {
    const ids = new Set(item.tool_calls.map(call => call?.id).filter(Boolean))
    const children = messages.map((candidate, candidateIndex) => candidate?.role === 'tool' && ids.has(candidate.tool_call_id) ? candidateIndex : -1).filter(candidateIndex => candidateIndex >= 0)
    return [index, ...children]
  }
  return [index]
}

function isToolPairMessage (item, messages) {
  return item?.role === 'tool' || (item?.role === 'assistant' && Array.isArray(item.tool_calls) && getToolPairIndexes(messages, messages.indexOf(item)).length > 1)
}
