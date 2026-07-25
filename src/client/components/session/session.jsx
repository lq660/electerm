/**
 * terminal/sftp wrapper
 */
import { createRef } from 'react'
import { Component } from 'manate/react/class-components'
import Term from '../terminal/terminal.jsx'
import Sftp from '../sftp/sftp-entry'
import RdpSession from '../rdp/rdp-session'
import VncSession from '../vnc/vnc-session'
import WebSession from '../web/web-session.jsx'
import SpiceSession from '../spice/spice-session'
import BatchInput from '../footer/batch-input'
import TransferModal from '../sidebar/transfer-modal'
import AIChat from '../ai/ai-chat-entry'
import CommandAssistant from '../terminal/command-assistant'
import TerminalInfoRunner from '../terminal-info/run-cmd'
import SolutionRecords from './solution-records'
import {
  SearchOutlined,
  CopyOutlined,
  FullscreenOutlined,
  PaperClipOutlined,
  CloseOutlined,
  ApartmentOutlined,
  CloudServerOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  RobotOutlined,
  BookOutlined,
  FontColorsOutlined,
  DownOutlined,
  UpOutlined,
  PlusOutlined
} from '@ant-design/icons'
import {
  Tooltip,
  Splitter
} from 'antd'
import { pick } from 'lodash-es'
import copy from 'json-deep-copy'
import classnames from 'classnames'
import {
  paneMap,
  connectionMap,
  terminalRdpType,
  terminalVncType,
  terminalWebType,
  terminalTelnetType,
  terminalFtpType,
  terminalSpiceType,
  isMac,
  sessionAsideWidthKey
} from '../../common/constants'
import createName from '../../common/create-title'
import uid from '../../common/uid'
import { SplitViewIcon } from '../icons/split-view'
import { refs } from '../common/ref'
import sanitizeFilename from '../../common/sanitize-filename.js'
import { HeartbeatIcon } from '../icons/heartbeat'
import {
  clearActiveTerminalId,
  setActiveTerminalId
} from '../../common/active-terminal'
import {
  featureIds,
  getFeatureLockedMessage,
  hasFeature
} from '../../common/feature-plans'
import { getItem, setItem } from '../../common/safe-local-storage'
import message from '../common/message'
import './session.styl'

const e = window.translate
const SplitterPane = Splitter.Panel
const sessionAsideMinWidth = 320
const sessionAsideDefaultWidth = 360

function normalizeSessionAsideWidth (value) {
  const width = parseInt(value, 10)
  if (!Number.isFinite(width)) {
    return sessionAsideDefaultWidth
  }
  // 2026-07-20 coder(lq): The right session panel is user-resizable; keep only a usability floor and do not cap the expanded width.
  return Math.max(sessionAsideMinWidth, width)
}

function getInitialSessionAsideWidth () {
  return normalizeSessionAsideWidth(getItem(sessionAsideWidthKey))
}

function shouldEnablePathFollowByDefault (props) {
  const { tab = {}, config = {} } = props
  const termType = tab?.type
  const isLocal = !tab.authType && (termType === connectionMap.local || !termType)
  // 2026-07-11 coder(lq): Local file tabs sync on explicit user action; keep the persisted follow preference only for remote sessions.
  return !isLocal && !!config.sftpPathFollowSsh
}

function sizeToBytes (value = '') {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) return 0
  const unit = String(value).trim().slice(-1).toUpperCase()
  const multiplier = {
    K: 1024,
    M: 1024 * 1024,
    G: 1024 * 1024 * 1024,
    T: 1024 * 1024 * 1024 * 1024
  }[unit] || 1
  return parsed * multiplier
}

function getUsagePercent (used, total) {
  const usedBytes = sizeToBytes(used)
  const totalBytes = sizeToBytes(total)
  return totalBytes ? Math.round(usedBytes * 100 / totalBytes) : 0
}

function getEmptyServerMetrics () {
  return {
    uptime: '',
    cpu: '',
    mem: {},
    disks: []
  }
}

export default class SessionWrapper extends Component {
  constructor (props) {
    super(props)
    this.domRef = createRef()
    this.sessionAsideRef = createRef()
    this.sessionAsideDragWidth = null
    this.state = {
      cwd: '',
      sftpPathFollowSsh: shouldEnablePathFollowByDefault(props),
      key: Math.random(),
      splitSize: [50, 50],
      sessionOptions: null,
      delKeyPressed: false,
      broadcastInput: false,
      keepaliveEnabled: false,
      sessionAsideCollapsed: false,
      showTransferPanel: false,
      showBatchInput: false,
      showCommandAssistant: false,
      showAiAssistant: false,
      sessionAsideTab: 'session',
      sessionAsideWidth: getInitialSessionAsideWidth(),
      draggingTerminalSessionId: '',
      dragOverTerminalSessionId: '',
      dragOverTerminalSessionPosition: '',
      terminalSessions: [],
      terminalCwds: {},
      activeTerminalSessionId: props.tab.id,
      draggingFileSessionId: '',
      dragOverFileSessionId: '',
      dragOverFileSessionPosition: '',
      fileSessions: [],
      activeFileSessionId: props.tab.id,
      serverMetrics: getEmptyServerMetrics()
    }
    props.tab.sshSftpSplitView = !!props.config.sshSftpSplitView
  }

  minWithForSplit = 640
  minHeightForSplit = 400
  transferPanelHeight = 230

  componentDidMount () {
    if (this.isChildTerminalTab()) {
      setActiveTerminalId(this.props.tab.id, this.getActiveTerminalSessionId())
    }
  }

  componentWillUnmount () {
    clearTimeout(this.backspaceKeyPressedTimer)
    this.removeSessionAsideResizeListeners()
    clearActiveTerminalId(this.props.tab.id)
  }

  getDom = () => {
    return this.domRef.current
  }

  isDisabled = () => {
    const { enableSsh, enableSftp } = this.props.tab
    return enableSsh === false || enableSftp === false
  }

  isSshDisabled = () => {
    return this.props.tab.enableSsh === false
  }

  isSftpDisabled = () => {
    return this.props.tab.enableSftp === false
  }

  handleSshSftpSplitView = () => {
    const nv = !this.props.tab.sshSftpSplitView
    this.editTab({
      sshSftpSplitView: nv
    })
    if (nv) {
      // 2026-07-06 coder(lq): Split view should immediately bind the file pane to the current terminal path without requiring a manual follow toggle.
      setTimeout(() => {
        this.syncCwdFromTerminalSession()
        this.refreshActiveTerminalCwd(this.getActiveTerminalSessionId(), [0, 600, 1400, 2400])
        window.store.triggerResize()
      }, 0)
    } else {
      window.store.triggerResize()
    }
  }

  canSplitView = () => {
    const {
      width,
      height
    } = this.props
    if (this.isDisabled()) {
      return false
    }
    return width > this.minWithForSplit ||
      height > this.minHeightForSplit
  }

  getSplitDirection = () => {
    const {
      sshSftpSplitView
    } = this.props.tab
    if (!sshSftpSplitView || !this.canSplitView()) {
      return 'tabed'
    }
    const {
      width,
      height
    } = this.props
    const ratio = width / height
    const baseRatio = this.minWithForSplit / this.minHeightForSplit
    const wider = ratio > baseRatio
    return wider ? 'leftRight' : 'topDown'
  }

  handleClick = () => {
    window.store.activeTabId = this.props.tab.id
  }

