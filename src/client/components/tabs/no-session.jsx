import { Button, ConfigProvider, Input, Progress, Tag, theme } from 'antd'
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

export default auto(function NoSessionPanel ({ height, onNewTab, onNewSsh, batch }) {
  const { store } = window
  const [serverKeyword, setServerKeyword] = useState('')
  const props = {
    style: {
      height: height + 'px'
    }
  }
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
  const savedServers = normalizedServerKeyword
    ? allSavedServers.filter(server => [
      server.name,
      server.host,
      server.groupTitle,
      server.load
    ].some(value => String(value || '').toLowerCase().includes(normalizedServerKeyword)))
    : allSavedServers
  const savedConnectionTotal = (store.bookmarks || []).length
  const transferTotal = store.fileTransfers?.length || 0
  const transferHistoryTotal = store.transferHistory?.length || 0
  const failedTransfers = (store.fileTransfers || []).filter(item => item.status === 'error').length
  const transferPercent = transferTotal
    ? Math.round((store.fileTransfers || []).reduce((sum, item) => sum + (item.percent || item.progress || 0), 0) / transferTotal)
    : 0
  const historyItems = store.config.disableConnectionHistory
    ? []
    : (store.history || [])

  const workbenchTheme = {
    token: {
      borderRadius: 6,
      colorPrimary: '#1677ff',
      colorBgBase: '#ffffff',
      colorBgContainer: '#ffffff',
      colorBorder: '#d8e0ea',
      colorTextBase: '#1f2937',
      colorText: '#1f2937',
      colorTextSecondary: '#667085',
      motion: false
    },
    algorithm: theme.defaultAlgorithm
  }

  return (
    <ConfigProvider theme={workbenchTheme}>
      <div className='no-sessions cn-workbench-home' {...props}>
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
                  <span>主工作页面</span>
                  <b>连接入口</b>
                </div>
                <h2>运维工作台</h2>
                <p>从这里打开本地终端、快速连接 SSH，连接成功后统一进入顶部 tab。</p>
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
                <span>快速连接</span>
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
                        : `已显示全部 ${savedConnectionTotal} 个连接，点击资源卡片直接进入 tab`
                    }
                  </p>
                </div>
                <Input
                  className='cn-saved-connection-search'
                  prefix={<SearchOutlined />}
                  placeholder='搜索名称、IP、分组或类型'
                  value={serverKeyword}
                  allowClear
                  onChange={event => setServerKeyword(event.target.value)}
                />
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
                              : '使用右上角“新建连接”保存后会显示在这里，也可以先用上方快速连接。'
                          }
                        </span>
                      </div>
                    </div>
                    )
              }
            </section>

            <div className='cn-workbench-status-grid'>
              <section className='cn-workbench-empty-info'>
                <CloudServerOutlined />
                <div>
                  <strong>会话信息跟随当前 tab</strong>
                  <span>服务器详情、文件、快捷命令和监控信息放在 SSH 页右侧边条，首页不展示不属于任何服务器的数据。</span>
                </div>
              </section>

              <section className='cn-transfer-drawer'>
                <div>
                  <strong>传输任务</strong>
                  <span>进行中 {transferTotal} · 已完成 {transferHistoryTotal} · 失败 {failedTransfers}</span>
                </div>
                <Progress percent={transferPercent} size='small' strokeColor='#1677ff' />
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
