import { useEffect, useMemo, useState } from 'react'
import { auto } from 'manate/react'
import { Input, Popconfirm } from 'antd'
import {
  BookOutlined,
  CopyOutlined,
  DeleteOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
  SendOutlined
} from '@ant-design/icons'
import Modal from '../common/modal'
import message from '../common/message'
import uid from '../../common/uid'
import { copy } from '../../common/clipboard'
import { safeGetItemJSON, safeSetItemJSON } from '../../common/safe-local-storage'
import {
  buildSolutionSummaryPrompt,
  getSessionAiContext,
  getSessionRecentCommands,
  getSolutionConnectionKey,
  normalizeSolutionRecord,
  parseSolutionSummary,
  solutionRecordsChangedEvent,
  solutionRecordStorageKey,
  sortSolutionRecords,
  toSolutionCommands
} from '../../common/solution-record-utils.mjs'
import {
  canCreateSolutionRecord,
  getSolutionRecordLimit
} from '../../common/feature-plans'

function getStoredRecords () {
  return sortSolutionRecords(safeGetItemJSON(solutionRecordStorageKey, []))
}

function formatRecordTime (time) {
  if (!time) return ''
  return new Date(time).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric'
  })
}

function matchesRecord (record, keyword) {
  if (!keyword) return true
  const text = [
    record.title,
    record.problem,
    record.summary,
    record.commands.join('\n'),
    record.tags.join(' '),
    record.serverName,
    record.host
  ].join('\n').toLowerCase()
  return text.includes(keyword.toLowerCase())
}

function createDraft ({ commands, conversations }) {
  const latestQuestion = conversations.at(-1)?.prompt || ''
  return {
    id: '',
    title: '',
    problem: latestQuestion,
    summary: '',
    commands: commands.join('\n'),
    tags: ''
  }
}