  onDrop = (e) => {
    e.preventDefault()
    const { target } = e
    if (!target) {
      return
    }
    let fromTab
    try {
      fromTab = JSON.parse(e.dataTransfer.getData('fromFile'))
    } catch (e) {
      return
    }
    const onDropElem = this.getDom()
    const { batch } = this.props.tab
    if (!onDropElem || !fromTab || fromTab.batch === batch) {
      return
    }
    const { store } = window
    const { tabs } = store
    const t = tabs.find(t => t.id === fromTab.id)
    if (!t) {
      return
    }
    // Handle currentTab change if needed
    const fromBatch = fromTab.batch
    if (window.store[`activeTabId${fromBatch}`] === fromTab.id && fromBatch !== batch) {
      // Find next tab in the same batch
      const nextTab = tabs.find((t, i) =>
        t.id !== fromTab.id && t.batch === fromBatch
      )
      window.store[`activeTabId${fromBatch}`] = nextTab ? nextTab.id : ''
    }
    t.batch = batch
    this.clearCls()
  }

  clearCls = () => {
    this.getDom()?.classList.remove('drag-over')
  }

  addCls = () => {
    this.getDom()?.classList.add('drag-over')
  }

  onDragEnter = () => {
    this.addCls()
  }

  onDragLeave = (e) => {
    this.clearCls()
  }

  onDragEnd = (e) => {
    this.clearCls()
    e && e.dataTransfer && e.dataTransfer.clearData()
  }

  onDelKeyPressed = () => {
    this.setState({
      delKeyPressed: true
    })
    this.backspaceKeyPressedTimer = setTimeout(() => {
      this.setState({
        delKeyPressed: false
      })
    }, 5000)
  }

  handleChangeDelMode = (backspaceMode) => {
    this.setState({
      backspaceMode
    })
  }

  handleDismissDelKeyTip = () => {
    window.store.dismissDelKeyTip()
  }

  setCwd = (cwd, terminalId = this.props.tab.id) => {
    // 2026-07-06 coder(lq): Path-follow is scoped to the active terminal so background terminal tabs cannot move the active file tab.
    this.setState(prev => {
      const terminalCwds = {
        ...prev.terminalCwds,
        [terminalId]: cwd
      }
      if (terminalId !== this.getActiveTerminalSessionId()) {
        return { terminalCwds }
      }
      return {
        terminalCwds,
        cwd
      }
    })
  }

  syncCwdFromTerminalSession = (terminalId = this.getActiveTerminalSessionId()) => {
    const cwd = this.state.terminalCwds[terminalId]
    if (!this.isPathFollowActive() || !cwd || cwd === this.state.cwd) {
      return
    }
    // 2026-07-06 coder(lq): Switching terminal tabs should move the active file tab to that terminal's last known directory.
    this.setState({
      cwd
    })
  }

  getTerminalSyncOptions = () => {
    return this.getTerminalSessions().map(session => ({
      id: session.id,
      title: session.title
    }))
  }

  getTerminalCwdForManualSync = async (terminalId) => {
    const term = refs.get('term-' + terminalId)
    const cwd = await term?.refreshLocalCwd?.()
    return cwd || this.state.terminalCwds[terminalId] || ''
  }

  refreshActiveTerminalCwd = (terminalId = this.getActiveTerminalSessionId(), delays = [0]) => {
    delays.forEach(delay => {
      setTimeout(() => {
        const term = refs.get('term-' + terminalId)
        if (!term) {
          return
        }
        if (term.refreshLocalCwd) {
          term.refreshLocalCwd()
          return
        }
        if (term.getCwd) {
          term.getCwd()
        }
      }, delay)
    })
  }

  isSplitPathFollowActive = () => {
    return this.props.tab.sshSftpSplitView && this.canSplitView()
  }

  isPathFollowActive = () => {
    if (this.isLocalFileTab()) {
      // 2026-07-11 coder(lq): Standalone local file tabs sync manually, while split view follows the selected terminal automatically.
      return this.isSplitPathFollowActive()
    }
    return this.state.sftpPathFollowSsh || this.isSplitPathFollowActive()
  }

  toggleCheckSftpPathFollowSsh = () => {
    this.setState(prevState => ({
      sftpPathFollowSsh: !prevState.sftpPathFollowSsh
    }), () => {
      this.syncCwdFromTerminalSession()
    })
  }

  editTab = (up) => {
    const {
      tab,
      editTab
    } = this.props
    editTab(
      tab.id,
      up
    )
  }

  onChangePane = pane => {
    const update = {
      pane
    }
    if (pane === paneMap.fileManager) {
      this.setState({
        enableSftp: true,
        activeFileSessionId: this.props.tab.id
      })
    }
    this.editTab(update)
    if (pane === paneMap.terminal && this.isChildTerminalTab()) {
      this.setState({
        activeTerminalSessionId: this.props.tab.id
      }, () => {
        setActiveTerminalId(this.props.tab.id, this.props.tab.id)
        refs.get('term-' + this.props.tab.id)?.term?.focus()
        refs.get('term-' + this.props.tab.id)?.onResize()
      })
    }
  }

  computePosition = (index) => {
    return {
      left: 0,
      top: 0
    }
  }

  getWidth = () => {
    return this.props.width - (this.isSessionAsideVisible() ? this.getSessionAsideWidth() : 0)
  }

  getSessionAsideWidth = () => {
    return this.sessionAsideDragWidth || this.state.sessionAsideWidth
  }

  shouldShowSessionAside = () => {
    if (this.isNotTerminalType()) {
      return false
    }
    return this.props.width >= 980
  }

  isSessionAsideVisible = () => {
    return this.shouldShowSessionAside() && !this.state.sessionAsideCollapsed
  }

  isChildTerminalTab = () => {
    const { tab } = this.props
    return (
      !!tab.host && (!tab.type || tab.type === connectionMap.ssh)
    ) || (
      !tab.host && (!tab.type || tab.type === connectionMap.local)
    )
  }

  isLocalFileTab = () => {
    const { tab } = this.props
    return !tab.host && (!tab.type || tab.type === connectionMap.local)
  }

  isSshFileTab = () => {
    const { tab } = this.props
    return !!tab.host && (!tab.type || tab.type === connectionMap.ssh)
  }

  getActiveTerminalSessionId = () => {
    if (!this.isChildTerminalTab()) {
      return this.props.tab.id
    }
    const activeId = this.state.activeTerminalSessionId
    if (activeId === this.props.tab.id) {
      return this.props.tab.id
    }
    const activeSession = this.getExtraTerminalSessions().find(session => session.id === activeId)
    return activeSession?.id || this.props.tab.id
  }

  getBaseTerminalSession = () => {
    return {
      id: this.props.tab.id,
      title: '终端',
      base: true
    }
  }

  getExtraTerminalSessions = () => {
    return this.state.terminalSessions.filter(session => !session.base && session.id !== this.props.tab.id)
  }

  getTerminalSessions = () => {
    if (!this.isChildTerminalTab()) {
      return [this.getBaseTerminalSession()]
    }
    return [
      this.getBaseTerminalSession(),
      ...this.getExtraTerminalSessions()
    ]
  }

  handleSwitchTerminalSession = (id) => {
    this.editTab({
      pane: paneMap.terminal
    })
    this.setState({
      activeTerminalSessionId: id,
      serverMetrics: getEmptyServerMetrics()
    }, () => {
      setActiveTerminalId(this.props.tab.id, id)
      this.syncCwdFromTerminalSession(id)
      this.refreshActiveTerminalCwd(id, [0, 700])
      refs.get('term-' + id)?.term?.focus()
      refs.get('term-' + id)?.onResize()
    })
  }

  handleAddTerminalSession = () => {
    const extraSessions = this.getExtraTerminalSessions()
    const index = extraSessions.reduce((max, session) => {
      const num = Number(String(session.title || '').replace('终端 ', ''))
      return Number.isFinite(num) && num > max ? num : max
    }, 0) + 1
    const id = `${this.props.tab.id}-terminal-${uid()}`
    // 2026-07-05 coder(lq): 新增当前会话终端时先切回终端页，避免用户在文件管理器页点击后看不到任何变化。
    this.editTab({
      pane: paneMap.terminal
    })
    this.setState(prev => ({
      terminalSessions: [
        ...prev.terminalSessions.filter(session => !session.base && session.id !== this.props.tab.id),
        {
          id,
          title: `终端 ${index}`
        }
      ],
      activeTerminalSessionId: id,
      serverMetrics: getEmptyServerMetrics()
    }), () => {
      setActiveTerminalId(this.props.tab.id, id)
      window.store.triggerResize()
    })
  }

