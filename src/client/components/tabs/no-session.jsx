import { Button, ConfigProvider, Input, Progress, Select, Tag } from 'antd'
import { useState } from 'react'
import {
  ClockCircleOutlined,
  CloudServerOutlined,
  CodeOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import { auto } from 'manate/react'
import HistoryPanel from '../sidebar/history'
import QuickConnect from './quick-connect'
import {
  connectionMap,
  paneMap
} from '../../common/constants'
import { dedupeRecentHistory } from '../../common/recent-history'
import { getWorkbenchAntdTheme, getWorkbenchTokens } from '../../common/workbench-theme'
import { getZoomPercent } from '../../common/zoom-display'
import './no-session.styl'

function safeGroup (group) {
  if (typeof group !== 'string') {
    return group
  }
  try {
    return JSON.parse(group)
  } catch (err) {
    return null
  }
}

function getBookmarkTitle (bookmark) {
  return bookmark.title || bookmark.name || bookmark.host || bookmark.path || '未命名连接'
}

function getBookmarkMeta (bookmark) {
  if (bookmark.host) {
    return `${bookmark.username ? bookmark.username + '@' : ''}${bookmark.host}${bookmark.port ? ':' + bookmark.port : ''}`
  }
  return bookmark.path || bookmark.url || bookmark.type || '本地连接'
}

function getConnectionLabel (bookmark) {
  const type = bookmark.type || connectionMap.ssh
  const pane = bookmark.pane || ''
  if (type === connectionMap.ssh && pane === paneMap.fileManager) {
    return 'SFTP'
  }
  return String(type).toUpperCase()
}

const serverSortOptions = [
  { value: 'recent', label: '最近使用' },
  { value: 'created', label: '添加时间' },
  { value: 'name', label: '名称' },
  { value: 'group', label: '分组' },
  { value: 'type', label: '类型' }
]

function getCompactWorkbenchTheme (themeConfig) {
  const base = getWorkbenchAntdTheme(themeConfig)
  const baseComponents = base.components || {}
  return {
    ...base,
    token: {
      ...base.token,
      fontSize: 11,
      fontSizeSM: 10,
      fontSizeLG: 13,
      controlHeight: 28,
      controlHeightSM: 24,
      controlHeightLG: 30,
      lineHeight: 1.35
    },
    components: {
      ...baseComponents,
      Button: {
        ...(baseComponents.Button || {}),
        controlHeight: 28,
        controlHeightSM: 24,
        controlHeightLG: 30,
        fontSize: 11,
        fontSizeSM: 10,
        paddingInline: 8,
        paddingInlineSM: 6
      },
      Input: {
        ...(baseComponents.Input || {}),
        controlHeight: 28,
        fontSize: 11
      },
      Select: {
        ...(baseComponents.Select || {}),
        controlHeight: 28,
        fontSize: 11
      },
      Tag: {
        ...(baseComponents.Tag || {}),
        fontSizeSM: 10
      }
    }
  }
}

function parseTime (value) {
  const time = new Date(value || 0).getTime()
  return Number.isNaN(time) ? 0 : time
}

function compareText (a, b) {
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN', {
    numeric: true,
    sensitivity: 'base'
  })
}

function isSameHistoryTab (bookmark, tab) {
  if (!bookmark || !tab) {
    return false
  }
  if (bookmark.host || tab.host) {
    return bookmark.host === tab.host &&
      String(bookmark.port || '') === String(tab.port || '') &&
      String(bookmark.username || '') === String(tab.username || '') &&
      String(bookmark.type || connectionMap.ssh) === String(tab.type || connectionMap.ssh)
  }
  return Boolean(bookmark.path && bookmark.path === tab.path) ||
    Boolean(bookmark.url && bookmark.url === tab.url)
}

function getRecentUseTime (bookmark, history) {
  const savedTime = parseTime(bookmark?.lastUseTime)
  if (savedTime) {
    return savedTime
  }
  const matchedHistory = (history || []).find(item => isSameHistoryTab(bookmark, item.tab))
  return parseTime(matchedHistory?.time)
}