export default auto(function SolutionRecords ({ tab, serverName, host, onRunCommand }) {
  const [records, setRecords] = useState(getStoredRecords)
  const [composerOpen, setComposerOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [showAllRecords, setShowAllRecords] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [draft, setDraft] = useState(() => createDraft({ commands: [], conversations: [] }))
  const [summarizing, setSummarizing] = useState(false)

  const connectionKey = useMemo(() => getSolutionConnectionKey(tab), [
    tab.type,
    tab.username,
    tab.host,
    tab.port
  ])
  const sessionId = tab.id
  const recentCommands = getSessionRecentCommands(window.store.terminalCommandHistory, sessionId)
  const conversations = getSessionAiContext(window.store.aiChatHistory, sessionId)
  const currentServerRecords = records.filter(record => record.connectionKey === connectionKey)
  const visibleRecords = (showAllRecords ? records : currentServerRecords)
    .filter(record => matchesRecord(record, keyword))
  const selectedRecord = visibleRecords.find(record => record.id === selectedId) || visibleRecords[0] || null

  useEffect(() => {
    const handleRecordsChanged = () => setRecords(getStoredRecords())
    window.addEventListener(solutionRecordsChangedEvent, handleRecordsChanged)
    return () => window.removeEventListener(solutionRecordsChangedEvent, handleRecordsChanged)
  }, [])

  function updateDraft (field, value) {
    setDraft(previous => ({
      ...previous,
      [field]: value
    }))
  }

  function persist (nextRecords) {
    const normalized = sortSolutionRecords(nextRecords)
    safeSetItemJSON(solutionRecordStorageKey, normalized)
    setRecords(normalized)
    window.dispatchEvent(new window.CustomEvent(solutionRecordsChangedEvent))
  }

  function openComposer (record) {
    if (record) {
      setLibraryOpen(false)
      setDraft({
        id: record.id,
        title: record.title,
        problem: record.problem,
        summary: record.summary,
        commands: record.commands.join('\n'),
        tags: record.tags.join(', ')
      })
    } else {
      setDraft(createDraft({
        commands: recentCommands,
        conversations
      }))
    }
    setComposerOpen(true)
  }

  function openLibrary (record) {
    setSelectedId(record?.id || currentServerRecords[0]?.id || '')
    setKeyword('')
    setShowAllRecords(false)
    setLibraryOpen(true)
  }

  async function handleAiSummary () {
    if (window.store.aiConfigMissing()) {
      window.store.toggleAIConfig()
      return
    }
    setSummarizing(true)
    try {
      const config = window.store.config
      const commands = toSolutionCommands(draft.commands)
      const response = await window.pre.runGlobalAsync(
        'AIchat',
        buildSolutionSummaryPrompt({
          serverName,
          host,
          commands,
          conversations
        }),
        config.modelAI,
        '你只根据提供的事实整理处理记录，返回严格 JSON。',
        config.baseURLAI,
        config.apiPathAI,
        config.apiKeyAI,
        config.proxyAI,
        false,
        config.authHeaderNameAI
      )
      if (response?.error) {
        throw new Error(response.error)
      }
      const summary = parseSolutionSummary(response?.response)
      if (!summary) {
        throw new Error('AI 返回格式不正确，请手动填写')
      }
      setDraft(previous => ({
        ...previous,
        title: summary.title || previous.title,
        problem: summary.problem || previous.problem,
        summary: summary.summary || previous.summary,
        commands: summary.commands.length ? summary.commands.join('\n') : previous.commands,
        tags: summary.tags.length ? summary.tags.join(', ') : previous.tags
      }))
    } catch (error) {
      message.error(`AI 整理失败：${error.message}`)
    } finally {
      setSummarizing(false)
    }
  }

  function handleSave () {
    const title = String(draft.title || '').trim() || String(draft.problem || '').trim().slice(0, 28)
    if (!title) {
      message.warning('请填写问题标题或问题现象')
      return
    }
    const current = records.find(record => record.id === draft.id)
    if (!current && !canCreateSolutionRecord(window.store.config, records)) {
      message.warning(`个人版最多保存 ${getSolutionRecordLimit(window.store.config)} 条处理记录，请升级后继续保存。`)
      window.store.openSubscriptionSetting()
      return
    }
    const record = normalizeSolutionRecord({
      ...draft,
      id: draft.id || uid(),
      title,
      connectionKey,
      serverName,
      host,
      commands: toSolutionCommands(draft.commands),
      tags: draft.tags,
      createdAt: current?.createdAt || Date.now(),
      updatedAt: Date.now()
    })
    persist([
      record,
      ...records.filter(item => item.id !== record.id)
    ])
    setComposerOpen(false)
    message.success('处理记录已保存')
  }

  function handleDelete (record) {
    persist(records.filter(item => item.id !== record.id))
    setSelectedId('')
    message.success('处理记录已删除')
  }

  function handleSend (record, execute) {
    const command = record?.commands?.join('\n') || ''
    if (!command) {
      message.warning('这条记录没有可执行的命令')
      return
    }
    onRunCommand(command, execute)
    if (!execute) {
      message.success('命令已发送到当前终端，确认后再执行')
    }
  }

  function confirmExecute (record) {
    const commandCount = record.commands.length
    Modal.confirm({
      title: '执行处理命令',
      content: <div>将向当前终端执行这条记录中的 {commandCount} 条命令。</div>,
      okText: '执行',
      cancelText: '取消',
      onOk: () => handleSend(record, true)
    })
  }

  function renderRecordItem (record) {
    return (
      <button
        key={record.id}
        className='cn-solution-record-item'
        title={record.problem || record.summary || record.title}
        onClick={() => openLibrary(record)}
      >
        <BookOutlined />
        <span>
          <b>{record.title}</b>
          <em>{record.summary || record.problem || '已保存处理步骤'}</em>
        </span>
        <i>{record.commands.length ? `${record.commands.length} 条` : formatRecordTime(record.updatedAt)}</i>
      </button>
    )
  }

  function renderComposer () {
    return (
      <Modal
        open={composerOpen}
        onCancel={() => setComposerOpen(false)}
        title={draft.id ? '编辑处理记录' : '保存本次处理'}
        width={720}
        wrapClassName='solution-record-modal'
        footer={(
          <div className='custom-modal-footer-buttons'>
            <button className='custom-modal-cancel-btn' onClick={() => setComposerOpen(false)}>取消</button>
            <button className='custom-modal-ok-btn' onClick={handleSave}>保存记录</button>
          </div>
        )}
      >
        <div className='solution-record-composer-head'>
          <div>
            <strong>{serverName}</strong>
            <span>{host}</span>
          </div>
          <button
            className='solution-record-ai-button'
            disabled={summarizing}
            onClick={handleAiSummary}
          >
            {summarizing ? <LoadingOutlined spin /> : <RobotOutlined />}
            <span>{summarizing ? 'AI 整理中' : 'AI 整理'}</span>
          </button>
        </div>
        <label className='solution-record-field'>
          <span>问题标题</span>
          <Input
            value={draft.title}
            maxLength={80}
            placeholder='例如：Nginx 发布后出现 502'
            onChange={event => updateDraft('title', event.target.value)}
          />
        </label>
        <label className='solution-record-field'>
          <span>问题现象</span>
          <Input.TextArea
            value={draft.problem}
            rows={3}
            placeholder='记录报错、影响范围或复现条件'
            onChange={event => updateDraft('problem', event.target.value)}
          />
        </label>
        <label className='solution-record-field'>
          <span>处理结论</span>
          <Input.TextArea
            value={draft.summary}
            rows={4}
            placeholder='记录确认过的原因、处理方式和注意事项'
            onChange={event => updateDraft('summary', event.target.value)}
          />
        </label>
        <label className='solution-record-field'>
          <span>实际执行命令</span>
          <Input.TextArea
            value={draft.commands}
            rows={6}
            placeholder='每行一条命令，可直接修改或补充'
            onChange={event => updateDraft('commands', event.target.value)}
          />
          <small>已带入当前会话最近执行的命令，请移除无关或含敏感信息的内容。</small>
        </label>
        <label className='solution-record-field'>
          <span>标签</span>
          <Input
            value={draft.tags}
            placeholder='例如：Nginx、发布、502'
            onChange={event => updateDraft('tags', event.target.value)}
          />
        </label>
      </Modal>
    )
  }

  function renderLibrary () {
    const detail = selectedRecord
    return (
      <Modal
        open={libraryOpen}
        onCancel={() => setLibraryOpen(false)}
        title='处理记录'
        width={820}
        wrapClassName='solution-record-modal'
        footer={null}
      >
        <div className='solution-record-library-head'>
          <Input
            prefix={<SearchOutlined />}
            value={keyword}
            placeholder='搜索问题、命令或标签'
            onChange={event => setKeyword(event.target.value)}
          />
          <button
            className={showAllRecords ? 'active' : ''}
            onClick={() => setShowAllRecords(!showAllRecords)}
          >
            {showAllRecords ? '全部服务器' : '当前服务器'}
          </button>
        </div>
        <div className='solution-record-library'>
          <div className='solution-record-library-list'>
            {visibleRecords.length
              ? visibleRecords.map(record => (
                <button
                  key={record.id}
                  className={record.id === detail?.id ? 'active' : ''}
                  onClick={() => setSelectedId(record.id)}
                >
                  <strong>{record.title}</strong>
                  <span>{record.serverName || record.host}</span>
                  <em>{record.summary || record.problem || '已保存处理步骤'}</em>
                </button>
              ))
              : <div className='solution-record-library-empty'>还没有匹配的处理记录</div>}
          </div>
          <div className='solution-record-detail'>
            {detail
              ? (
                <>
                  <div className='solution-record-detail-head'>
                    <div>
                      <strong>{detail.title}</strong>
                      <span>{detail.serverName || detail.host} · {formatRecordTime(detail.updatedAt)}</span>
                    </div>
                    <div className='solution-record-detail-actions'>
                      <button title='编辑记录' onClick={() => openComposer(detail)}>编辑</button>
                      <Popconfirm
                        title='删除这条处理记录？'
                        okText='删除'
                        cancelText='取消'
                        onConfirm={() => handleDelete(detail)}
                      >
                        <button title='删除记录'><DeleteOutlined /></button>
                      </Popconfirm>
                    </div>
                  </div>
                  {detail.problem
                    ? <section><b>问题现象</b><p>{detail.problem}</p></section>
                    : null}
                  {detail.summary
                    ? <section><b>处理结论</b><p>{detail.summary}</p></section>
                    : null}
                  <section className='solution-record-command-section'>
                    <div className='solution-record-command-title'>
                      <b>处理命令</b>
                      <span>{detail.commands.length} 条</span>
                    </div>
                    {detail.commands.length
                      ? detail.commands.map((command, index) => (
                        <div className='solution-record-command' key={`${command}-${index}`}>
                          <code>{command}</code>
                          <button title='复制命令' onClick={() => copy(command)}><CopyOutlined /></button>
                        </div>
                      ))
                      : <p>没有保存可执行命令</p>}
                  </section>
                  {detail.tags.length
                    ? <div className='solution-record-tags'>{detail.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                    : null}
                  <div className='solution-record-run-actions'>
                    <button onClick={() => handleSend(detail, false)}><SendOutlined />发送到终端</button>
                    <button className='primary' onClick={() => confirmExecute(detail)}><PlayCircleOutlined />执行命令</button>
                  </div>
                </>
                )
              : <div className='solution-record-library-empty'>从左侧选择一条处理记录</div>}
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <>
      <div className='cn-session-aside-section cn-solution-record-section'>
        <div className='cn-solution-record-heading'>
          <div>
            <span>处理记录</span>
            <em>{currentServerRecords.length ? `当前服务器 ${currentServerRecords.length} 条` : '沉淀可复用的处理步骤'}</em>
          </div>
          <button title='保存本次处理' onClick={() => openComposer()}><PlusOutlined /></button>
        </div>
        {currentServerRecords.length
          ? <div className='cn-solution-record-list'>{currentServerRecords.slice(0, 2).map(renderRecordItem)}</div>
          : <div className='cn-solution-record-empty'>处理完成后，保存问题、结论和实际执行命令。</div>}
        <button className='cn-solution-record-library-button' onClick={() => openLibrary()}>
          <BookOutlined />
          <span>查看处理记录</span>
        </button>
      </div>
      {renderLibrary()}
      {renderComposer()}
    </>
  )
})