  handleCloseTerminalSession = (event, id) => {
    event.stopPropagation()
    const extraSessions = this.getExtraTerminalSessions()
    const targetSession = extraSessions.find(session => session.id === id)
    if (!targetSession) {
      return
    }
    const index = extraSessions.findIndex(session => session.id === id)
    const nextSessions = extraSessions.filter(session => session.id !== id)
    const nextActiveId = id === this.getActiveTerminalSessionId()
      ? nextSessions[Math.max(0, index - 1)]?.id || this.props.tab.id
      : this.getActiveTerminalSessionId()
    this.setState({
      terminalSessions: nextSessions,
      activeTerminalSessionId: nextActiveId,
      serverMetrics: getEmptyServerMetrics()
    }, () => {
      setActiveTerminalId(this.props.tab.id, nextActiveId)
      this.syncCwdFromTerminalSession(nextActiveId)
      this.refreshActiveTerminalCwd(nextActiveId, [0, 700])
      window.store.triggerResize()
      refs.get('term-' + nextActiveId)?.term?.focus()
    })
  }

  handleTerminalSessionDragStart = (event, id) => {
    const dragSession = this.getExtraTerminalSessions().find(session => session.id === id)
    if (!dragSession) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    this.setState({
      draggingTerminalSessionId: id
    })
  }

