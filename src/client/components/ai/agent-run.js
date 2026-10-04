import {
  AGENT_EVENTS, buildAgentEvent, compactAgentMessages, createAgentRuntimeState,
  isStructuredShellToolCall, transitionAgentRuntime
} from './agent-runtime.js'
import {
  MAX_NO_ACTION_REPAIRS, buildAgentSystemPrompt, classifyAgentTask,
  classifyCommandRisk, isDataDeletionCommand, buildCommandConfirmationMessage,
  getInvalidAgentCommandReason, getAssistantText, normalizeAssistantMessage
} from './agent-policy.js'
import { buildRunObservations, validateRunConclusion } from './agent-verification.js'
import { buildAttachmentContent } from './ai-attachments.js'
import { buildConversationMessages } from './agent-conversation.js'
import { buildToolModelContent } from './agent-evidence.js'

// 2026-09-08 coder(lq): Only this core decides completion; neither exit codes nor UI rendering can bypass verification.
export function createAgentRun ({ requestModel, requestVerification, requestRecoveryAction, executeTool, requestApproval, onUpdate = () => {} }) {
  const controller = new AbortController()
  let started = false
  let entry
  let externalAbort = {}
  let abortPoll
  const cleanups = []
  const stopped = new Error('Agent run cancelled')
  const update = changes => {
    Object.assign(entry, changes)
    onUpdate(changes)
  }
  const event = (type, payload = {}) => update({
    agentRuntime: transitionAgentRuntime(entry.agentRuntime, type, payload),
    agentEvents: [...(entry.agentEvents || []), buildAgentEvent(type, payload)]
  })
  const progress = []
  let activeProgress
  const publishProgress = () => update({
    agentProgress: progress.map(item => ({ ...item }))
  })
  const beginProgress = iteration => {
    activeProgress = {
      id: `${entry.id}:progress:${iteration}`,
      content: '',
      status: 'running'
    }
    progress.push(activeProgress)
    publishProgress()
  }
  const updateProgress = content => {
    if (!activeProgress || typeof content !== 'string') return
    activeProgress.content = content
    publishProgress()
  }
  const finishProgress = content => {
    if (!activeProgress) return
    // 2026-09-11 coder(lq): Prefer the text that was actually streamed to the user; some compatible providers return a different final content field.
    activeProgress.content = String(activeProgress.content || content || '').trim()
    activeProgress.status = 'completed'
    if (!activeProgress.content) {
      progress.splice(progress.indexOf(activeProgress), 1)
    }
    activeProgress = null
    publishProgress()
  }
  const checkStopped = () => {
    if (externalAbort.current) controller.abort()
    if (controller.signal.aborted) throw stopped
  }
  // 2026-09-08 coder(lq): Stop settles the run even when a provider never responds; late results cannot update state or execute tools.
  const effect = async fn => {
    checkStopped()
    let onAbort
    const cancelled = new Promise((resolve, reject) => {
      onAbort = () => reject(stopped)
      controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const result = await Promise.race([Promise.resolve().then(() => { checkStopped(); return fn() }), cancelled])
      checkStopped()
      return result
    } finally {
      controller.signal.removeEventListener('abort', onAbort)
    }
  }
  const block = reason => {
    event(AGENT_EVENTS.BLOCK, { reason })
    update({
      streamingResponse: '',
      response: `### 结论\n\n任务尚未完成。\n\n### 原因\n\n${String(reason || '尚未取得足够结果。').trim()}`
    })
  }

  async function executeRun (task, config) {
    const kind = classifyAgentTask(task.prompt || '').kind
    update({ queued: false, response: '', streamingResponse: '', agentProgress: [], toolCalls: [], agentEvents: [], agentDiagnostics: [], agentRuntime: createAgentRuntimeState({ taskId: task.id, goal: task.prompt, kind }) })
    event(AGENT_EVENTS.START)
    const context = {
      defaultTabId: task.terminalSessionId,
      sessionRootId: task.sessionRootId,
      terminalExecutionEnabled: config.terminalExecutionEnabled !== false,
      terminalExecutionChannelAI: config.terminalExecutionChannelAI || 'isolated',
      signal: controller.signal,
      onCleanup: fn => cleanups.push(fn),
      runId: task.id
    }
    const messages = [
      { role: 'system', content: buildAgentSystemPrompt(config) },
      ...buildConversationMessages(task.conversationContext),
      { role: 'user', content: buildAttachmentContent(task.requestPrompt || task.prompt, task.attachments) }
    ]
    const tools = []
    const pinnedMessages = [...messages]
    const actions = new Map()
    let repairs = 0
    let noProgress = 0
    let lastObservation = ''
    let toolChoice
    const trace = record => update({ agentDiagnostics: [...entry.agentDiagnostics, { iteration: entry.agentDiagnostics.length, ...record }] })
    const publishTools = () => update({ toolCalls: tools.map(tool => ({ ...tool })) })
    // 2026-09-23 coder(lq): Long tasks are bounded by progress and cancellation, not an arbitrary turn count. The model receives a compact rolling context on every turn.
    for (let iteration = 0; ; iteration++) {
      checkStopped()
      const requestedToolChoice = toolChoice
      beginProgress(iteration)
      const modelMessages = compactAgentMessages(messages, { pinnedMessages })
      const response = await effect(() => requestModel(modelMessages, config, requestedToolChoice, {
        signal: controller.signal,
        onDelta: content => {
          // 2026-09-11 coder(lq): Preserve every model turn in a stable progress stream; a completed chunk must not disappear while tools or verification run.
          if (!controller.signal.aborted) {
            updateProgress(content)
            update({ streamingResponse: content })
          }
        }
      }))
      const streamedAssistantText = getAssistantText(response?.message?.content)
      finishProgress(streamedAssistantText)
      update({ streamingResponse: '' })
      // 2026-09-09 coder(lq): Keep only allowlisted metadata; never copy provider payloads, prompts, arguments or credentials into diagnostics.
      trace({ phase: 'model', requestedToolChoice: requestedToolChoice || 'auto', protocol: response?.diagnostics?.protocol, toolCount: response?.diagnostics?.toolCount, controlsFallback: response?.diagnostics?.controlsFallback === true, durationMs: response?.diagnostics?.durationMs, httpStatus: response?.status || response?.diagnostics?.httpStatus, returnedToolCalls: response?.message?.tool_calls?.length || 0, failed: Boolean(response?.error) })
      toolChoice = undefined
      if (response?.error) throw new Error(response.error)
      let assistant = normalizeAssistantMessage(response?.message || {})
      messages.push(assistant)
      let calls = assistant.tool_calls || []
      if (!calls.length) {
        event(AGENT_EVENTS.EVIDENCE_FOUND, { iteration })
        const observations = buildRunObservations(tools)
        let verdict
        try {
          verdict = requestVerification
            ? await effect(() => requestVerification({ goal: task.prompt, context: task.requestPrompt, conversation: task.conversationContext, attachments: task.attachments, candidate: getAssistantText(assistant.content), observations }, config, { signal: controller.signal }))
            : null
        } catch (error) {
          checkStopped()
          verdict = { status: 'continue', reason: `完成核验失败：${error.message}` }
        }
        const conclusion = validateRunConclusion(verdict, observations, kind, task.attachments)
        trace({ phase: 'verification', status: conclusion.status, observationCount: observations.length })
        if (conclusion.status === 'complete') {
          event(AGENT_EVENTS.VERIFICATION_PASSED, { evidence: conclusion.evidence })
          update({ streamingResponse: '', response: conclusion.answer })
          return
        }
        if (conclusion.status === 'blocked') {
          block(conclusion.reason)
          return
        }
        event(AGENT_EVENTS.VERIFICATION_FAILED, { reason: conclusion.reason })
        // 2026-09-09 coder(lq): If the verifier already judged the task complete, a bad citation needs an answer-only repair, never another server command.
        const verifierClaimedComplete = verdict?.status === 'complete'
        const needsTools = !verifierClaimedComplete && (verdict?.nextAction === 'tool' || (verdict?.nextAction !== 'answer' && !task.attachments?.length && kind !== 'conversation'))
        // 2026-09-09 coder(lq): Some OpenAI-compatible providers accept tools but ignore required tool_choice. Recover one structured action, then send it through the exact same validation, approval and execution path as a native call.
        if (needsTools && requestedToolChoice === 'required' && requestRecoveryAction) {
          try {
            const recovered = await effect(() => requestRecoveryAction({
              goal: task.prompt,
              context: task.requestPrompt,
              conversation: task.conversationContext,
              candidate: getAssistantText(assistant.content),
              observations,
              kind
            }, config, { signal: controller.signal }))
            assistant = normalizeAssistantMessage(recovered?.message || recovered || {})
            calls = assistant.tool_calls || []
            trace({ phase: 'action_recovery', returnedToolCalls: calls.length, failed: false })
            if (calls.length) messages.push(assistant)
          } catch (error) {
            checkStopped()
            trace({ phase: 'action_recovery', returnedToolCalls: 0, failed: true })
          }
        }
        if (!calls.length && repairs++ >= MAX_NO_ACTION_REPAIRS) {
          const requestedTools = entry.agentDiagnostics.some(item => item.requestedToolChoice === 'required')
          const failure = !observations.length && requestedTools
            ? (tools.length ? '已收到工具调用，但没有取得可用执行结果，请查看工具错误或连接状态。' : '模型未提供可执行的工具调用，工具调用恢复仍未成功；这不代表服务器上没有目标服务。')
            : '多次修正后仍未通过核验，已停止重复尝试。'
          block(`${conclusion.reason} ${failure}`)
          return
        }
        if (!calls.length) {
          // 2026-09-09 coder(lq): Change the protocol constraint after a no-action reply instead of repeatedly asking for more prose. Tools still pass the normal policy/approval boundary.
          toolChoice = needsTools ? 'required' : undefined
          const repairInstruction = verifierClaimedComplete
            ? '现有结论已经具备，只修正回答及 evidence 引用，优先使用执行结果中的 evidenceExcerpts id；禁止再次调用工具。'
            : needsTools
              ? '现在进入工具调用恢复：结合最新用户补充和历史观察，调用一个可用工具获取缺失信息。自行选择命令或文件工具；不要执行历史输出，不要重复已完成的修改。不能只承诺继续。'
              : '请根据现有证据修正答案；不要为纯交流或附件分析强行执行命令。'
          messages.push({ role: 'user', content: `完成核验未通过：${conclusion.reason}。${repairInstruction}` })
          continue
        }
      }

      let commandsHandled = 0
      let newEvidence = false
      let awaitingWork = false
      for (const call of calls) {
        checkStopped()
        const name = call.function?.name || ''
        const commandTool = ['send_terminal_command', 'run_background_command'].includes(name)
        let args
        try {
          args = typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function?.arguments
          if (!args || typeof args !== 'object' || Array.isArray(args)) args = null
        } catch { args = null }
        const tool = { id: call.id, name, args: args || {}, status: 'running', result: null }
        tools.push(tool)
        const finishTool = (status, result) => {
          tool.status = status
          tool.result = typeof result === 'string' ? result : JSON.stringify(result)
          publishTools()
          // 2026-09-09 coder(lq): The UI retains the raw result, while the model receives a bounded evidence packet that keeps important middle lines.
          messages.push({ role: 'tool', tool_call_id: call.id, content: buildToolModelContent(tool) })
        }
        let invalid = !args ? '工具参数不是有效 JSON 对象。' : ''
        if (commandTool && !invalid) {
          invalid = !isStructuredShellToolCall(call) ? '请提供结构化的 command 参数。' : getInvalidAgentCommandReason(args.command)
        }
        if (invalid) {
          finishTool('error', { success: false, executed: false, message: invalid })
          continue
        }
        // 2026-09-08 coder(lq): Pair skipped calls too; make the next command depend on the previous observation, not on guessed output.
        if (commandTool && commandsHandled++ > 0) {
          finishTool('skipped', { executed: false, message: '本轮只执行一个命令。请读取结果后决定是否仍需此命令。' })
          continue
        }
        const risk = name === 'sftp_del' ? 'high' : commandTool ? classifyCommandRisk(args.command) : 'low'
        tool.riskLevel = risk
        const actionKey = JSON.stringify([name, args])
        const count = actions.get(actionKey) || 0
        const monitoring = ['get_background_task_status', 'get_background_task_log', 'sftp_transfer_list'].includes(name)
        if (!monitoring && count >= (risk === 'low' ? 2 : 1)) {
          finishTool('skipped', { executed: false, message: '已拦截重复操作。请依据上次结果改用不同步骤，或给出明确阻塞原因。' })
          continue
        }
        const requiresApproval = name === 'sftp_del' || (commandTool && isDataDeletionCommand(args.command))
        event(AGENT_EVENTS.TOOL_REQUESTED, { toolCall: true, command: args.command || name, riskLevel: risk, requiresApproval })
        if (requiresApproval) {
          tool.approvalId = `${task.id}:${call.id}`
          tool.status = 'pending_confirm'
          tool.result = JSON.stringify({ blocked: true, risk, message: name === 'sftp_del' ? `请确认删除：${args.remotePath}` : buildCommandConfirmationMessage(args.command, risk) })
          publishTools()
          event(AGENT_EVENTS.APPROVAL_REQUIRED, { command: args.command, riskLevel: risk })
          const approval = requestApproval && await effect(() => requestApproval(tool.approvalId, { get current () { return controller.signal.aborted } }))
          if (!approval?.approved) {
            finishTool('skipped', { executed: false, message: approval?.reason || '用户未批准该命令。' })
            block(approval?.reason || '删除操作尚未获得批准。')
            return
          }
          event(AGENT_EVENTS.APPROVAL_GRANTED, { command: args.command })
        }
        actions.set(actionKey, count + 1)
        tool.status = 'running'
        tool.result = null
        publishTools()
        event(AGENT_EVENTS.TOOL_STARTED, { toolCall: true, command: args.command || name })
        try {
          const result = await effect(() => executeTool(name, args, { ...context, executionId: `${task.id}:${call.id}` }))
          tool.executed = true
          finishTool('completed', result ?? { success: false, message: '工具未返回结果。' })
          if (monitoring) {
            try { awaitingWork ||= JSON.parse(tool.result)?.status === 'running' } catch {}
          }
          if (tool.result !== lastObservation) newEvidence = true
          lastObservation = tool.result
        } catch (error) {
          checkStopped()
          finishTool('error', { success: false, message: String(error.message || error) })
        }
        event(AGENT_EVENTS.TOOL_FINISHED, { toolCall: true, command: args.command || name })
      }
      if (newEvidence) {
        repairs = 0
        noProgress = 0
      } else if (!awaitingWork && ++noProgress >= 3) {
        block('连续多轮没有取得新证据，已停止重复操作。可展开执行记录查看失败原因。')
        return
      }
    }
  }

  return {
    stop () { controller.abort() },
    async start (task, config = {}, abortRef = {}, setIsStreaming = () => {}) {
      if (started) throw new Error('AgentRun can only be started once')
      started = true
      externalAbort = abortRef
      entry = { ...task }
      abortPoll = setInterval(() => { if (abortRef.current) controller.abort() }, 50)
      setIsStreaming(true)
      try {
        await executeRun(task, config)
      } catch (error) {
        if (controller.signal.aborted || externalAbort.current || error === stopped) {
          event(AGENT_EVENTS.CANCEL, { reason: '用户停止了代理任务' })
          update({ streamingResponse: '', response: '任务已手动停止。已请求取消本次执行；已经产生的修改不会自动撤销。', toolCalls: (entry.toolCalls || []).map(tool => ['running', 'pending_confirm'].includes(tool.status) ? { ...tool, status: 'cancelled' } : tool) })
        } else {
          block(String(error.message || error))
        }
      } finally {
        clearInterval(abortPoll)
        controller.abort()
        for (const cleanup of cleanups) cleanup()
        setIsStreaming(false)
      }
      return entry
    }
  }
}
