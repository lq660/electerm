import { executeToolCall, getAgentTools } from './agent-tools.js'
import {
  finishAgentScope,
  getAgentRunningScopeId,
  startAgentScope
} from '../../common/agent-running-scopes.js'
import { createAgentRun } from './agent-run.js'
import { buildVerificationMessages } from './agent-verification.js'
import { buildAgentConversation } from './agent-conversation.js'
import { buildActionRecoveryMessages, parseRecoveredToolCall } from './agent-action-recovery.js'
export * from './agent-policy.js'
export { hasAnswerEvidence, hasRelevantAnswerEvidence, normalizeToolResult } from './agent-result-utils.js'

const AGENT_CONFIRMATION_TIMEOUT = 15 * 60 * 1000
// 2026-08-30 coder(lq): Keep risky-command approval resumable so the UI can approve or skip a tool call without abandoning the agent loop.
const pendingAgentConfirmations = new Map()
// 2026-09-01 coder(lq): Keep a small task registry so the AI Shell status bar can stop the active or queued task without exposing implementation details in the transcript.
const activeAgentTasks = new Map()
const activeRuns = new Map()
// 2026-09-23 coder(lq): Own task startup outside React rows so sending begins immediately and cannot depend on a history item mounting after a tab switch.
const managedAgentTasks = new Map()

export function stopAgentRun (taskId) {
  activeRuns.get(taskId)?.stop()
}

export function registerAgentTask (taskId, stop) {
  if (!taskId || typeof stop !== 'function') {
    return () => {}
  }
  activeAgentTasks.set(taskId, stop)
  return () => {
    if (activeAgentTasks.get(taskId) === stop) {
      activeAgentTasks.delete(taskId)
    }
  }
}

export function stopAgentTask (taskId) {
  const stop = activeAgentTasks.get(taskId)
  if (stop) {
    stop()
    return true
  }
  // A queued item can be rendered before its component registers the callback.
  // Mark it stopped here so the status bar never leaves a stale queue badge.
  const history = window.store?.aiChatHistory || []
  const item = history.find(entry => entry.id === taskId)
  if (!item || (!item.pending && !item.queued)) {
    return false
  }
  Object.assign(item, {
    pending: false,
    queued: false,
    isStreaming: false,
    response: String(item.response || '').trim() + '\n\n任务已手动停止。'
  })
  window.store.aiChatHistory = [...history]
  return true
}

function waitForAgentConfirmation (toolCallId, abortRef) {
  return new Promise(resolve => {
    const startedAt = Date.now()
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      const pending = pendingAgentConfirmations.get(toolCallId)
      if (pending?.finish === finish) {
        pendingAgentConfirmations.delete(toolCallId)
      }
      resolve(result)
    }
    pendingAgentConfirmations.set(toolCallId, { finish })

    const check = () => {
      if (settled) return
      if (abortRef?.current) {
        finish({ approved: false, cancelled: true, reason: '用户停止了代理任务' })
        return
      }
      if (Date.now() - startedAt >= AGENT_CONFIRMATION_TIMEOUT) {
        finish({ approved: false, expired: true, reason: '确认等待已超时' })
        return
      }
      setTimeout(check, 250)
    }
    check()
  })
}

export function confirmAgentToolCall (toolCallId) {
  const pending = pendingAgentConfirmations.get(toolCallId)
  if (!pending) return false
  pending.finish({ approved: true })
  return true
}

export function rejectAgentToolCall (toolCallId) {
  const pending = pendingAgentConfirmations.get(toolCallId)
  if (!pending) return false
  pending.finish({ approved: false, rejected: true, reason: '用户跳过了该命令' })
  return true
}

function updateChatEntry (chatEntry, updates) {
  const index = window.store.aiChatHistory.findIndex(i => i.id === chatEntry.id)
  if (index !== -1) {
    Object.assign(window.store.aiChatHistory[index], updates)
    window.store.aiChatHistory = [...window.store.aiChatHistory]
  }
}

function getAgentTaskConfig (chatEntry) {
  return {
    modelAI: chatEntry.modelAI,
    roleAI: chatEntry.roleAI,
    baseURLAI: chatEntry.baseURLAI,
    apiPathAI: chatEntry.apiPathAI,
    apiKeyAI: chatEntry.apiKeyAI,
    proxyAI: chatEntry.proxyAI,
    authHeaderNameAI: chatEntry.authHeaderNameAI,
    reasoningEffortAI: chatEntry.reasoningEffortAI,
    terminalExecutionChannelAI: chatEntry.terminalExecutionChannelAI,
    languageAI: chatEntry.languageAI,
    terminalExecutionEnabled: chatEntry.terminalExecutionEnabled
  }
}

const agentQueues = new Map()

function isAgentEntryActive (chatEntry) {
  return Boolean(window.store?.aiChatHistory?.some(item => item.id === chatEntry.id))
}

