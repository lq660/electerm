import { useState, useEffect, useRef, useCallback } from 'react'
import AIOutput from './ai-output'
import { AiAttachmentList } from './ai-composer'
import AIStopIcon from './ai-stop-icon'
import AgentToolCallCard from './agent-tool-call-card'
import { registerAgentTask, startAgentTask, stopAgentTask } from './agent'
import {
  BookOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import createName from '../../common/create-title'
import uid from '../../common/uid'
import { safeGetItemJSON, safeSetItemJSON } from '../../common/safe-local-storage'
import message from '../common/message'
import {
  buildSolutionSummaryPrompt,
  extractSolutionCommandsFromToolCalls,
  getSessionRecentCommands,
  getSolutionConnectionKey,
  mergeSolutionRecord,
  normalizeSolutionRecord,
  parseSolutionSummary,
  solutionRecordsChangedEvent,
  solutionRecordStorageKey
} from '../../common/solution-record-utils.mjs'
import {
  canCreateSolutionRecord,
  getSolutionRecordLimit
} from '../../common/feature-plans'
import { HighlightedText } from './search-highlight'

const e = window.translate

export default function AIChatHistoryItem ({ item, readOnly = false, searchQuery = '' }) {
  const [showExecutionDetails, setShowExecutionDetails] = useState(() => Boolean(
    item.pending || item.streamingResponse || item.toolCalls?.some(tool => ['running', 'pending_confirm'].includes(tool.status))
  ))
  const [isStreaming, setIsStreaming] = useState(false)
  const [savingRecord, setSavingRecord] = useState(false)
  const processWasActiveRef = useRef(false)
  const {
    prompt,
    requestPrompt,
    sessionId,
    modelAI,
    roleAI,
    baseURLAI,
    apiPathAI,
    apiKeyAI,
    proxyAI,
    authHeaderNameAI,
    reasoningEffortAI,
    languageAI,
    mode,
    toolCalls
  } = item
  const taskIsStreaming = mode === 'agent' ? Boolean(item.isStreaming) : isStreaming

  useEffect(() => {
    const processActive = Boolean(item.pending || item.queued || taskIsStreaming || toolCalls?.some(tool => ['running', 'pending_confirm'].includes(tool.status)))
    if (processActive) {
      processWasActiveRef.current = true
      setShowExecutionDetails(true)
    } else if (processWasActiveRef.current && item.response) {
      // 2026-09-11 coder(lq): Keep live work visible, then collapse it once when the verified result arrives.
      processWasActiveRef.current = false
      setShowExecutionDetails(false)
    }
  }, [taskIsStreaming, item.pending, item.queued, item.response, toolCalls])

  function getCurrentSolutionTab () {
    const tabs = typeof window.store.getTabs === 'function' ? window.store.getTabs() : window.store.tabs || []
    return tabs.find(tab => tab.id === item.sessionRootId) || tabs.find(tab => tab.id === window.store.activeTabId) || {}
  }

  function getSolutionTargetInfo () {
    const tab = getCurrentSolutionTab()
    const host = tab.host
      ? `${tab.username ? tab.username + '@' : ''}${tab.host}${tab.port ? ':' + tab.port : ''}`
      : '本机'
    return {
      tab,
      serverName: createName(tab) || '当前服务器',
      host
    }
  }

  function getExecutedCommands () {
    const toolCommands = extractSolutionCommandsFromToolCalls(toolCalls)
    if (toolCommands.length) {
      return toolCommands
    }
    return getSessionRecentCommands(
      window.store.terminalCommandHistory,
      item.terminalSessionId || item.sessionRootId
    )
  }

  function handleDel (e) {
    e.stopPropagation()
    window.store.removeAiHistory(item.id)
  }

  function buildRole () {
    const lang = languageAI || window.store.getLangName()
    return roleAI + `;用[${lang}]回复`
  }

  const pollStreamContent = useCallback(async (sid) => {
    try {
      const streamResponse = await window.pre.runGlobalAsync('getStreamContent', sid)

      if (streamResponse && streamResponse.error) {
        if (streamResponse.error === 'Session not found') {
          return
        }
        window.store.removeAiHistory(item.id)
        return window.store.onError(new Error(streamResponse.error))
      }

      const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
      if (index !== -1) {
        window.store.aiChatHistory[index].response = streamResponse.content || ''
        window.store.aiChatHistory = [...window.store.aiChatHistory]
      }
      setIsStreaming(streamResponse.hasMore)
      if (streamResponse.hasMore) {
        setTimeout(() => pollStreamContent(sid), 200)
      }
    } catch (error) {
      window.store.removeAiHistory(item.id)
      window.store.onError(error)
    }
  }, [item.id])

  const startRequest = useCallback(async () => {
    try {
      const aiPrompt = requestPrompt || prompt
      const aiResponse = await window.pre.runGlobalAsync(
        'AIchat',
        aiPrompt,
        modelAI,
        buildRole(),
        baseURLAI,
        apiPathAI,
        apiKeyAI,
        proxyAI,
        true,
        authHeaderNameAI,
        reasoningEffortAI
      )

      if (aiResponse && aiResponse.error) {
        window.store.removeAiHistory(item.id)
        return window.store.onError(new Error(aiResponse.error))
      }

      if (aiResponse && aiResponse.isStream && aiResponse.sessionId) {
        setIsStreaming(true)
        const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
        if (index !== -1) {
          window.store.aiChatHistory[index].sessionId = aiResponse.sessionId
          window.store.aiChatHistory[index].response = aiResponse.content || ''
        }
        pollStreamContent(aiResponse.sessionId)
      } else if (aiResponse && aiResponse.response) {
        const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
        if (index !== -1) {
          window.store.aiChatHistory[index].response = aiResponse.response
        }
      }
    } catch (error) {
      window.store.removeAiHistory(item.id)
      window.store.onError(error)
    }
  }, [prompt, requestPrompt, modelAI, baseURLAI, apiPathAI, apiKeyAI, proxyAI, item.id, pollStreamContent])

  useEffect(() => {
    if (readOnly) {
      return
    }
    if (mode === 'agent') {
      if (item.pending) {
        // 2026-09-23 coder(lq): Recover pending work restored from storage; normal sends start directly from the submit path.
        startAgentTask(item)
      }
      return
    }
    const unregisterStop = registerAgentTask(item.id, stopTask)
    if (item.pending) {
      const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
      if (index !== -1) {
        window.store.aiChatHistory[index].pending = false
      }
      startRequest()
    }
    return unregisterStop
  }, [readOnly])

  async function stopTask () {
    if (mode === 'agent') {
      stopAgentTask(item.id)
      return
    }
    if (!sessionId) return

    try {
      await window.pre.runGlobalAsync('stopStream', sessionId)
      setIsStreaming(false)
    } catch (error) {
      console.error('Error stopping stream:', error)
    }
  }

  async function handleStop (e) {
    e.stopPropagation()
    await stopTask()
  }

  function renderStopButton () {
    const canStop = mode === 'agent'
      ? Boolean(item.pending || item.queued || taskIsStreaming)
      : taskIsStreaming
    if (!canStop) {
      return null
    }
    return (
      <AIStopIcon
        onClick={handleStop}
        title={e('stopAiRequest')}
      />
    )
  }

  function renderQueueStatus () {
    if (!item.queued) {
      return null
    }
    return <span className='ai-history-queued-status' role='status'>排队中 · 将按顺序执行</span>
  }

  async function handleSaveSolutionRecord () {
    const finalResponse = String(item.response || '').trim()
    if (!finalResponse) {
      message.warning('AI 还没有生成可保存的结果')
      return
    }
    const { tab, serverName, host } = getSolutionTargetInfo()
    const commands = getExecutedCommands()
    const conversation = [{
      prompt,
      response: finalResponse
    }]
    setSavingRecord(true)
    try {
      let summary = null
      if (!window.store.aiConfigMissing()) {
        try {
          const response = await window.pre.runGlobalAsync(
            'AIchat',
            buildSolutionSummaryPrompt({
              serverName,
              host,
              commands,
              conversation
            }),
            modelAI,
            '你只根据提供的事实整理处理记录，返回严格 JSON。',
            baseURLAI,
            apiPathAI,
            apiKeyAI,
            proxyAI,
            false,
            authHeaderNameAI,
            reasoningEffortAI
          )
          if (!response?.error) {
            summary = parseSolutionSummary(response?.response)
          }
        } catch {
          // 2026-07-24 coder(lq): Saving should still work when the second-pass AI structuring call is unavailable.
          summary = null
        }
      }
      const now = Date.now()
      const record = normalizeSolutionRecord({
        id: uid(),
        connectionKey: getSolutionConnectionKey(tab),
        serverName,
        host,
        title: summary?.title || prompt.slice(0, 28),
        problem: summary?.problem || prompt,
        summary: summary?.summary || finalResponse,
        commands: summary?.commands?.length ? summary.commands : commands,
        tags: summary?.tags || [],
        createdAt: now,
        updatedAt: now
      })
      const records = safeGetItemJSON(solutionRecordStorageKey, [])
      if (!canCreateSolutionRecord(window.store.config, records)) {
        message.warning(`个人版最多保存 ${getSolutionRecordLimit(window.store.config)} 条处理记录，请升级后继续保存。`)
        window.store.openSubscriptionSetting()
        return
      }
      safeSetItemJSON(solutionRecordStorageKey, mergeSolutionRecord(records, record))
      window.dispatchEvent(new window.CustomEvent(solutionRecordsChangedEvent))
      message.success('已保存到处理记录')
    } catch (error) {
      message.error(`保存处理记录失败：${error.message}`)
    } finally {
      setSavingRecord(false)
    }
  }

  function renderExecutionProcess () {
    const progressText = (item.agentProgress || [])
      .map(progress => String(progress.content || '').trim())
      .filter(Boolean)
      .join('\n\n') || String(item.streamingResponse || '').trim()
    const hasTools = Boolean(toolCalls?.length)
    if (mode !== 'agent' || (!progressText && !hasTools && !taskIsStreaming && !item.pending)) {
      return null
    }
    const detailCount = (item.agentProgress || []).filter(progress => String(progress.content || '').trim()).length + (toolCalls?.length || 0)
    return (
      <div className='ai-execution-details'>
        <button
          type='button'
          className='ai-execution-details-toggle'
          onClick={() => setShowExecutionDetails(!showExecutionDetails)}
          aria-expanded={showExecutionDetails}
        >
          {showExecutionDetails ? <CaretDownOutlined /> : <CaretRightOutlined />}
          <span>{taskIsStreaming || item.pending ? '执行中' : '执行过程'}</span>
          {detailCount > 0 && <em>{detailCount} 项</em>}
        </button>
        {showExecutionDetails && (
          <div className='ai-execution-details-body'>
            {progressText && <AIOutput content={progressText} variant='progress' searchQuery={searchQuery} />}
            {hasTools && (
              <div className='agent-tool-calls'>
                {toolCalls.map((tc) => (
                  <AgentToolCallCard key={tc.id} toolCall={tc} searchQuery={searchQuery} />
                ))}
              </div>
            )}
            {!progressText && !hasTools && <div className='ai-execution-waiting' role='status'>正在分析任务…</div>}
          </div>
        )}
      </div>
    )
  }

  function renderSolutionRecordAction () {
    if (taskIsStreaming || !String(item.response || '').trim()) {
      return null
    }
    return (
      <div className='ai-solution-record-actions'>
        <button
          disabled={savingRecord}
          onClick={handleSaveSolutionRecord}
          title='AI 会整理当前问题、回复结果和实际执行命令，再保存到处理记录'
        >
          <BookOutlined />
          <span>{savingRecord ? '保存中' : '保存结果'}</span>
        </button>
      </div>
    )
  }

  return (
    <div className='chat-history-item ai-chat-turn'>
      <section className='ai-chat-user-message' aria-label='你的消息'>
        <div className='ai-chat-message-meta'>
          <span>你</span>
          <button
            type='button'
            className='pointer ai-history-meta-action'
            onClick={handleDel}
            aria-label='删除这一轮对话'
            title='删除这一轮对话'
          >
            <DeleteOutlined />
          </button>
        </div>
        <div className='ai-chat-user-bubble'>
          <div className='ai-chat-user-text'><HighlightedText text={prompt} query={searchQuery} /></div>
          <AiAttachmentList attachments={item.attachments} />
        </div>
        {renderQueueStatus()}
      </section>
      <section className='ai-chat-assistant-message' aria-label='AI 回复'>
        <div className='ai-chat-message-meta'>
          <span>AI Shell</span>
          {renderStopButton()}
        </div>
        {renderExecutionProcess()}
        <AIOutput content={item.response || (mode !== 'agent' ? item.streamingResponse : '')} variant='final' searchQuery={searchQuery} />
        {!item.response && !item.streamingResponse && !(item.agentProgress || []).some(progress => progress.content) && (
          <div className='ai-chat-message-placeholder' role='status'>
            {item.queued ? '等待前面的任务完成' : item.pending || taskIsStreaming ? '正在处理…' : '暂无回复'}
          </div>
        )}
        {renderSolutionRecordAction()}
      </section>
    </div>
  )
}