function getCreatedTime (bookmark) {
  const createdAt = parseTime(bookmark?.createdAt || bookmark?.createTime || bookmark?.createdTime)
  if (createdAt) {
    return createdAt
  }
  const idTime = String(bookmark?.id || '').match(/_(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/)
  if (!idTime) {
    return 0
  }
  const [, year, month, day, hour, minute, second] = idTime
  return parseTime(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
}

function sortSavedServers (servers, sortType, history) {
  return servers
    .map((server, index) => ({ ...server, originalIndex: index }))
    .sort((a, b) => {
      if (sortType === 'name') {
        return compareText(a.name, b.name) || a.originalIndex - b.originalIndex
      }
      if (sortType === 'group') {
        return compareText(a.groupTitle, b.groupTitle) ||
          compareText(a.name, b.name) ||
          a.originalIndex - b.originalIndex
      }
      if (sortType === 'type') {
        return compareText(a.load, b.load) ||
          compareText(a.name, b.name) ||
          a.originalIndex - b.originalIndex
      }
      if (sortType === 'created') {
        const createdDiff = getCreatedTime(b.bookmark) - getCreatedTime(a.bookmark)
        return createdDiff || a.originalIndex - b.originalIndex
      }
      const recentDiff = getRecentUseTime(b.bookmark, history) - getRecentUseTime(a.bookmark, history)
      return recentDiff || a.originalIndex - b.originalIndex
    })
}

function buildServerGroups (store) {
  const bookmarks = store.bookmarks || []
  const bookmarkMap = new Map(bookmarks.map(bookmark => [bookmark.id, bookmark]))
  const groupedBookmarkIds = new Set()
  const groups = (store.bookmarkGroups || [])
    .map(safeGroup)
    .filter(Boolean)
    .map(group => {
      const servers = (group.bookmarkIds || [])
        .map(id => {
          groupedBookmarkIds.add(id)
          return bookmarkMap.get(id)
        })
        .filter(Boolean)
        .map(bookmark => ({
          id: bookmark.id,
          name: getBookmarkTitle(bookmark),
          host: getBookmarkMeta(bookmark),
          status: bookmark.host ? 'online' : 'offline',
          load: getConnectionLabel(bookmark),
          bookmark
        }))
      return {
        title: group.title || '默认分组',
        count: group.bookmarkIds?.length || servers.length,
        servers
      }
    })
    .filter(group => group.servers.length)

  const ungroupedServers = bookmarks
    .filter(bookmark => !groupedBookmarkIds.has(bookmark.id))
    .map(bookmark => ({
      id: bookmark.id,
      name: getBookmarkTitle(bookmark),
      host: getBookmarkMeta(bookmark),
      status: bookmark.host ? 'online' : 'offline',
      load: getConnectionLabel(bookmark),
      bookmark
    }))
  if (ungroupedServers.length) {
    groups.push({
      title: '未分组',
      count: ungroupedServers.length,
      servers: ungroupedServers
    })
  }

  if (groups.length) {
    return groups
  }

  return []
}

export default auto(function NoSessionPanel ({ onNewTab, onNewSsh, batch }) {
  const { store } = window
  const [serverKeyword, setServerKeyword] = useState('')
  const [serverSort, setServerSort] = useState('recent')
  const handleClick = () => {
    window.openTabBatch = batch
  }

  const openSettings = () => window.store.openSetting()

  const openLocalFiles = () => {
    window.store.addTab({
      type: connectionMap.local,
      pane: paneMap.fileManager,
      batch
    })
  }

  const openQuickCommandSettings = () => {
    window.store.handleOpenQuickCommandsSetting()
  }

  const openServer = (server) => {
    if (server.bookmark?.id) {
      store.onSelectBookmark(server.bookmark.id)
      return
    }
    onNewSsh()
  }

  const groups = buildServerGroups(store)
  const allSavedServers = groups
    .flatMap(group => group.servers.map(server => ({
      ...server,
      groupTitle: group.title
    })))
  const normalizedServerKeyword = serverKeyword.trim().toLowerCase()
  const filteredSavedServers = normalizedServerKeyword
    ? allSavedServers.filter(server => [
      server.name,
      server.host,
      server.groupTitle,
      server.load
    ].some(value => String(value || '').toLowerCase().includes(normalizedServerKeyword)))
    : allSavedServers
  const savedServers = sortSavedServers(filteredSavedServers, serverSort, store.history)
  const savedConnectionTotal = (store.bookmarks || []).length
  const transferTotal = store.fileTransfers?.length || 0
  const transferHistoryTotal = store.transferHistory?.length || 0
  const failedTransfers = (store.fileTransfers || []).filter(item => item.status === 'error').length
  const transferPercent = transferTotal
    ? Math.round((store.fileTransfers || []).reduce((sum, item) => sum + (item.percent || item.progress || 0), 0) / transferTotal)
    : 0
  const historyItems = store.config.disableConnectionHistory
    ? []
    : dedupeRecentHistory(store.history || [])

  const uiTheme = store.getUiThemeConfig()
  const workbenchTheme = getCompactWorkbenchTheme(uiTheme)
  const workbenchTokens = getWorkbenchTokens(uiTheme)
  const zoomPercent = getZoomPercent(store.config?.zoom)

  return (
    <ConfigProvider theme={workbenchTheme}>
      <div className='no-sessions cn-workbench-home'>
        <div className='cn-workbench-shell'>
          <aside className='cn-workbench-sidebar'>
            <div className='cn-brand-block'>
              <div className='cn-brand-mark'>云</div>
              <div>
                <div className='cn-brand-name'>云舵工作台</div>
                <div className='cn-brand-sub'>本地终端 + 远程服务器管理器</div>
              </div>
            </div>
            <div className='cn-area-label'>
              <span>工作区导航</span>
              <b>资源入口</b>
            </div>
            <Input
              className='cn-server-search'
              prefix={<SearchOutlined />}
              placeholder='搜索服务器、IP 或标签'
              size='small'
            />
            <div className='cn-nav-section'>
              <div className='cn-section-title'>本地工作区</div>
              <button className='cn-nav-item active' onClick={onNewTab} disabled={!window.store.hasNodePty}>
                <CodeOutlined />
                <span>本地终端</span>
                <Tag className='cn-shell-tag'>zsh</Tag>
              </button>
              <button className='cn-nav-item' onClick={openLocalFiles}>
                <FolderOpenOutlined />
                <span>本地文件</span>
              </button>
              <button className='cn-nav-item' onClick={openQuickCommandSettings}>
                <FileTextOutlined />
                <span>脚本片段</span>
              </button>
            </div>
            <div className='cn-nav-section remote-section'>
              <div className='cn-section-title with-action'>
                <span>远程服务器</span>
                <button onClick={onNewSsh}><PlusOutlined /></button>
              </div>
              {
                groups.map(group => (
                  <div className='cn-server-group' key={group.title}>
                    <div className='cn-group-name'>
                      <span>{group.title}</span>
                      <span>{group.count}</span>
                    </div>
                    {
                      group.servers.map(server => (
                        <button className='cn-server-row' key={`${group.title}-${server.name}`} onClick={() => openServer(server)}>
                          <i className={`cn-status-dot ${server.status}`} />
                          <span>
                            <strong>{server.name}</strong>
                            <em>{server.host}</em>
                          </span>
                          <b>{server.load}</b>
                        </button>
                      ))
                    }
                  </div>
                ))
              }
            </div>
          </aside>

          <main className='cn-workbench-main'>
            <header className='cn-workbench-toolbar'>
              <div>
                <div className='cn-page-kicker'>
                  <span>云舵工作台</span>
                  <b>连接入口</b>
                </div>
                <h2>连接中心</h2>
                <div className='cn-header-meta' aria-label='工作台概览'>
                  <span>服务器 {savedConnectionTotal}</span>
                  <span>最近 {historyItems.length}</span>
                  <span>传输 {transferTotal}</span>
                  <span>缩放 {zoomPercent}%</span>
                </div>
              </div>
              <div className='cn-toolbar-actions'>
                <Button type='primary' icon={<CodeOutlined />} onClick={onNewTab} disabled={!window.store.hasNodePty}>
                  本地终端
                </Button>
                <Button icon={<CloudServerOutlined />} onClick={onNewSsh}>
                  新建连接
                </Button>
                <Button icon={<SettingOutlined />} onClick={openSettings}>
                  设置
                </Button>
              </div>
            </header>

            <section className='cn-quick-connect'>
              <div className='cn-panel-title'>
                <ThunderboltOutlined />
                <span>SSH 快速连接</span>
              </div>
              <QuickConnect batch={batch} inputOnly />
            </section>

            <section className='cn-saved-connections'>
              <div className='cn-saved-connections-head'>
                <div>
                  <div className='cn-panel-title'>
                    <CloudServerOutlined />
                    <span>服务器资源</span>
                  </div>
                  <p>
                    {
                      normalizedServerKeyword
                        ? `已保存 ${savedConnectionTotal} 个连接，当前显示 ${savedServers.length} 个`
                        : `共 ${savedConnectionTotal} 个连接`
                    }
                  </p>
                </div>
                <div className='cn-saved-connection-tools'>
                  <Select
                    className='cn-saved-connection-sort'
                    size='small'
                    value={serverSort}
                    options={serverSortOptions}
                    onChange={setServerSort}
                    aria-label='服务器资源排序方式'
                  />
                  <Input
                    className='cn-saved-connection-search'
                    prefix={<SearchOutlined />}
                    placeholder='搜索名称、IP、分组或类型'
                    value={serverKeyword}
                    allowClear
                    onChange={event => setServerKeyword(event.target.value)}
                  />
                </div>
              </div>
              {
                savedServers.length
                  ? (
                    <div className='cn-saved-connection-grid'>
                      {
                        savedServers.map(server => (
                          <div
                            className='cn-connection-card'
                            key={`${server.groupTitle}-${server.id}`}
                            role='button'
                            tabIndex={0}
                            onClick={() => openServer(server)}
                            onKeyDown={event => {
                              if (event.key === 'Enter') {
                                openServer(server)
                              }
                            }}
                          >
                            <i className={`cn-status-dot ${server.status}`} />
                            <div className='cn-connection-card-main'>
                              <strong>{server.name}</strong>
                              <em>{server.host}</em>
                              <span>{server.groupTitle}</span>
                            </div>
                            <Tag className='cn-connection-type'>{server.load}</Tag>
                            <Button
                              type='primary'
                              size='small'
                              className='cn-connection-open-btn'
                              onClick={event => {
                                event.stopPropagation()
                                openServer(server)
                              }}
                            >
                              打开
                            </Button>
                          </div>
                        ))
                      }
                    </div>
                    )
                  : (
                    <div className='cn-empty-connections'>
                      <CloudServerOutlined />
                      <div>
                        <strong>{normalizedServerKeyword ? '未找到匹配连接' : '暂无已保存连接'}</strong>
                        <span>
                          {
                            normalizedServerKeyword
                              ? '请更换名称、IP、分组或类型关键词。'
                              : '新建连接后会显示在这里。'
                          }
                        </span>
                        {
                          normalizedServerKeyword
                            ? null
                            : (
                              <div className='cn-empty-actions'>
                                <Button type='primary' size='small' onClick={onNewSsh}>新建连接</Button>
                                <Button size='small' onClick={onNewTab} disabled={!window.store.hasNodePty}>本地终端</Button>
                              </div>
                              )
                        }
                      </div>
                    </div>
                    )
              }
            </section>

            <div className='cn-workbench-status-row'>
              <section className='cn-transfer-drawer'>
                <div>
                  <strong>传输任务</strong>
                  <span>进行中 {transferTotal} · 已完成 {transferHistoryTotal} · 失败 {failedTransfers}</span>
                </div>
                <Progress percent={transferPercent} size='small' strokeColor={workbenchTokens['workbench-primary']} />
              </section>
            </div>
          </main>

          <aside className='cn-history-panel' onClick={handleClick}>
            <div className='cn-area-label'>
              <span>动态区</span>
              <b>最近访问</b>
            </div>
            <div className='cn-panel-title'>
              <ClockCircleOutlined />
              <span>最近连接</span>
            </div>
            {
              historyItems.length
                ? <HistoryPanel sort />
                : (
                  <div className='cn-empty-history'>
                    <ClockCircleOutlined />
                    <strong>暂无最近连接</strong>
                    <span>打开或保存连接后会显示在这里。</span>
                  </div>
                  )
            }
          </aside>
        </div>
      </div>
    </ConfigProvider>
  )
})