async function callBackendAIchatWithTools (messages, config, toolChoice, options = {}) {
  const requestId = crypto.randomUUID()
  let streamSessionId
  const cancel = () => {
    window.pre.runGlobalAsync('cancelAIRequest', requestId).catch(() => {})
    if (streamSessionId) window.pre.runGlobalAsync('stopStream', streamSessionId).catch(() => {})
  }
  if (options.signal?.aborted) throw new Error('任务已停止')
  options.signal?.addEventListener('abort', cancel, { once: true })
  try {
    const result = await window.pre.runGlobalAsync(
      'AIchatWithTools',
      messages,
      config.modelAI,
      config.baseURLAI,
      config.apiPathAI,
      config.apiKeyAI,
      config.proxyAI,
      options.verification ? [] : getAgentTools(config),
      config.authHeaderNameAI,
      config.reasoningEffortAI,
      toolChoice,
      requestId,
      !options.verification
    )
    if (!result?.isStream || !result.sessionId) return result

    streamSessionId = result.sessionId
    // 2026-09-09 coder(lq): Stream assistant text into the active turn, but return tool calls only after the provider's completion marker.
    while (!options.signal?.aborted) {
      const state = await window.pre.runGlobalAsync('getStreamContent', streamSessionId)
      if (state.content !== undefined) options.onDelta?.(state.content)
      if (state.error || !state.hasMore) return state
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    throw new Error('任务已停止')
  } finally {
    options.signal?.removeEventListener('abort', cancel)
  }
}

async function requestVerification (input, config, options) {
  const result = await callBackendAIchatWithTools(buildVerificationMessages(input), config, undefined, { ...options, verification: true })
  if (result.error) throw new Error(result.error)
  return JSON.parse(result.message?.content || '')
}

async function requestRecoveryAction (input, config, options) {
  const availableTools = getAgentTools(config)
  const messages = buildActionRecoveryMessages({ ...input, availableTools })
  const result = await callBackendAIchatWithTools(messages, config, undefined, { ...options, verification: true })
  if (result.error) throw new Error(result.error)
  const message = parseRecoveredToolCall(result.message?.content, availableTools, `recovery-${crypto.randomUUID()}`)
  if (!message) throw new Error('动作恢复没有返回有效的结构化工具调用')
  return { message }
}

// 2026-09-08 coder(lq): Keep app storage and IPC at the adapter, never inside AgentRun.
async function runAgentLoopNow (chatEntry, config, abortRef, setIsStreaming) {
  const scopeId = getAgentRunningScopeId(chatEntry)
  const run = createAgentRun({
    requestModel: callBackendAIchatWithTools,
    requestVerification,
    requestRecoveryAction,
    executeTool: executeToolCall,
    requestApproval: waitForAgentConfirmation,
    onUpdate: updates => updateChatEntry(chatEntry, updates)
  })
  window.store.agentRunningScopes = startAgentScope(window.store.agentRunningScopes, scopeId)
  activeRuns.set(chatEntry.id, run)
  try {
    const task = { ...chatEntry, conversationContext: buildAgentConversation(chatEntry, window.store.aiChatHistory) }
    return await run.start(task, { ...config, languageAI: config.languageAI || window.store.getLangName() }, abortRef, setIsStreaming)
  } finally {
    activeRuns.delete(chatEntry.id)
    window.store.agentRunningScopes = finishAgentScope(window.store.agentRunningScopes, scopeId)
  }
}

export function runAgentLoop (chatEntry, config, abortRef, setIsStreaming) {
  const scopeId = getAgentRunningScopeId(chatEntry)
  const previous = agentQueues.get(scopeId) || Promise.resolve()
  // 2026-08-31 coder(lq): Queue only tasks targeting the same terminal; independent terminals keep running concurrently.
  updateChatEntry(chatEntry, { queued: true })
  const queuedRun = previous
    .catch(() => {})
    .then(() => {
      if (!isAgentEntryActive(chatEntry) || abortRef?.current) {
        // 2026-09-01 coder(lq): A queued task can be cancelled before it starts; clear its visible queue state instead of leaving a permanent "排队中" badge.
        updateChatEntry(chatEntry, { queued: false })
        return
      }
      return runAgentLoopNow(chatEntry, config, abortRef, setIsStreaming)
    })
    .catch(error => {
      updateChatEntry(chatEntry, {
        queued: false,
        response: `AI 任务执行失败：${error.message || error}`
      })
      setIsStreaming(false)
    })
    .finally(() => {
      if (agentQueues.get(scopeId) === queuedRun) {
        agentQueues.delete(scopeId)
      }
    })
  agentQueues.set(scopeId, queuedRun)
  return queuedRun
}

export function startAgentTask (chatEntry) {
  if (!chatEntry?.id) {
    return Promise.resolve()
  }
  const existing = managedAgentTasks.get(chatEntry.id)
  if (existing) {
    return existing.promise
  }

  const abortRef = { current: false }
  const task = { promise: null }
  managedAgentTasks.set(chatEntry.id, task)
  const stop = () => {
    abortRef.current = true
    stopAgentRun(chatEntry.id)
    updateChatEntry(chatEntry, {
      pending: false,
      queued: false,
      isStreaming: false,
      response: '任务已手动停止。已请求取消本次执行；已经产生的修改不会自动撤销。'
    })
  }
  const unregisterStop = registerAgentTask(chatEntry.id, stop)
  updateChatEntry(chatEntry, { pending: false })
  task.promise = runAgentLoop(
    chatEntry,
    getAgentTaskConfig(chatEntry),
    abortRef,
    value => updateChatEntry(chatEntry, {
      isStreaming: Boolean(value),
      ...(value ? { pending: false } : {})
    })
  ).finally(() => {
    unregisterStop()
    if (managedAgentTasks.get(chatEntry.id) === task) {
      managedAgentTasks.delete(chatEntry.id)
    }
  })
  return task.promise
}
