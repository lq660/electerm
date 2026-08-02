import { useState } from 'react'
import { auto } from 'manate/react'
import { Empty, Input, Popconfirm } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  SearchOutlined,
  SendOutlined
} from '@ant-design/icons'
import { copy } from '../../common/clipboard'
import { normalizeTerminalCommandForHistory } from '../../common/terminal-command-history.mjs'
import message from '../common/message'

function formatHistoryTime (value) {
  if (!value) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getSessionUseTime (item, sessionId) {
  return item?.sessionUsages?.[sessionId] || (item?.lastSessionId === sessionId ? item.lastUseTime : '')
}

function getHistoryTime (item, sessionId, scope) {
  return scope === 'current' ? getSessionUseTime(item, sessionId) : item.lastUseTime
}

function matchKeyword (item, keyword) {
  if (!keyword) return true
  return String(item.cmd || '').toLowerCase().includes(keyword.toLowerCase())
}

function isAfter (left, right) {
  return (Date.parse(left || '') || 0) > (Date.parse(right || '') || 0)
}

function mergeHistoryItems (items) {
  return items.reduce((result, item) => {
    const cmd = normalizeTerminalCommandForHistory(item?.cmd)
    if (!cmd) {
      return result
    }
    const existing = result.get(cmd)
    if (!existing) {
      result.set(cmd, {
        ...item,
        id: item.id || cmd,
        cmd,
        sessionUsages: { ...(item.sessionUsages || {}) }
      })
      return result
    }
    existing.count = (existing.count || 1) + (item.count || 1)
    existing.sessionUsages = {
      ...(existing.sessionUsages || {}),
      ...(item.sessionUsages || {})
    }
    if (isAfter(item.lastUseTime, existing.lastUseTime)) {
      existing.lastUseTime = item.lastUseTime
      existing.lastSource = item.lastSource
      existing.lastCommandSignal = item.lastCommandSignal
      existing.lastSessionId = item.lastSessionId
    }
    return result
  }, new Map()).values()
}

export default auto(function CommandHistoryPanel ({ tab, activeTerminalTitle, onUseCommand }) {
  const [keyword, setKeyword] = useState('')
  const [scope, setScope] = useState('current')
  const [sortType, setSortType] = useState('recent')
  const sessionId = tab.sessionRootId || tab.id
  const history = Array.from(mergeHistoryItems(window.store.terminalCommandHistory || []))

  const filtered = history
    .filter(item => {
      if (!item?.cmd) return false
      if (scope === 'current' && !getSessionUseTime(item, sessionId)) return false
      return matchKeyword(item, keyword)
    })
    .slice()

  if (sortType === 'count') {
    filtered.sort((a, b) => (b.count || 0) - (a.count || 0))
  } else {
    filtered.sort((a, b) => {
      const timeA = new Date(getHistoryTime(a, sessionId, scope)).getTime() || 0
      const timeB = new Date(getHistoryTime(b, sessionId, scope)).getTime() || 0
      return timeB - timeA
    })
  }

  const currentCount = history.filter(item => getSessionUseTime(item, sessionId)).length

  function handleSend (command, execute) {
    if (!command) return
    onUseCommand(command, execute)
    message.success(execute ? '命令已发送到当前终端执行' : '命令已填入当前终端')
  }

  function handleCopy (command, event) {
    event.stopPropagation()
    copy(command)
    message.success('命令已复制')
  }

  function handleDelete (command, event) {
    event?.stopPropagation?.()
    window.store.deleteCmdHistory(command)
  }

  function handleClearAll () {
    window.store.clearAllCmdHistory()
  }

  function renderItem (item) {
    const time = getHistoryTime(item, sessionId, scope) || item.lastUseTime
    return (
      <div className='cn-command-history-item' key={item.id || item.cmd}>
        {/* 2026-07-29 coder(lq): Keep row click as input-only; the play icon is the explicit execute action for safer ops history reuse. */}
        <button
          className='cn-command-history-command'
          title='填入当前终端，确认后再执行'
          onClick={() => handleSend(item.cmd, false)}
        >
          <code>{item.cmd}</code>
          <span>
            <em>{formatHistoryTime(time)}</em>
            <b>使用 {item.count || 1} 次</b>
          </span>
        </button>
        <div className='cn-command-history-actions'>
          <button title='立即执行' onClick={() => handleSend(item.cmd, true)}>
            <PlayCircleOutlined />
          </button>
          <button title='填入终端' onClick={() => handleSend(item.cmd, false)}>
            <SendOutlined />
          </button>
          <button title='复制命令' onClick={(event) => handleCopy(item.cmd, event)}>
            <CopyOutlined />
          </button>
          <Popconfirm
            title='删除这条命令？'
            okText='删除'
            cancelText='取消'
            onConfirm={(event) => handleDelete(item.cmd, event)}
          >
            <button title='删除命令'>
              <DeleteOutlined />
            </button>
          </Popconfirm>
        </div>
      </div>
    )
  }

  return (
    <div className='cn-command-history-panel'>
      <div className='cn-command-history-head'>
        <HistoryOutlined />
        <div>
          <strong>命令历史</strong>
          <span>{activeTerminalTitle} · 选择命令填入或执行</span>
        </div>
      </div>

      <div className='cn-command-history-filter'>
        <Input
          prefix={<SearchOutlined />}
          value={keyword}
          placeholder='搜索历史命令'
          allowClear
          onChange={event => setKeyword(event.target.value)}
        />
        <div className='cn-command-history-segments'>
          <button
            className={scope === 'current' ? 'active' : ''}
            onClick={() => setScope('current')}
          >
            当前会话 {currentCount}
          </button>
          <button
            className={scope === 'all' ? 'active' : ''}
            onClick={() => setScope('all')}
          >
            全部 {history.length}
          </button>
        </div>
        <div className='cn-command-history-segments'>
          <button
            className={sortType === 'recent' ? 'active' : ''}
            onClick={() => setSortType('recent')}
          >
            最近使用
          </button>
          <button
            className={sortType === 'count' ? 'active' : ''}
            onClick={() => setSortType('count')}
          >
            使用次数
          </button>
        </div>
      </div>

      <div className='cn-command-history-list'>
        {filtered.length
          ? filtered.map(renderItem)
          : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={scope === 'current' ? '当前会话还没有命令历史' : '还没有命令历史'}
            />
            )}
      </div>

      {history.length
        ? (
          <div className='cn-command-history-footer'>
            <span>点击命令正文只填入终端，播放按钮会立即执行。</span>
            <Popconfirm
              title='清空全部命令历史？'
              okText='清空'
              cancelText='取消'
              onConfirm={handleClearAll}
            >
              <button>清空</button>
            </Popconfirm>
          </div>
          )
        : null}
    </div>
  )
})
