import { useState, useEffect, useRef, useCallback } from 'react'
import AIOutput from './ai-output'
import AIStopIcon from './ai-stop-icon'
import AgentToolCallCard from './agent-tool-call-card'
import { runAgentLoop } from './agent'
import {
  Alert,
  Tooltip
} from 'antd'
import {
  CopyOutlined,
  CloseOutlined,
  BookOutlined,
  CaretDownOutlined,
  CaretRightOutlined
} from '@ant-design/icons'
import { copy } from '../../common/clipboard'
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

const e = window.translate

export default function AIChatHistoryItem ({ item }) {
  const [showOutput, setShowOutput] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [savingRecord, setSavingRecord] = useState(false)
  const abortRef = useRef(false)
  const {
    prompt,
    requestPrompt,
    sessionId,
    nameAI,
    modelAI,
    roleAI,
    baseURLAI,
    apiPathAI,
    apiKeyAI,
    proxyAI,
    authHeaderNameAI,
    languageAI,
    mode,
    toolCalls
  } = item

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

  function toggleOutput () {
    setShowOutput(!showOutput)
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
        true
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

  const startAgentRequest = useCallback(async () => {
    abortRef.current = false
    const config = {
      modelAI,
      roleAI,
      baseURLAI,
      apiPathAI,
      apiKeyAI,
      proxyAI,
      authHeaderNameAI,
      languageAI
    }
    await runAgentLoop(item, config, abortRef, setIsStreaming)
  }, [modelAI, roleAI, baseURLAI, apiPathAI, apiKeyAI, proxyAI, authHeaderNameAI, languageAI, item.id])

  useEffect(() => {
    if (item.pending) {
      const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
      if (index !== -1) {
        window.store.aiChatHistory[index].pending = false
      }
      if (mode === 'agent') {
        startAgentRequest()
      } else {
        startRequest()
      }
    }
  }, [])

  async function handleStop (e) {
    e.stopPropagation()
    if (mode === 'agent') {
      abortRef.current = true
      setIsStreaming(false)
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

  function renderStopButton () {
    if (!isStreaming) {
      return null
    }
    return (
      <AIStopIcon
        onClick={handleStop}
        title={e('stopAiRequest')}
      />
    )
  }

  const alertProps = {
    title: (
      <div className='ai-history-item-title'>
        <span className='pointer mg1r' onClick={toggleOutput}>
          {showOutput ? <CaretDownOutlined /> : <CaretRightOutlined />}
        </span>
        <span>{prompt}</span>
      </div>
    ),
    type: 'info'
  }

  function handleDel (e) {
    e.stopPropagation()
    window.store.removeAiHistory(item.id)
  }

  function handleCopy () {
    copy(prompt)
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
            authHeaderNameAI
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

  function renderTitle () {
    return (
      <div>
        {nameAI && (
          <p>
            <b>{e('name')}:</b> {nameAI}
          </p>
        )}
        <p>
          <b>{e('model')}:</b> {modelAI}
        </p>
        <p>
          <b>{e('role')}:</b> {roleAI}
        </p>
        <p>
          <b>{e('baseURL')}:</b> {baseURLAI}
        </p>
        <p>
          <b>{e('time')}:</b> {new Date(item.timestamp).toLocaleString()}
        </p>
        <p>
          <CopyOutlined
            className='pointer'
            onClick={handleCopy}
          />
          <CloseOutlined
            className='pointer mg1l'
            onClick={handleDel}
          />
        </p>
      </div>
    )
  }

  function renderToolCalls () {
    if (mode !== 'agent' || !toolCalls || !toolCalls.length) {
      return null
    }
    return (
      <div className='agent-tool-calls'>
        {toolCalls.map((tc) => (
          <AgentToolCallCard key={tc.id} toolCall={tc} />
        ))}
      </div>
    )
  }

  function renderSolutionRecordAction () {
    if (isStreaming || !String(item.response || '').trim()) {
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
          <span>{savingRecord ? '整理保存中' : 'AI 整理并保存'}</span>
        </button>
      </div>
    )
  }

  return (
    <div className='chat-history-item'>
      <div className='mg1y'>
        <Tooltip title={renderTitle()}>
          <Alert {...alertProps} />
        </Tooltip>
      </div>
      {showOutput && (
        <div className='ai-history-item-body'>
          {renderToolCalls()}
          <AIOutput item={item} />
          {renderSolutionRecordAction()}
        </div>
      )}
      {renderStopButton()}
    </div>
  )
}
