import { useState, useCallback, useEffect } from 'react'
import { Flex, Input, Popconfirm, Segmented, Tooltip } from 'antd'
import TabSelect from '../footer/tab-select'
import AiChatHistory from './ai-chat-history'
import uid from '../../common/uid'
import { pick } from 'lodash-es'
import {
  BulbOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  SendOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'
import {
  aiConfigWikiLink,
  aiChatModeLsKey,
  aiChatContinuousLsKey
} from '../../common/constants'
import { getItem, setItem } from '../../common/safe-local-storage.js'
import {
  filterAiChatHistoryByTerminal,
  getAiChatScope,
  getAiHistoryTerminalId
} from '../../common/ai-chat-scope'
import {
  featureIds,
  getFeatureLockedMessage,
  hasFeature
} from '../../common/feature-plans'
import HelpIcon from '../common/help-icon'
import { refs, refsStatic } from '../common/ref'
import message from '../common/message'
import './ai.styl'

const { TextArea } = Input
const MAX_HISTORY = 100
const TERMINAL_CONTEXT_LINES = 160
const MAX_TERMINAL_CONTEXT_CHARS = 16000
const CONTINUOUS_CONTEXT_LIMIT = 4
const MAX_CONTINUOUS_CONTEXT_CHARS = 8000

export default function AIChat (props) {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState(() => getItem(aiChatModeLsKey) || 'ask')
  const [continuousChat, setContinuousChat] = useState(() => getItem(aiChatContinuousLsKey) !== '0')
  const isAgent = mode === 'agent'
  const submitDisabled = isAgent && props.agentRunning
  const aiScope = getAiChatScope(props)
  const currentHistory = filterAiChatHistoryByTerminal(
    props.aiChatHistory,
    aiScope.terminalSessionId
  )

  function handlePromptChange (e) {
    setPrompt(e.target.value)
  }

  function handleModeChange (val) {
    if (val === 'agent' && !hasFeature(props.config, featureIds.aiAgent)) {
      message.warning(getFeatureLockedMessage(featureIds.aiAgent))
      window.store.openSubscriptionSetting()
      return
    }
    setItem(aiChatModeLsKey, val)
    setMode(val)
  }

  function handleContinuousChatToggle () {
    const next = !continuousChat
    setItem(aiChatContinuousLsKey, next ? '1' : '0')
    setContinuousChat(next)
  }

  function getCurrentTerminalOutput (lineCount = TERMINAL_CONTEXT_LINES) {
    const termRef = refs.get('term-' + aiScope.terminalSessionId)
    if (typeof termRef?.getTerminalBufferText === 'function') {
      return trimTerminalContext(termRef.getTerminalBufferText(), lineCount)
    }
    const buffer = termRef?.term?.buffer?.active
    if (!buffer) {
      return ''
    }
    const cursorY = buffer.cursorY || 0
    const baseY = buffer.baseY || 0
    const totalLines = buffer.length || 0
    const endLine = Math.min(totalLines, baseY + cursorY + 1)
    const startLine = Math.max(0, endLine - lineCount)
    const lines = []
    for (let i = startLine; i < endLine; i++) {
      const line = buffer.getLine(i)
      lines.push(line ? line.translateToString(true) : '')
    }
    return trimTerminalContext(lines.join('\n'), lineCount)
  }

  function trimTerminalContext (text = '', lineCount = TERMINAL_CONTEXT_LINES) {
    const lines = String(text).split('\n')
    const recentLines = lines.slice(Math.max(0, lines.length - lineCount)).join('\n').trim()
    if (recentLines.length <= MAX_TERMINAL_CONTEXT_CHARS) {
      return recentLines
    }
    return recentLines.slice(recentLines.length - MAX_TERMINAL_CONTEXT_CHARS).trim()
  }

  function buildPromptWithTerminalContext (userPrompt) {
    const terminalOutput = getCurrentTerminalOutput()
    const conversationContext = continuousChat ? buildContinuousConversationContext() : ''
    if (!terminalOutput && !conversationContext) return userPrompt
    // 2026-07-20 coder(lq): Normal AI questions should carry the active terminal context so users do not need to copy logs manually.
    return `用户问题：
${userPrompt}

${conversationContext ? `同一终端最近对话（用于连续理解当前问题）：\n${conversationContext}\n\n` : ''}
${terminalOutput
? `当前终端最近输出（最近 ${TERMINAL_CONTEXT_LINES} 行，仅作为本次分析上下文）：\n\`\`\`terminal\n${terminalOutput}\n\`\`\`\n\n`
: ''}
请结合上述上下文回答。不要要求用户再次粘贴这些终端内容；如果现有输出不足，再明确说明还需要哪类信息。`
  }

  function trimContinuousContext (text = '') {
    const clean = String(text || '').trim()
    if (clean.length <= MAX_CONTINUOUS_CONTEXT_CHARS) return clean
    return clean.slice(clean.length - MAX_CONTINUOUS_CONTEXT_CHARS).trim()
  }

  function buildContinuousConversationContext () {
    const finishedHistory = currentHistory
      .filter(item => item.prompt && item.response && !item.pending)
      .slice(-CONTINUOUS_CONTEXT_LIMIT)
    if (!finishedHistory.length) return ''
    return trimContinuousContext(finishedHistory.map((item, index) => {
      return `对话 ${index + 1}
用户：${item.prompt}
AI：${item.response}`
    }).join('\n\n'))
  }

  function renderContinuousChatToggle () {
    return (
      <Tooltip
        placement='top'
        title={continuousChat
          ? '已开启：同一终端下的新问题会带上最近几轮 AI 问答'
          : '已关闭：新问题只读取当前终端输出，不带前面 AI 问答'}
      >
        <button
          type='button'
          className={continuousChat ? 'cn-ai-continuous-toggle active' : 'cn-ai-continuous-toggle'}
          onClick={handleContinuousChatToggle}
        >
          连续对话
        </button>
      </Tooltip>
    )
  }

  const handleSubmit = useCallback(function (promptOverride, options = {}) {
    if (!hasFeature(props.config, featureIds.aiChat)) {
      message.warning(getFeatureLockedMessage(featureIds.aiChat))
      window.store.openSubscriptionSetting()
      return
    }
    if (window.store.aiConfigMissing()) {
      window.store.toggleAIConfig()
      return
    }
    const nextPrompt = typeof promptOverride === 'string' ? promptOverride : prompt
    if (!nextPrompt.trim()) return
    const includeTerminalContext = options.includeTerminalContext !== false
    const requestPrompt = includeTerminalContext
      ? buildPromptWithTerminalContext(nextPrompt)
      : nextPrompt

    const chatId = uid()
    const chatEntry = {
      prompt: nextPrompt,
      requestPrompt,
      response: '',
      isStreaming: false,
      pending: true,
      sessionId: null,
      mode,
      toolCalls: [],
      // 2026-07-20 coder(lq): AI answers are isolated by terminal tab while still keeping the owning SSH/local session for summaries.
      sessionRootId: aiScope.sessionRootId,
      terminalSessionId: aiScope.terminalSessionId,
      ...pick(props.config, [
        'nameAI',
        'modelAI',
        'roleAI',
        'baseURLAI',
        'apiPathAI',
        'apiKeyAI',
        'proxyAI',
        'authHeaderNameAI',
        'languageAI'
      ]),
      timestamp: Date.now(),
      id: chatId
    }

    window.store.aiChatHistory.push(chatEntry)
    setPrompt('')

    if (window.store.aiChatHistory.length > MAX_HISTORY) {
      window.store.aiChatHistory.splice(MAX_HISTORY)
    }
  }, [prompt, mode, continuousChat, currentHistory, aiScope.sessionRootId, aiScope.terminalSessionId, props.config])

  function renderHistory () {
    if (!currentHistory.length) {
      const hasTerminalOutput = !!getCurrentTerminalOutput()
      return (
        <div className='cn-ai-empty-state'>
          <span>{hasTerminalOutput ? '当前终端上下文已就绪' : '当前终端暂无可读取输出'}</span>
        </div>
      )
    }
    return (
      <AiChatHistory
        history={currentHistory}
      />
    )
  }

  function toggleConfig () {
    window.store.toggleAIConfig()
  }

  function renderConfigNotice () {
    if (props.embedded) {
      return null
    }
    const configMissing = window.store.aiConfigMissing()
    if (!configMissing) {
      return null
    }
    return (
      <div className='cn-ai-config-notice'>
        <div>
          <strong>需要先配置模型</strong>
          <span>配置 API 地址、模型和密钥后，AI 助手才能解释终端输出或生成命令。</span>
        </div>
        <button onClick={toggleConfig}>去配置</button>
      </div>
    )
  }

  function clearHistory () {
    window.store.aiChatHistory = window.store.aiChatHistory.filter(item => {
      return getAiHistoryTerminalId(item) !== aiScope.terminalSessionId
    })
  }

  function renderTabSelect () {
    if (isAgent) {
      return null
    }
    return (
      <TabSelect
        selectedTabIds={props.selectedTabIds}
        tabs={props.tabs}
        activeTabId={props.activeTabId}
      />
    )
  }

  function renderSendIcon () {
    if (submitDisabled) {
      return (
        <SendOutlined
          className='mg1l send-to-ai-icon disabled'
          title='Agent 正在执行，请稍候'
        />
      )
    }
    return (
      <SendOutlined
        onClick={handleSubmit}
        className='mg1l pointer icon-hover send-to-ai-icon'
        title='发送给 AI，Enter 发送，Shift+Enter 换行'
      />
    )
  }

  function getModeInfo () {
    if (isAgent) {
      return {
        label: '可自动执行',
        title: '代理实验',
        desc: 'AI 会读取当前终端上下文，尝试拆解任务，并把明确的命令自动发送到当前终端执行。适合需要连续处理的问题，执行前请确认当前连接和权限。',
        placeholder: '描述要处理的任务，AI 会尝试自动执行明确命令'
      }
    }
    return {
      label: '只分析',
      title: '问答',
      desc: 'AI 会读取当前终端上下文，解释报错、分析日志或生成命令建议，但不会自动执行命令。需要执行时，你可以手动发送到终端。',
      placeholder: '直接提问，AI 会结合当前终端输出分析'
    }
  }

  function renderModeLabel (targetMode, label) {
    const isTargetAgent = targetMode === 'agent'
    const modeInfo = isTargetAgent
      ? {
          title: '代理实验',
          desc: 'AI 会读取当前终端上下文，尝试拆解任务，并把明确的命令自动发送到当前终端执行。适合需要连续处理的问题，执行前请确认当前连接和权限。'
        }
      : {
          title: '问答',
          desc: 'AI 会读取当前终端上下文，解释报错、分析日志或生成命令建议，但不会自动执行命令。需要执行时，你可以手动发送到终端。'
        }
    return (
      <Tooltip
        placement='top'
        title={(
          <div className='cn-ai-mode-tip-pop'>
            <b>{modeInfo.title}</b>
            <span>{modeInfo.desc}</span>
          </div>
        )}
      >
        <span className='cn-ai-mode-label'>{label}</span>
      </Tooltip>
    )
  }

  function handleSendPromptToTerminal () {
    const command = prompt.trim()
    if (!command) {
      message.warning('请输入要发送到终端的命令')
      return
    }
    if (!props.selectedTabIds?.length) {
      message.warning('请先选择接收命令的终端')
      return
    }
    window.store.runCommandInTerminal(command)
    setPrompt('')
  }

  useEffect(() => {
    if (mode === 'agent' && !hasFeature(props.config, featureIds.aiAgent)) {
      setItem(aiChatModeLsKey, 'ask')
      setMode('ask')
    }
  }, [mode, props.config])

  useEffect(() => {
    refsStatic.add('AIChat', {
      setPrompt,
      handleSubmit
    })
    return () => {
      refsStatic.remove('AIChat')
    }
  }, [handleSubmit])

  if (!props.embedded && props.rightPanelTab !== 'ai') {
    return null
  }

  const handleKeyPress = (e) => {
    if (!e.shiftKey) {
      e.preventDefault()
      if (!submitDisabled) {
        handleSubmit()
      }
    }
  }

  const configMissing = window.store.aiConfigMissing()
  const modeInfo = getModeInfo()

  return (
    <Flex vertical className={props.embedded ? 'ai-chat-container ai-chat-embedded' : 'ai-chat-container'}>
      {
        props.embedded
          ? null
          : (
            <div className='cn-ai-chat-intro'>
              <div>
                <strong>智能助手</strong>
                <span>{isAgent ? '代理模式会根据你的要求尝试拆解并执行任务。' : '问答模式适合解释报错、生成命令和整理脚本。'}</span>
              </div>
              <b className={configMissing ? 'missing' : 'ready'}>{configMissing ? '未配置' : '已配置'}</b>
              <BulbOutlined />
            </div>
            )
      }
      <Flex className='ai-chat-history' flex='auto'>
        {renderConfigNotice()}
        {renderHistory()}
      </Flex>

      <Flex className='ai-chat-input'>
        <TextArea
          value={prompt}
          onChange={handlePromptChange}
          onPressEnter={handleKeyPress}
          placeholder={modeInfo.placeholder}
          autoSize={{ minRows: 3, maxRows: props.embedded ? 5 : 10 }}
          className='ai-chat-textarea'
        />
        <Flex className='ai-chat-terminals' justify='space-between' align='center'>
          <Flex align='center'>
            <Segmented
              options={[
                { label: renderModeLabel('ask', '问答'), value: 'ask' },
                { label: renderModeLabel('agent', '代理实验'), value: 'agent' }
              ]}
              value={mode}
              onChange={handleModeChange}
              size='small'
            />
            {renderContinuousChatToggle()}
            {renderTabSelect()}
            {
              isAgent
                ? null
                : (
                  <PlayCircleOutlined
                    onClick={handleSendPromptToTerminal}
                    className='mg1l pointer icon-hover send-to-terminal-icon'
                    title='把输入框内容发送到所选终端'
                  />
                  )
            }
            <SettingOutlined
              onClick={toggleConfig}
              className='mg1l pointer icon-hover toggle-ai-setting-icon'
            />
            <Popconfirm
              title='清空 AI 对话记录？'
              okText={window.translate('ok')}
              cancelText={window.translate('cancel')}
              onConfirm={clearHistory}
            >
              <UnorderedListOutlined
                className='mg2x pointer clear-ai-icon icon-hover'
                title='清空 AI 对话记录'
              />
            </Popconfirm>
            <HelpIcon
              link={aiConfigWikiLink}
            />
          </Flex>
          {renderSendIcon()}
        </Flex>
      </Flex>
    </Flex>
  )
}
