import { useState, useCallback, useEffect } from 'react'
import { Flex, Input, Popconfirm, Segmented } from 'antd'
import TabSelect from '../footer/tab-select'
import AiChatHistory from './ai-chat-history'
import uid from '../../common/uid'
import { pick } from 'lodash-es'
import {
  BulbOutlined,
  SettingOutlined,
  SendOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'
import {
  aiConfigWikiLink,
  aiChatModeLsKey
} from '../../common/constants'
import { getItem, setItem } from '../../common/safe-local-storage.js'
import HelpIcon from '../common/help-icon'
import { refsStatic } from '../common/ref'
import './ai.styl'

const { TextArea } = Input
const MAX_HISTORY = 100

export default function AIChat (props) {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState(() => getItem(aiChatModeLsKey) || 'ask')
  const isAgent = mode === 'agent'
  const submitDisabled = isAgent && props.agentRunning

  function handlePromptChange (e) {
    setPrompt(e.target.value)
  }

  function handleModeChange (val) {
    setItem(aiChatModeLsKey, val)
    setMode(val)
  }

  const handleSubmit = useCallback(function () {
    if (window.store.aiConfigMissing()) {
      window.store.toggleAIConfig()
      return
    }
    if (!prompt.trim()) return

    const chatId = uid()
    const chatEntry = {
      prompt,
      response: '',
      isStreaming: false,
      pending: true,
      sessionId: null,
      mode,
      toolCalls: [],
      sessionRootId: props.activeTabId,
      ...pick(props.config, [
        'nameAI',
        'modelAI',
        'roleAI',
        'baseURLAI',
        'apiPathAI',
        'apiKeyAI',
        'proxyAI',
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
  }, [prompt, mode, props.activeTabId, props.config])

  function renderHistory () {
    if (!props.aiChatHistory.length) {
      const suggestions = [
        {
          title: '解释报错',
          desc: '粘贴终端输出，说明原因和处理步骤',
          prompt: '请解释这段终端报错，并给出排查步骤：\n'
        },
        {
          title: '生成命令',
          desc: '描述目标，生成可直接执行的命令',
          prompt: '请根据这个目标生成命令，并说明每个参数的作用：\n'
        },
        {
          title: '整理脚本',
          desc: '把多条命令整理成脚本或运维流程',
          prompt: '请把下面的操作整理成一个可维护的脚本：\n'
        }
      ]
      return (
        <div className='cn-ai-empty-state'>
          <strong>可以这样开始</strong>
          <span>选择一个常用场景，或者直接在底部输入问题。</span>
          <div className='cn-ai-suggestion-grid'>
            {
              suggestions.map(item => (
                <button
                  key={item.title}
                  onClick={() => setPrompt(item.prompt)}
                >
                  <b>{item.title}</b>
                  <em>{item.desc}</em>
                </button>
              ))
            }
          </div>
        </div>
      )
    }
    return (
      <AiChatHistory
        history={props.aiChatHistory}
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
    window.store.aiChatHistory = []
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
        title='Enter 发送，Shift+Enter 换行'
      />
    )
  }

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
          placeholder='请输入你的问题或操作要求'
          autoSize={{ minRows: 3, maxRows: 10 }}
          className='ai-chat-textarea'
        />
        <Flex className='ai-chat-terminals' justify='space-between' align='center'>
          <Flex align='center'>
            <Segmented
              options={[
                { label: '问答', value: 'ask' },
                { label: '代理实验', value: 'agent' }
              ]}
              value={mode}
              onChange={handleModeChange}
              size='small'
            />
            {renderTabSelect()}
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