  handleTerminalSessionDragOver = (event, id) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
    if (
      this.state.dragOverTerminalSessionId !== id ||
      this.state.dragOverTerminalSessionPosition !== position
    ) {
      this.setState({
        dragOverTerminalSessionId: id,
        dragOverTerminalSessionPosition: position
      })
    }
  }

  handleTerminalSessionDrop = (event, targetId) => {
    event.preventDefault()
    const dragId = event.dataTransfer.getData('text/plain') || this.state.draggingTerminalSessionId
    if (!dragId || dragId === targetId) {
      this.handleTerminalSessionDragEnd()
      return
    }
    const { dragOverTerminalSessionPosition } = this.state
    const terminalSessions = this.getExtraTerminalSessions()
    const dragIndex = terminalSessions.findIndex(session => session.id === dragId)
    const targetIndex = terminalSessions.findIndex(session => session.id === targetId)
    const dragSession = terminalSessions[dragIndex]
    if (dragIndex < 0 || targetIndex < 0 || !dragSession) {
      this.handleTerminalSessionDragEnd()
      return
    }
    const nextSessions = [...terminalSessions]
    const [movedSession] = nextSessions.splice(dragIndex, 1)
    let insertIndex = targetIndex + (dragOverTerminalSessionPosition === 'after' ? 1 : 0)
    if (dragIndex < insertIndex) {
      insertIndex = insertIndex - 1
    }
    nextSessions.splice(insertIndex, 0, movedSession)
    this.setState({
      terminalSessions: nextSessions
    }, this.handleTerminalSessionDragEnd)
  }

  handleTerminalSessionDragEnd = () => {
    this.setState({
      draggingTerminalSessionId: '',
      dragOverTerminalSessionId: '',
      dragOverTerminalSessionPosition: ''
    })
  }

  buildTerminalSessionTab = (session) => {
    if (session.base) {
      return this.props.tab
    }
    return {
      ...copy(this.props.tab),
      id: session.id,
      sessionRootId: this.props.tab.id,
      title: session.title,
      tabCount: session.title.replace('终端 ', `${this.props.tab.tabCount}.`),
      pane: paneMap.terminal
    }
  }

  renderTerminalSessionTabs = () => {
    if (!this.isChildTerminalTab()) {
      return null
    }
    const { pane } = this.props.tab
    const activeId = this.getActiveTerminalSessionId()
    const activeFileId = this.getActiveFileSessionId()
    const {
      draggingTerminalSessionId,
      dragOverTerminalSessionId,
      dragOverTerminalSessionPosition,
      draggingFileSessionId,
      dragOverFileSessionId,
      dragOverFileSessionPosition
    } = this.state
    const fileSessions = this.isLocalFileTab() ? this.getExtraFileSessions() : []
    return (
      <div className='cn-terminal-session-tabs'>
        <button
          className={classnames('fixed', {
            active: pane === paneMap.terminal && activeId === this.props.tab.id
          })}
          onClick={() => this.handleSwitchTerminalSession(this.props.tab.id)}
        >
          终端
        </button>
        {
          this.isLocalFileTab() || this.isSshFileTab()
            ? (
              <button
                className={classnames('fixed', 'file-tab', {
                  active: pane === paneMap.fileManager && activeFileId === this.props.tab.id
                })}
                onClick={() => this.handleSwitchFileSession(this.props.tab.id)}
              >
                {this.isSshFileTab() ? 'SFTP 文件' : '本地文件'}
              </button>
              )
            : null
        }
        {
          this.getExtraTerminalSessions().map(session => (
            <button
              key={session.id}
              className={classnames({
                active: pane === paneMap.terminal && session.id === activeId,
                dragging: session.id === draggingTerminalSessionId,
                'drag-over-before': session.id === dragOverTerminalSessionId && dragOverTerminalSessionPosition === 'before',
                'drag-over-after': session.id === dragOverTerminalSessionId && dragOverTerminalSessionPosition === 'after'
              })}
              draggable
              onDragStart={(event) => this.handleTerminalSessionDragStart(event, session.id)}
              onDragOver={(event) => this.handleTerminalSessionDragOver(event, session.id)}
              onDrop={(event) => this.handleTerminalSessionDrop(event, session.id)}
              onDragEnd={this.handleTerminalSessionDragEnd}
              onClick={() => this.handleSwitchTerminalSession(session.id)}
            >
              {session.title}
              <CloseOutlined
                className='cn-terminal-session-close'
                onClick={(event) => this.handleCloseTerminalSession(event, session.id)}
              />
            </button>
          ))
        }
        {
          fileSessions.map(session => (
            <button
              key={session.id}
              className={classnames('file-tab', {
                active: pane === paneMap.fileManager && session.id === activeFileId,
                dragging: session.id === draggingFileSessionId,
                'drag-over-before': session.id === dragOverFileSessionId && dragOverFileSessionPosition === 'before',
                'drag-over-after': session.id === dragOverFileSessionId && dragOverFileSessionPosition === 'after'
              })}
              draggable
              onDragStart={(event) => this.handleFileSessionDragStart(event, session.id)}
              onDragOver={(event) => this.handleFileSessionDragOver(event, session.id)}
              onDrop={(event) => this.handleFileSessionDrop(event, session.id)}
              onDragEnd={this.handleFileSessionDragEnd}
              onClick={() => this.handleSwitchFileSession(session.id)}
            >
              {session.title}
              <CloseOutlined
                className='cn-terminal-session-close'
                onClick={(event) => this.handleCloseFileSession(event, session.id)}
              />
            </button>
          ))
        }
        {
          /*
           * 2026-07-06 coder(lq): Keep all user-created terminal/file tabs before the add actions; the add buttons stay grouped at the end.
           */
        }
        <button
          className='add'
          onClick={this.handleAddTerminalSession}
        >
          <PlusOutlined />
          <span>新终端</span>
        </button>
        {
          this.isLocalFileTab()
            ? (
              <button
                className='add'
                onClick={this.handleAddFileSession}
              >
                <PlusOutlined />
                <span>新文件</span>
              </button>
              )
            : null
        }
      </div>
    )
  }

  getBaseFileSession = () => {
    return {
      id: this.props.tab.id,
      title: '本地文件',
      base: true
    }
  }

  getExtraFileSessions = () => {
    return this.state.fileSessions.filter(session => !session.base && session.id !== this.props.tab.id)
  }

  getFileSessions = () => {
    if (!this.isLocalFileTab()) {
      return [this.getBaseFileSession()]
    }
    return [
      this.getBaseFileSession(),
      ...this.getExtraFileSessions()
    ]
  }

  getActiveFileSessionId = () => {
    if (!this.isLocalFileTab()) {
      return this.props.tab.id
    }
    const activeId = this.state.activeFileSessionId
    if (activeId === this.props.tab.id) {
      return this.props.tab.id
    }
    const activeSession = this.getExtraFileSessions().find(session => session.id === activeId)
    return activeSession?.id || this.props.tab.id
  }

  handleSwitchFileSession = (id) => {
    this.editTab({
      pane: paneMap.fileManager
    })
    this.setState({
      enableSftp: true,
      activeFileSessionId: id
    }, () => {
      window.store.triggerResize()
    })
  }

  handleAddFileSession = () => {
    const extraSessions = this.getExtraFileSessions()
    const index = extraSessions.reduce((max, session) => {
      const num = Number(String(session.title || '').replace('本地文件 ', ''))
      return Number.isFinite(num) && num > max ? num : max
    }, 0) + 1
    const id = `${this.props.tab.id}-file-${uid()}`
    this.editTab({
      pane: paneMap.fileManager
    })
    this.setState(prev => ({
      enableSftp: true,
      fileSessions: [
        ...prev.fileSessions.filter(session => !session.base && session.id !== this.props.tab.id),
        {
          id,
          title: `本地文件 ${index}`
        }
      ],
      activeFileSessionId: id
    }), () => {
      window.store.triggerResize()
    })
  }

  handleCloseFileSession = (event, id) => {
    event.stopPropagation()
    const extraSessions = this.getExtraFileSessions()
    const targetSession = extraSessions.find(session => session.id === id)
    if (!targetSession) {
      return
    }
    const index = extraSessions.findIndex(session => session.id === id)
    const nextSessions = extraSessions.filter(session => session.id !== id)
    const nextActiveId = id === this.getActiveFileSessionId()
      ? nextSessions[Math.max(0, index - 1)]?.id || this.props.tab.id
      : this.getActiveFileSessionId()
    this.setState({
      fileSessions: nextSessions,
      activeFileSessionId: nextActiveId
    }, () => {
      window.store.triggerResize()
    })
  }

  handleFileSessionDragStart = (event, id) => {
    const dragSession = this.getExtraFileSessions().find(session => session.id === id)
    if (!dragSession) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    this.setState({
      draggingFileSessionId: id
    })
  }

  handleFileSessionDragOver = (event, id) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
    if (
      this.state.dragOverFileSessionId !== id ||
      this.state.dragOverFileSessionPosition !== position
    ) {
      this.setState({
        dragOverFileSessionId: id,
        dragOverFileSessionPosition: position
      })
    }
  }

  handleFileSessionDrop = (event, targetId) => {
    event.preventDefault()
    const dragId = event.dataTransfer.getData('text/plain') || this.state.draggingFileSessionId
    if (!dragId || dragId === targetId) {
      this.handleFileSessionDragEnd()
      return
    }
    const { dragOverFileSessionPosition } = this.state
    const fileSessions = this.getExtraFileSessions()
    const dragIndex = fileSessions.findIndex(session => session.id === dragId)
    const targetIndex = fileSessions.findIndex(session => session.id === targetId)
    const dragSession = fileSessions[dragIndex]
    if (dragIndex < 0 || targetIndex < 0 || !dragSession) {
      this.handleFileSessionDragEnd()
      return
    }
    const nextSessions = [...fileSessions]
    const [movedSession] = nextSessions.splice(dragIndex, 1)
    let insertIndex = targetIndex + (dragOverFileSessionPosition === 'after' ? 1 : 0)
    if (dragIndex < insertIndex) {
      insertIndex = insertIndex - 1
    }
    nextSessions.splice(insertIndex, 0, movedSession)
    this.setState({
      fileSessions: nextSessions
    }, this.handleFileSessionDragEnd)
  }

  handleFileSessionDragEnd = () => {
    this.setState({
      draggingFileSessionId: '',
      dragOverFileSessionId: '',
      dragOverFileSessionPosition: ''
    })
  }

  buildFileSessionTab = (session) => {
    if (session.base) {
      return this.props.tab
    }
    return {
      ...copy(this.props.tab),
      id: session.id,
      title: session.title,
      pane: paneMap.fileManager
    }
  }

  renderFileSessionTabs = () => {
    return null
  }

  renderTerminals = () => {
    const {
      sessionOptions,
      broadcastInput
    } = this.state
    const {
      tab
    } = this.props
    const {
      pane, type, sshSftpSplitView
    } = tab
    if (type === terminalWebType) {
      const webProps = {
        tab,
        width: this.props.width,
        height: this.props.height,
        reloadTab: this.props.reloadTab
      }
      return (
        <WebSession
          {...webProps}
        />
      )
    }
    if (type === terminalRdpType || type === terminalVncType || type === terminalSpiceType) {
      const rdpProps = {
        tab: this.props.tab,
        ...pick(this.props, [
          'resolutions',
          'height',
          'width',
          'tabsHeight',
          'leftSidebarWidth',
          'pinned',
          'openedSideBar',
          'delTab',
          'config',
          'reloadTab',
          'editTab',
          'fullscreen'
        ]),
        ...pick(
          this,
          [
            'fullscreenIcon'
          ])
      }
      if (type === terminalVncType) {
        return (
          <VncSession
            {...rdpProps}
          />
        )
      }
      if (type === terminalSpiceType) {
        return (
          <SpiceSession
            {...rdpProps}
          />
        )
      }

      return (
        <RdpSession
          {...rdpProps}
        />
      )
    }

    if (type === terminalFtpType) {
      const ftpProps = {
        ...this.props,
        ...pick(this, [
          'onChangePane',
          'setCwd'
        ]),
        isFtp: true
      }
      return (
        <Sftp
          {...ftpProps}
        />
      )
    }

    const cls = pane === paneMap.terminal ||
      (sshSftpSplitView && this.canSplitView())
      ? 'terms-box'
      : 'terms-box hide'
    const {
      width,
      height
    } = this.calcTermWidthHeight()
    const themeConfig = copy(window.store.getThemeConfig())
    const terminalSessions = this.getTerminalSessions()
    const activeTerminalSessionId = this.getActiveTerminalSessionId()
    const outerSessionActive = this.props.activeTabId === this.props.tab.id
    const hasTerminalSessions = terminalSessions.length > 0
    const pathFollowActive = this.isPathFollowActive()
    const pops = {
      ...this.props,
      sftpPathFollowSsh: pathFollowActive,
      themeConfig,
      broadcastInput,
      pane,
      ...pick(
        this,
        [
          'onChangePane',
          'setCwd',
          'onDelKeyPressed'
        ]),
      ...this.computePosition(),
      width,
      height
    }
    return (
      <div
        className={cls}
        style={{
          width,
          height,
          // 2026-07-13 coder(lq): Xterm stays transparent for background images, so expose its own solid theme color on the session container.
          '--terminal-background': themeConfig.background || 'var(--main)'
        }}
      >
        <div className='cn-terminal-session-body'>
          {
            hasTerminalSessions
              ? terminalSessions.map(session => {
                const sessionTab = this.buildTerminalSessionTab(session)
                const logName = sanitizeFilename(`${sessionTab.title ? sessionTab.title + '_' : ''}${sessionTab.host ? sessionTab.host + '_' : ''}${sessionTab.id}`)
                return (
                  <div
                    key={session.id}
                    className={classnames('cn-terminal-session-pane', {
                      active: session.id === activeTerminalSessionId
                    })}
                  >
                    <Term
                      {...pops}
                      tab={sessionTab}
                      activeTabId={outerSessionActive ? activeTerminalSessionId : this.props.activeTabId}
                      currentBatchTabId={outerSessionActive ? activeTerminalSessionId : this.props.currentBatchTabId}
                      logName={logName}
                      sessionOptions={sessionOptions}
                      height={height}
                    />
                  </div>
                )
              })
              : (
                <div className='cn-terminal-empty'>
                  <div>当前终端区没有打开的终端标签</div>
                  <button onClick={this.handleAddTerminalSession}>
                    <PlusOutlined />
                    <span>新建终端标签</span>
                  </button>
                </div>
                )
          }
        </div>
      </div>
    )
  }

  isNotTerminalType = () => {
    const { type } = this.props.tab
    return type === terminalRdpType ||
      type === terminalVncType ||
      type === terminalWebType ||
      type === terminalTelnetType ||
      type === terminalFtpType ||
      type === terminalSpiceType
  }

  calcSftpWidthHeight = () => {
    const {
      height
    } = this.props
    const width = this.getWidth()
    if (!this.canSplitView() || !this.props.tab.sshSftpSplitView) {
      return {
        width,
        height
      }
    }
    const direction = this.getSplitDirection()
    const [, size2] = this.state.splitSize
    const w = direction === 'leftRight' ? size2 * width / 100 : width
    const h = direction === 'leftRight' ? height : size2 * height / 100
    return {
      width: w,
      height: h
    }
  }

  calcTermWidthHeight = () => {
    const width = this.getWidth()
    const height = this.props.computeHeight(
      this.props.height
    )
    if (!this.canSplitView() || !this.props.tab.sshSftpSplitView) {
      return {
        width,
        height
      }
    }
    const direction = this.getSplitDirection()
    const [size1] = this.state.splitSize
    const w = direction === 'leftRight' ? size1 * width / 100 : width
    const h = direction === 'leftRight' ? height : size1 * height / 100
    return {
      width: w,
      height: h
    }
  }

  renderSftp = () => {
    const {
      sessionOptions,
      enableSftp,
      cwd
    } = this.state
    const { pane, id, sshSftpSplitView } = this.props.tab
    if (
      this.isNotTerminalType() ||
      this.isSftpDisabled()
    ) {
      return null
    }
    const height = this.props.computeHeight(
      this.props.height
    )
    const cls = pane === paneMap.fileManager ||
    (sshSftpSplitView && this.canSplitView())
      ? ''
      : 'hide'
    const fileSessions = this.isLocalFileTab()
      ? this.getFileSessions()
      : [this.getBaseFileSession()]
    const activeFileSessionId = this.getActiveFileSessionId()
    const pathFollowActive = this.isPathFollowActive()
    const exts = {
      ...this.props,
      sftpPathFollowSsh: pathFollowActive,
      sshSftpSplitView,
      cwd,
      pid: id,
      enableSftp,
      sessionOptions,
      height,
      pane,
      terminalSyncOptions: this.isLocalFileTab() && !sshSftpSplitView
        ? this.getTerminalSyncOptions()
        : [],
      onSyncTerminalCwd: this.isLocalFileTab() && !sshSftpSplitView
        ? this.getTerminalCwdForManualSync
        : undefined,
      ...this.calcSftpWidthHeight()
    }
    return (
      <div
        className={classnames(cls, 'cn-file-session-body')}
        style={{
          width: exts.width,
          height: exts.height
        }}
      >
        {
          fileSessions.map(session => {
            const sessionTab = this.buildFileSessionTab(session)
            const isActive = session.id === activeFileSessionId
            const shouldFollowCurrentTerminal = pathFollowActive && isActive
            return (
              <div
                key={session.id}
                className={classnames('cn-file-session-pane', {
                  active: isActive
                })}
              >
                <Sftp
                  {...exts}
                  tab={sessionTab}
                  sftpPathFollowSsh={shouldFollowCurrentTerminal}
                  cwd={cwd}
                  autoInit={!session.base}
                  terminalId={id}
                  activeOwnerTabId={id}
                />
              </div>
            )
          })
        }
      </div>
    )
  }

  handleFullscreen = () => {
    // Make this tab the active tab before fullscreening
    window.store.activeTabId = this.props.tab.id
    window.store.toggleSessFullscreen(true, this.props.tab.id)
  }

  toggleBroadcastInput = () => {
    this.setState({
      broadcastInput: !this.state.broadcastInput
    })
  }

  toggleKeepalive = () => {
    const term = refs.get('term-' + this.getActiveTerminalSessionId())
    if (!term) {
      return
    }
    const enabled = term.toggleKeepalive()
    this.setState({ keepaliveEnabled: enabled })
  }

  handleToggleSessionAside = () => {
    // 2026-07-05 coder(lq): Put session detail visibility in the top toolbar so the terminal canvas stays clean.
    this.setState({
      sessionAsideCollapsed: !this.state.sessionAsideCollapsed
    }, () => window.store.triggerResize())
  }

  handleSessionAsideTabChange = (sessionAsideTab) => {
    this.setState({ sessionAsideTab })
  }

  onServerMetricsUpdate = (update) => {
    this.setState(prev => ({
      serverMetrics: {
        ...prev.serverMetrics,
        ...update
      }
    }))
  }

  renderServerMonitor = (terminalId, terminalTitle) => {
    const { uptime, cpu, mem, disks } = this.state.serverMetrics
    const rootDisk = disks.find(disk => disk.mount === '/') || disks[0]
    const memoryPercent = getUsagePercent(mem.used, mem.total)
    const hasMetrics = uptime || cpu || mem.used || rootDisk
    return (
      <div className='cn-session-aside-section'>
        <div className='cn-session-aside-title'>服务器监控 · {terminalTitle}</div>
        <TerminalInfoRunner
          key={terminalId}
          pid={terminalId}
          isRemote
          setState={this.onServerMetricsUpdate}
        />
        {
          hasMetrics
            ? (
              <div className='cn-session-metrics'>
                <div><span>CPU</span><b>{cpu || '读取中'}</b></div>
                <div><span>内存</span><b>{mem.used ? `${memoryPercent}%` : '读取中'}</b></div>
                <div><span>磁盘</span><b>{rootDisk?.usedPercent || '读取中'}</b></div>
                <div className='wide'><span>运行时长</span><b>{uptime?.trim() || '读取中'}</b></div>
              </div>
              )
            : <div className='cn-session-metrics-loading'>正在读取当前终端的服务器状态...</div>
        }
      </div>
    )
  }

  handleToggleTransferPanel = () => {
    this.setState({
      showTransferPanel: !this.state.showTransferPanel
    }, () => window.store.triggerResize())
  }

  handleCloseTransferPanel = () => {
    this.setState({
      showTransferPanel: false
    }, () => window.store.triggerResize())
  }

  handleToggleBatchInput = () => {
    if (!hasFeature(this.props.config, featureIds.batchCommand)) {
      message.warning(getFeatureLockedMessage(featureIds.batchCommand))
      window.store.openSubscriptionSetting()
      return
    }
    this.setState(prev => ({
      showBatchInput: !prev.showBatchInput
    }))
  }

  handleOpenCommandAssistant = () => {
    this.setState({ showCommandAssistant: true })
  }

  handleCloseCommandAssistant = () => {
    this.setState({ showCommandAssistant: false })
  }

  handleUseAssistantCommand = (command, execute) => {
    const terminalId = this.getActiveTerminalSessionId()
    this.editTab({ pane: paneMap.terminal })
    this.setState({ showCommandAssistant: false }, () => {
      setTimeout(() => {
        refs.get('term-' + terminalId)?.runQuickCommand(command, !execute)
      }, 0)
    })
  }

  handleRunSolutionCommand = (command, execute) => {
    const terminalId = this.getActiveTerminalSessionId()
    const input = command.split('\n').map(line => line.trim()).filter(Boolean).join('; ')
    this.editTab({ pane: paneMap.terminal })
    setTimeout(() => {
      refs.get('term-' + terminalId)?.runQuickCommand(input, !execute)
    }, 0)
  }

  handleToggleAiAssistant = () => {
    this.setState(prev => ({
      showAiAssistant: !prev.showAiAssistant
    }), () => window.store.triggerResize())
    window.store.rightPanelVisible = false
  }

  handleSessionAsideResize = (width) => {
    const nextWidth = normalizeSessionAsideWidth(width)
    // 2026-07-20 coder(lq): Keep the in-progress width outside React state so monitor updates cannot reset the drag position.
    this.sessionAsideDragWidth = nextWidth
    const aside = this.sessionAsideRef.current
    if (!aside) {
      return
    }
    aside.style.width = `${nextWidth}px`
    aside.style.flexBasis = `${nextWidth}px`
  }

  handleSessionAsideResizeEnd = (width) => {
    const nextWidth = normalizeSessionAsideWidth(width)
    // 2026-07-20 coder(lq): Resize visually while dragging, then persist once on release so terminal layout recalculates without writing on every pointer move.
    this.sessionAsideDragWidth = null
    setItem(sessionAsideWidthKey, String(nextWidth))
    this.setState({
      sessionAsideWidth: nextWidth
    }, () => window.store.triggerResize())
  }

  removeSessionAsideResizeListeners = () => {
    document.removeEventListener('pointermove', this.handleSessionAsideResizeMove)
    document.removeEventListener('pointerup', this.handleSessionAsideResizePointerUp)
    this.sessionAsideRef.current?.classList.remove('is-resizing')
  }

  handleSessionAsideResizeStart = (event) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    // 2026-07-20 coder(lq): Use a dedicated pointer handle because the generic splitter is clipped inside the scrollable session aside.
    this.sessionAsideResizeStartX = event.clientX
    this.sessionAsideResizeStartWidth = this.getSessionAsideWidth()
    this.sessionAsideResizeActive = true
    this.sessionAsideRef.current?.classList.add('is-resizing')
    document.addEventListener('pointermove', this.handleSessionAsideResizeMove)
    document.addEventListener('pointerup', this.handleSessionAsideResizePointerUp)
  }

  handleSessionAsideResizeMove = (event) => {
    if (!this.sessionAsideResizeActive) {
      return
    }
    const delta = this.sessionAsideResizeStartX - event.clientX
    this.handleSessionAsideResize(this.sessionAsideResizeStartWidth + delta)
  }

  handleSessionAsideResizePointerUp = () => {
    if (!this.sessionAsideResizeActive) {
      return
    }
    this.sessionAsideResizeActive = false
    this.removeSessionAsideResizeListeners()
    this.handleSessionAsideResizeEnd(this.getSessionAsideWidth())
  }

  handleOpenSearch = () => {
    refs.get('term-' + this.getActiveTerminalSessionId())?.toggleSearch()
  }

  handleCopyActiveTerminalAll = () => {
    refs.get('term-' + this.getActiveTerminalSessionId())?.onCopyAll()
  }

  renderSearchIcon = () => {
    const title = e('search')
    return (
      <Tooltip title={title} placement='bottomLeft'>
        <SearchOutlined
          className='mg1r icon-info iblock pointer spliter'
          onClick={this.handleOpenSearch}
        />
      </Tooltip>
    )
  }

  renderCopyTerminalAllIcon = () => {
    const title = e('copyTerminalAll')
    return (
      <Tooltip title={title} placement='bottomLeft'>
        <CopyOutlined
          className='mg1r icon-info iblock pointer spliter copy-terminal-all-icon'
          onClick={this.handleCopyActiveTerminalAll}
        />
      </Tooltip>
    )
  }

  fullscreenIcon = () => {
    const title = e('fullscreen')
    return (
      <Tooltip title={title} placement='bottomLeft'>
        <FullscreenOutlined
          className='mg1r icon-info iblock pointer spliter fullscreen-control-icon'
          onClick={this.handleFullscreen}
        />
      </Tooltip>
    )
  }

  renderDelTip = (isSsh) => {
    if (!isSsh || this.props.hideDelKeyTip || !this.state.delKeyPressed) {
      return null
    }
    return (
      <div className='type-tab'>
        <span className='mg1r'>试试 <b>Shift + Backspace</b>？</span>
        <CloseOutlined
          onClick={this.handleDismissDelKeyTip}
          className='pointer'
        />
      </div>
    )
  }

  renderKeepaliveIcon = () => {
    if (this.isSshDisabled()) {
      return null
    }
    const { keepaliveEnabled } = this.state
    const title = e('keepalive')
    const iconProps = {
      className: classnames('sess-icon pointer keepalive-icon', {
        active: keepaliveEnabled
      }),
      onClick: this.toggleKeepalive
    }
    return (
      <Tooltip title={title}>
        <HeartbeatIcon {...iconProps} />
      </Tooltip>
    )
  }

  renderBroadcastIcon = () => {
    if (
      this.isSshDisabled()
    ) {
      return null
    }
    const { broadcastInput } = this.state
    const title = e('broadcastInput')
    const iconProps = {
      className: classnames('sess-icon pointer broadcast-icon', {
        active: broadcastInput
      }),
      onClick: this.toggleBroadcastInput
    }

    return (
      <Tooltip title={title}>
        <ApartmentOutlined {...iconProps} />
      </Tooltip>
    )
  }

  renderSessionAsideToggle = () => {
    if (!this.shouldShowSessionAside()) {
      return null
    }
    const { sessionAsideCollapsed } = this.state
    const title = sessionAsideCollapsed ? '显示会话信息' : '隐藏会话信息'
    const Icon = sessionAsideCollapsed ? DoubleLeftOutlined : DoubleRightOutlined
    return (
      <Tooltip title={title} placement='bottomLeft'>
        <Icon
          className='sess-icon pointer session-aside-toolbar-toggle'
          onClick={this.handleToggleSessionAside}
        />
      </Tooltip>
    )
  }

  renderTransferPanelToggle = () => {
    const {
      fileTransfers = [],
      transferHistory = []
    } = this.props
    const { showTransferPanel } = this.state
    const activeCount = fileTransfers.length
    const historyCount = transferHistory.length
    const title = showTransferPanel
      ? '隐藏传输任务'
      : `查看传输任务：进行中 ${activeCount}，历史 ${historyCount}`
    return (
      <Tooltip title={title} placement='bottomLeft'>
        <span
          className={classnames('sess-icon pointer cn-transfer-toolbar-toggle', {
            active: showTransferPanel,
            'has-transfer': activeCount > 0
          })}
          onClick={this.handleToggleTransferPanel}
        >
          <UploadOutlined />
        </span>
      </Tooltip>
    )
  }

  renderTermControls = () => {
    const { props } = this
    const { pane } = props.tab
    if (pane !== paneMap.terminal) {
      return null
    }
    return (
      <div className='fright term-controls'>
        {this.fullscreenIcon()}
        {this.renderSearchIcon()}
        {this.renderCopyTerminalAllIcon()}
      </div>
    )
  }

  renderToolbarActions = () => {
    return (
      <div className='cn-session-toolbar-actions'>
        {this.renderSftpPathFollowControl()}
        {this.renderTransferPanelToggle()}
        {this.renderSplitToggle()}
        {this.renderKeepaliveIcon()}
        {this.renderBroadcastIcon()}
        {this.renderSessionAsideToggle()}
        {this.renderTermControls()}
      </div>
    )
  }

  renderSplitToggle = () => {
    if (!this.canSplitView() || this.isNotTerminalType()) {
      return null
    }
    const title = e('sshSftpSplitView')
    const {
      sshSftpSplitView
    } = this.props.tab
    const cls = classnames(
      'pointer sess-icon split-view-toggle',
      {
        active: sshSftpSplitView
      }
    )
    return (
      <Tooltip title={title} placement='bottomLeft'>
        <span
          className={cls}
          onClick={this.handleSshSftpSplitView}
        >
          <SplitViewIcon />
        </span>
      </Tooltip>
    )
  }

  isSsh = () => {
    const { tab } = this.props
    return tab.authType
  }

  renderPaneControl = () => {
    const {
      sshSftpSplitView
    } = this.props.tab
    if (this.isDisabled()) {
      return null
    }
    const { props } = this
    const { tab } = props
    const { pane } = tab
    const termType = tab?.type
    const isSsh = this.isSshFileTab()
    const isLocal = !isSsh && (termType === connectionMap.local || !termType)
    // 2026-07-12 coder(lq): Terminal and file entries now share one session tab row, so the legacy SSH/local mode switch would duplicate the default terminal.
    if (isLocal || isSsh) {
      return null
    }
    const types = [
      paneMap.terminal,
      paneMap.fileManager
    ]
    const controls = [
      isSsh ? paneMap.ssh : paneMap.terminal
    ]
    if (isSsh || isLocal) {
      controls.push(isSsh ? paneMap.sftp : paneMap.fileManager)
    }
    const labelMapper = {
      [paneMap.terminal]: '终端',
      [paneMap.fileManager]: isSsh ? 'SFTP 文件' : '本地文件',
      [paneMap.ssh]: '终端',
      [paneMap.sftp]: 'SFTP 文件'
    }
    const activeTerminalId = this.getActiveTerminalSessionId()
    const activeFileId = this.getActiveFileSessionId()
    return (
      <div className={classnames('term-sftp-tabs fleft', {
        'split-context-tabs': sshSftpSplitView && this.canSplitView()
      })}
      >
        {
          controls.map((type, i) => {
            const targetPane = types[i]
            const isDefaultTerminalTab = targetPane === paneMap.terminal
            const isDefaultFileTab = targetPane === paneMap.fileManager
            const cls = classnames(
              'type-tab',
              type,
              {
                active: targetPane === pane &&
                  (!isDefaultTerminalTab || activeTerminalId === tab.id) &&
                  (!isDefaultFileTab || activeFileId === tab.id)
              }
            )
            return (
              <span
                className={cls}
                key={type + '_' + i}
                onClick={() => this.onChangePane(targetPane)}
              >
                <span className='type-tab-txt'>
                  <span>{labelMapper[type] || e(type)}</span>
                  <span className='type-tab-line' />
                </span>
              </span>
            )
          })
        }
      </div>
    )
  }

  renderSftpPathFollowControl = () => {
    if (this.isDisabled()) {
      return null
    }
    const {
      sftpPathFollowSsh
    } = this.state
    const { props } = this
    const { tab } = props
    const { pane, enableSsh, sshSftpSplitView } = tab
    const isSsh = tab.authType
    const splitAutoFollow = this.isSplitPathFollowActive()
    const pathFollowActive = this.isPathFollowActive()
    const autoFollow = splitAutoFollow
    const checkTxt = autoFollow
      ? '分屏模式会自动跟随当前终端目录'
      : sftpPathFollowSsh
        ? `${e('sftpPathFollowSsh')}：已开启`
        : `${e('sftpPathFollowSsh')}：未开启`
    const checkProps = {
      onClick: autoFollow ? undefined : this.toggleCheckSftpPathFollowSsh,
      className: classnames(
        'sftp-follow-ssh-icon sess-icon',
        {
          pointer: !autoFollow,
          active: pathFollowActive,
          auto: autoFollow
        }
      )
    }
    const isS = pane === paneMap.terminal ||
      sshSftpSplitView
    return (
      <>
        {
          isSsh && enableSsh
            ? (
              <Tooltip title={checkTxt}>
                <span {...checkProps}>
                  <PaperClipOutlined />
                  <span className='sftp-follow-ssh-label'>
                    {autoFollow ? '分屏自动' : pathFollowActive ? '跟随中' : '未跟随'}
                  </span>
                </span>
              </Tooltip>
              )
            : null
        }
        {
          this.renderDelTip(isS)
        }
      </>
    )
  }

  renderControl = () => {
    if (
      this.isNotTerminalType()
    ) {
      return null
    }
    return (
      <div
        className='terminal-control fix'
      >
        {this.renderPaneControl()}
        {this.renderTerminalSessionTabs()}
        {this.renderFileSessionTabs()}
        {this.renderToolbarActions()}
      </div>
    )
  }

  onSplitResize = (sizes) => {
    const direction = this.getSplitDirection()
    const {
      width,
      height
    } = this.props
    const all = direction === 'leftRight' ? width : height
    const size = sizes.map(d => d * 100 / all)
    this.setState({
      splitSize: size
    })
  }

  renderViews = () => {
    if (this.isNotTerminalType()) {
      return this.renderTerminals()
    }
    const notSplitVew = !this.canSplitView() || !this.props.tab.sshSftpSplitView
    const { pane } = this.props.tab
    const show1 = notSplitVew && pane === paneMap.terminal
    const show2 = notSplitVew && pane === paneMap.fileManager
    const direction = this.getSplitDirection()
    const layout = direction === 'leftRight' ? 'horizontal' : 'vertical'
    const [size1, size2] = this.state.splitSize
    const splitterProps = {
      orientation: layout,
      onResize: this.onSplitResize,
      onResizeEnd: this.onSplitResize,
      className: notSplitVew ? 'not-split-view' : '',
      style: {
        width: '100%',
        height: '100%'
      }
    }
    const paneProps = {
      min: '20%',
      max: '80%',
      style: {
        overflow: 'hidden'
      }
    }
    const s1 = show1
      ? '100%'
      : show2
        ? '0%'
        : size1 + '%'
    const s2 = show2
      ? '100%'
      : show1
        ? '0%'
        : size2 + '%'
    const paneProps1 = {
      ...paneProps,
      size: s1
    }
    const paneProps2 = {
      ...paneProps,
      size: s2
    }
    return (
      <div className='cn-session-workspace'>
        <div className='cn-session-main'>
          <div className='cn-session-splitter-wrap'>
            <Splitter {...splitterProps}>
              <SplitterPane {...paneProps1}>
                {this.renderTerminals()}
              </SplitterPane>
              <SplitterPane {...paneProps2}>
                {this.renderSftp()}
              </SplitterPane>
            </Splitter>
          </div>
          {this.renderTransferBottomPanel()}
        </div>
        {this.renderSessionAside()}
      </div>
    )
  }

  renderTransferBottomPanel = () => {
    if (!this.state.showTransferPanel) {
      return null
    }
    const {
      fileTransfers = [],
      transferHistory = [],
      transferTab = 'transfer'
    } = this.props
    return (
      <div className='cn-session-transfer-bottom'>
        <div className='cn-session-transfer-bottom-head'>
          <div>
            <strong>传输任务</strong>
            <span>上传、下载和历史记录直接显示在当前会话底部</span>
          </div>
          <CloseOutlined
            className='pointer'
            onClick={this.handleCloseTransferPanel}
          />
        </div>
        <TransferModal
          fileTransfers={fileTransfers}
          transferHistory={transferHistory}
          transferTab={transferTab}
          embedded
        />
      </div>
    )
  }

  renderSessionAside = () => {
    if (!this.shouldShowSessionAside()) {
      return null
    }
    const { sessionAsideCollapsed, sessionAsideTab } = this.state
    const { tab } = this.props
    const isSsh = !!tab.host && (!tab.type || tab.type === connectionMap.ssh)
    const title = createName(tab)
    const host = tab.host
      ? `${tab.username ? tab.username + '@' : ''}${tab.host}${tab.port ? ':' + tab.port : ''}`
      : '本机'
    const type = isSsh ? 'SSH' : '本地终端'
    const activeTerminalId = this.getActiveTerminalSessionId()
    const activeTerminalTitle = this.getTerminalSessions()
      .find(session => session.id === activeTerminalId)?.title || '终端'
    const batchInput = (cmd, selectedTabIds) => {
      selectedTabIds.map(id => {
        const termId = id === tab.id ? this.getActiveTerminalSessionId() : id
        return refs.get('term-' + termId)
      }).forEach(term => {
        term?.batchInput(cmd)
      })
    }
    const handleOpenInfoPanel = () => window.store.openInfoPanel()
    const aiReady = !window.store.aiConfigMissing()
    const aiModel = window.store.config.modelAI || '未设置模型'
    const aiChatProps = {
      embedded: true,
      aiChatHistory: window.store.aiChatHistory,
      config: window.store.config,
      selectedTabIds: window.store.batchInputSelectedTabIds,
      tabs: window.store.getTabs(),
      activeTabId: window.store.activeTabId,
      sessionRootId: tab.id,
      terminalSessionId: activeTerminalId,
      showAIConfig: window.store.showAIConfig,
      rightPanelTab: 'ai',
      agentRunning: window.store.agentRunning
    }
    const sessionAsideWidth = this.getSessionAsideWidth()
    if (sessionAsideCollapsed) {
      return null
    }
    return (
      <aside
        className='cn-session-aside'
        ref={this.sessionAsideRef}
        style={{
          width: `${sessionAsideWidth}px`,
          flexBasis: `${sessionAsideWidth}px`
        }}
      >
        <div
          className='cn-session-aside-resize-handle'
          role='separator'
          aria-label='调整会话侧栏宽度'
          aria-orientation='vertical'
          title='拖动调整侧栏宽度'
          onPointerDown={this.handleSessionAsideResizeStart}
        />
        <button
          className='cn-session-aside-toggle'
          title='隐藏会话信息'
          onClick={this.handleToggleSessionAside}
        >
          <DoubleRightOutlined />
        </button>
        <div className='cn-session-aside-tabs'>
          <button
            className={classnames({ active: sessionAsideTab === 'session' })}
            onClick={() => this.handleSessionAsideTabChange('session')}
          >
            <CloudServerOutlined />
            <span>会话</span>
          </button>
          <button
            className={classnames({ active: sessionAsideTab === 'ai' })}
            onClick={() => this.handleSessionAsideTabChange('ai')}
          >
            <RobotOutlined />
            <span>AI</span>
          </button>
          <button
            className={classnames({ active: sessionAsideTab === 'records' })}
            onClick={() => this.handleSessionAsideTabChange('records')}
          >
            <BookOutlined />
            <span>处理记录</span>
          </button>
        </div>
        <div className='cn-session-aside-body'>
          {
            sessionAsideTab === 'ai'
              ? (
                <div className='cn-session-aside-panel cn-session-aside-panel-ai'>
                  <section className='cn-session-ai-section is-open'>
                    <div className='cn-session-ai-head'>
                      <RobotOutlined />
                      <div>
                        <strong>AI 助手</strong>
                        <span>{title} · {activeTerminalTitle}</span>
                      </div>
                      <b className={aiReady ? 'ready' : 'missing'}>{aiReady ? '已配置' : '未配置'}</b>
                    </div>
                    <p className='cn-session-ai-description'>{aiReady ? `当前模型：${aiModel}` : '需要先配置模型和密钥'}</p>
                    <div className='cn-session-ai-chat'>
                      <AIChat {...aiChatProps} />
                    </div>
                  </section>
                </div>
                )
              : sessionAsideTab === 'records'
                ? (
                  <div className='cn-session-aside-panel cn-session-aside-panel-records'>
                    <SolutionRecords
                      tab={tab}
                      serverName={title}
                      host={host}
                      onRunCommand={this.handleRunSolutionCommand}
                    />
                  </div>
                  )
                : (
                  <div className='cn-session-aside-panel'>
                    <div className='cn-session-aside-head'>
                      <CloudServerOutlined />
                      <div>
                        <strong>{title}</strong>
                        <span>{host}</span>
                      </div>
                    </div>

                    {isSsh ? this.renderServerMonitor(activeTerminalId, activeTerminalTitle) : null}

                    <div className='cn-session-aside-section'>
                      <div className='cn-session-aside-title'>会话信息</div>
                      <div className='cn-session-info-row'><span>类型</span><b>{type}</b></div>
                      <div className='cn-session-info-row'><span>状态</span><b>{tab.status === 'success' ? '已连接' : '连接中'}</b></div>
                      <div className='cn-session-info-row'><span>标签</span><b>#{tab.tabCount}</b></div>
                    </div>

                    <div className='cn-session-aside-section'>
                      <div className='cn-session-aside-title'>会话工具</div>
                      <button className='cn-session-tool-row' onClick={this.handleOpenCommandAssistant}>
                        <SearchOutlined />
                        <span>
                          <b>命令助手</b>
                          <em>用中文查找常用运维命令</em>
                        </span>
                      </button>
                      <button
                        className={classnames('cn-session-tool-row', {
                          'is-active': this.state.showBatchInput
                        })}
                        onClick={this.handleToggleBatchInput}
                      >
                        <ThunderboltOutlined />
                        <span>
                          <b>批量命令</b>
                          <em>向选中的终端同时发送命令</em>
                        </span>
                        {this.state.showBatchInput ? <UpOutlined /> : <DownOutlined />}
                      </button>
                      {
                        this.state.showBatchInput
                          ? (
                            <div className='cn-session-batch-input'>
                              <BatchInput
                                input={batchInput}
                                tabs={window.store.tabs}
                                batchInputs={window.store.batchInputs}
                                batchInputSelectedTabIds={window.store.batchInputSelectedTabIds}
                                activeTabId={window.store.activeTabId}
                                placeholder='粘贴或输入多行命令'
                                multiline
                              />
                            </div>
                            )
                          : null
                      }
                      <button className='cn-session-tool-row' onClick={handleOpenInfoPanel}>
                        <FontColorsOutlined />
                        <span>
                          <b>编码与终端信息</b>
                          <em>查看字符集、换行和终端参数</em>
                        </span>
                      </button>
                    </div>
                  </div>
                  )
          }
        </div>
      </aside>
    )
  }

  render () {
    const { pane } = this.props.tab
    const activeTerminalId = this.getActiveTerminalSessionId()
    const activeTerminal = this.getTerminalSessions().find(session => session.id === activeTerminalId)
    const cls = classnames(
      'term-sftp-box',
      pane,
      {
        'is-transporting': this.props.tab.isTransporting
      },
      {
        'disable-ssh': this.props.tab.enableSsh === false
      }
    )
    const divProps = {
      className: cls,
      onDragEnter: this.onDragEnter,
      onDragLeave: this.onDragLeave,
      onDrop: this.onDrop,
      onDragEnd: this.onDragEnd,
      onClick: this.handleClick
    }
    return (
      <div
        ref={this.domRef}
        {...divProps}
      >
        {this.renderControl()}
        {this.renderViews()}
        {this.state.showCommandAssistant
          ? (
            <CommandAssistant
              open
              onClose={this.handleCloseCommandAssistant}
              onUseCommand={this.handleUseAssistantCommand}
              defaultSystem={this.isLocalFileTab() && isMac ? 'mac' : 'linux'}
              terminalName={activeTerminal?.title || '当前终端'}
              terminalId={activeTerminalId}
              advancedEnabled={hasFeature(this.props.config, featureIds.advancedCommandAssistant)}
            />
            )
          : null}
      </div>
    )
  }
}
