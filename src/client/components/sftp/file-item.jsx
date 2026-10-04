/**
 * file section
 */

import React from 'react'
import ExtIcon from './file-icon'
import {
  FolderOutlined,
  FileOutlined,
  ArrowRightOutlined
} from '@ant-design/icons'
import classnames from 'classnames'
import copy from 'json-deep-copy'
import { pick, some } from 'lodash-es'
import Input from '../common/input-auto-focus'
import resolve from '../../common/resolve'
import normalizeRemotePath from '../../common/normalize-remote-path'
import { addClass, removeClass } from '../../common/class'
import {
  mode2permission,
  permission2mode
} from '../../common/mode2permission'
import wait from '../../common/wait'
import {
  fileOperationsMap,
  isWin, transferTypeMap, typeMap,
  paneMap,
  isMac, maxEditFileSize, ctrlOrCmd
} from '../../common/constants'
import sorter from '../../common/index-sorter'
import { getFolderFromFilePath, getLocalFileInfo } from './file-read'
import { readClipboard, copy as copyToClipboard, hasFileInClipboardText } from '../../common/clipboard'
import { getDropFileList } from '../../common/file-drop-utils'
import time from '../../common/time'
import { filesize } from 'filesize'
import { resolveTerminalId } from '../../common/active-terminal'
import { createTransferProps } from './transfer-common'
import generate from '../../common/uid'
import sanitizeFilename from '../../common/sanitize-filename'
import { refsStatic, refs, filesRef } from '../common/ref'
import iconsMap from '../sys-menu/icons-map'
import Modal from '../common/modal'
import { notification } from '../common/notification'
import { partitionClipboardTransfers } from '../file-transfer/transfer-routing'
import { getArchiveExtractName, isArchiveFile } from './archive-utils'
import { resolveDropDestination } from './drop-target'
import { resolveSftpClipboardTransfer } from '../../common/sftp-clipboard'
import { isClearableLogFile } from './log-file-utils'
import { getCachedFolderSize, loadFolderSize } from './folder-size'

const e = window.translate

const fileItemCls = 'sftp-item'
const onDragCls = 'sftp-ondrag'
const onDragOverCls = 'sftp-dragover'
const onMultiDragCls = 'sftp-dragover-multi'
// 2026-08-31 coder(lq): Normalize drag paths so dropping onto the source cannot enqueue a self-move.
const normalizeDropPath = path => {
  let value = String(path || '').replace(/\\/g, '/')
  const isWindowsRoot = /^[a-zA-Z]:\/$/.test(value)
  if (value.length > 1 && value !== '/' && !isWindowsRoot) {
    value = value.replace(/\/+$/, '')
  }
  return isWin ? value.toLowerCase() : value
}

const isSameOrChildPath = (parent, candidate) => {
  const normalizedParent = normalizeDropPath(parent)
  const normalizedCandidate = normalizeDropPath(candidate)
  if (!normalizedParent || !normalizedCandidate) {
    return false
  }
  if (normalizedParent === '/' || /^[a-zA-Z]:\/$/.test(normalizedParent)) {
    return normalizedCandidate.startsWith(normalizedParent)
  }
  return normalizedCandidate === normalizedParent ||
    normalizedCandidate.startsWith(normalizedParent + '/')
}

// 2026-09-02 coder(lq): Keep all no-op checks in one place so internal and OS file drops behave consistently.
const isNoOpDrop = (file, destination) => {
  const source = resolve(file.path, file.name)
  const sourceParent = normalizeDropPath(file.path)
  const target = normalizeDropPath(destination)
  return target === sourceParent ||
    (file.isDirectory && isSameOrChildPath(source, destination))
}

export default class FileSection extends React.Component {
  constructor (props) {
    super(props)
    const cachedFolderSize = getCachedFolderSize(props)
    this.state = {
      file: props.file,
      overwriteStrategy: '',
      dropdownOpen: false,
      folderSizeStatus: props.file.folderSizeStatus || (cachedFolderSize ? 'done' : 'idle'),
      folderSizeValue: props.file.folderSizeValue || cachedFolderSize?.value || '',
      folderSizeCount: props.file.folderSizeCount || cachedFolderSize?.count || 0
    }
    // Create ref
    this.domRef = React.createRef()
    this.id = 'file-' + this.props.file.id
  }

  componentDidMount () {
    filesRef.add(this.id, this)
    this.applyStyle()
  }

  componentDidUpdate (prevProps, prevState) {
    if (
      !prevState.file.id &&
      this.state.file.id
    ) {
      this.applyStyle()
    }
    const nextFolderSizeStatus = this.props.file.folderSizeStatus || 'idle'
    const nextFolderSizeValue = this.props.file.folderSizeValue || ''
    const nextFolderSizeCount = this.props.file.folderSizeCount || 0
    // 2026-10-01 coder(lq): Compare against rendered state because directory scans intentionally update the shared listing object before publishing a new row; comparing old/new props misses both normal results and late-resolved directory symlinks.
    if (
      this.state.folderSizeStatus !== nextFolderSizeStatus ||
      this.state.folderSizeValue !== nextFolderSizeValue ||
      this.state.folderSizeCount !== nextFolderSizeCount
    ) {
      this.setState({
        folderSizeStatus: nextFolderSizeStatus,
        folderSizeValue: nextFolderSizeValue,
        folderSizeCount: nextFolderSizeCount
      })
    }
  }

  componentWillUnmount () {
    this.unmounted = true
    filesRef.remove(this.id)
    clearTimeout(this.timer)
    this.timer = null
    this.domRef = null
    this.dropTarget = null
    this.removeFileEditEvent()
  }

  clearRef = () => {
    refs.remove(this.id)
  }

  handleCalculateFolderSize = async event => {
    event?.preventDefault()
    event?.stopPropagation()
    return this.calculateFolderSize(true)
  }

  // 2026-10-01 coder(lq): Automatic scans are scheduled by the directory view; this method remains the explicit refresh path for one folder.
  calculateFolderSize = async force => {
    if (
      this.state.folderSizeStatus === 'loading' ||
      (!force && this.state.folderSizeStatus !== 'idle')
    ) {
      return
    }
    this.setState({ folderSizeStatus: 'loading' })
    try {
      const formatted = await loadFolderSize({
        ...this.props,
        file: this.state.file
      }, force)
      if (!this.unmounted) {
        this.setState({
          folderSizeStatus: 'done',
          folderSizeValue: formatted.value,
          folderSizeCount: formatted.count
        })
      }
    } catch (error) {
      if (!this.unmounted) {
        this.setState({ folderSizeStatus: 'error' })
      }
      notification.error({
        message: '文件夹大小计算失败',
        description: error?.message || String(error)
      })
    }
  }

  handleFolderSizeDoubleClick = event => {
    event.stopPropagation()
  }

  renderFolderSize = () => {
    const {
      folderSizeStatus,
      folderSizeValue,
      folderSizeCount
    } = this.state
    const loading = folderSizeStatus === 'loading'
    const text = loading
      ? `${e('calculate')}…`
      : folderSizeStatus === 'error'
        ? '重试'
        : folderSizeStatus === 'done'
          ? folderSizeValue
          : '—'
    const title = folderSizeStatus === 'done'
      ? `${folderSizeValue} · ${folderSizeCount} 个文件 · 点击重新计算`
      : folderSizeStatus === 'idle'
        ? '打开目录后自动计算'
        : '点击计算文件夹大小'
    return (
      <button
        type='button'
        className='sftp-folder-size-action'
        disabled={loading}
        title={title}
        draggable={false}
        onClick={this.handleCalculateFolderSize}
        onDoubleClick={this.handleFolderSizeDoubleClick}
      >
        {text}
      </button>
    )
  }

  get editor () {
    return refsStatic.get('text-editor')
  }

  // handleDropdownOpenChange = (open) => {
  //   if (open) {
  //     this.forceUpdate()
  //   }
  // }

  applyStyle = () => {
    if (!this.domRef) {
      return
    }
    const {
      id,
      type
    } = this.props
    const headers = document.querySelectorAll(
      `#id-${id} .${type} .sftp-file-table-header .sftp-header-box`
    )
    this.domRef.current?.querySelectorAll('.sftp-file-prop').forEach((n, i) => {
      const h = headers[i]
      if (h) {
        const s = pick(h.style, ['width', 'left'])
        Object.assign(n.style, s)
      }
    })
  }

  onCopy = (targetFiles, isCut) => {
    const { file } = this.state
    const selected = this.isSelected(file.id)
    const files = targetFiles ||
      (
        selected
          ? this.props.getSelectedFiles()
          : [file]
      )
    const prefix = file.type === typeMap.remote
      ? 'remote:'
      : ''
    const textToCopy = files.map(f => {
      return prefix + resolve(f.path, f.name)
    }).join('\n')
    copyToClipboard(textToCopy)
    // 2026-09-02 coder(lq): Keep source terminal metadata in the app clipboard so paste can target another SFTP terminal safely.
    const sftpClipboard = {
      text: textToCopy,
      files: copy(files).map(f => ({
        ...f,
        host: f.host || this.props.tab?.host,
        tabType: f.tabType || this.props.tab?.type,
        tabId: f.tabId || this.props.tab?.id,
        title: f.title || createTransferProps(this.props).title
      })),
      operation: isCut ? fileOperationsMap.mv : fileOperationsMap.cp
    }
    window.store.sftpClipboard = sftpClipboard
    // 2026-09-04 coder(lq): Mirror the file-transfer payload into a shared clipboard format so another window can keep the source terminal metadata.
    window.pre?.writeSftpClipboard?.(sftpClipboard)
    window.store.fileOperation = isCut ? fileOperationsMap.mv : fileOperationsMap.cp
  }

  onCopyPath = (targetFiles) => {
    const { file } = this.state
    const selected = this.isSelected(file.id)
    const files = targetFiles ||
      (
        selected
          ? this.props.getSelectedFiles()
          : [file]
      )
    const textToCopy = files.map(f => {
      return resolve(f.path, f.name)
    }).join('\n')
    copyToClipboard(textToCopy)
  }

  onCut = (targetFiles) => {
    this.onCopy(targetFiles, true)
  }

  getTransferType = fileType => {
    return fileType !== typeMap.local
      ? transferTypeMap.upload
      : transferTypeMap.download
  }

  onPaste = async () => {
    const { type } = this.state.file
    const path = this.props[type + 'Path']
    const clickBoardText = readClipboard()
    const appClipboard = window.store.sftpClipboard
    const systemClipboard = window.pre?.readSftpClipboard?.()
    const sftpClipboard = resolveSftpClipboardTransfer({
      clipboardText: clickBoardText,
      appClipboard,
      systemClipboard
    })
    const fileNames = sftpClipboard
      ? sftpClipboard.files
      : clickBoardText.split('\n')
    const res = []
    const operation = sftpClipboard
      ? sftpClipboard.operation
      : this.props.fileOperation || fileOperationsMap.cp
    for (let i = 0, len = fileNames.length; i < len; i++) {
      const item = fileNames[i]
      const isRemote = typeof item === 'object'
        ? item.type === typeMap.remote
        : item.startsWith('remote:')
      const fromPath = typeof item === 'object'
        ? resolve(item.path, item.name)
        : (isRemote ? item.replace(/^remote:/, '') : item)
      const { name } = getFolderFromFilePath(fromPath, isRemote)
      const toPath = resolve(path, sanitizeFilename(name))
      const sourceTabId = (typeof item === 'object' ? item.tabId : undefined) || this.props.tab?.id
      const targetTabId = this.props.tab?.id
      res.push({
        typeFrom: isRemote ? typeMap.remote : typeMap.local,
        typeTo: type,
        fromPath,
        toPath,
        id: generate(),
        ...createTransferProps(this.props),
        // Keep tabId compatible with older transfer consumers: it points to the remote endpoint.
        tabId: sourceTabId || targetTabId || this.props.tab?.id,
        sourceTabId,
        targetTabId,
        host: isRemote && typeof item === 'object' ? item.host : this.props.tab?.host,
        tabType: isRemote && typeof item === 'object' ? item.tabType : this.props.tab?.type,
        title: isRemote && typeof item === 'object' ? item.title : createTransferProps(this.props).title,
        fromFile: typeof item === 'object' ? item : undefined,
        operation
      })
    }
    // 2026-09-02 coder(lq): Route clipboard transfers between different SFTP terminals through the same local-staging flow as drag-and-drop.
    // A normal remote transfer only has one SFTP reference and would otherwise execute on the target connection.
    const targetTab = this.props.tab
    const {
      remote: crossTerminalRemote,
      direct: directTransfers
    } = partitionClipboardTransfers(res, targetTab)
    const handledIds = new Set()
    if (crossTerminalRemote.length && targetTab) {
      const remote2RemoteHandlers = refsStatic.get('remote2remote-handlers')
      for (const item of crossTerminalRemote) {
        const handled = remote2RemoteHandlers?.onRemote2RemoteDrop({
          fromFiles: [item.fromFile],
          toFile: {
            type,
            path,
            name: '',
            isDirectory: true
          },
          targetTab
        })
        if (handled) {
          handledIds.add(item.id)
        }
      }
    }
    const remainingTransfers = directTransfers.concat(
      crossTerminalRemote.filter(item => !handledIds.has(item.id))
    )
    if (remainingTransfers.length) {
      this.props.addTransferList(remainingTransfers)
    }
  }

  onDragStart = e => {
    this.props.modifier({
      onDrag: true
    })
    const cls = this.props.selectedFiles.size > 1
      ? onDragCls + ' ' + onMultiDragCls
      : onDragCls
    addClass(this.domRef.current, cls)
    const transferProps = createTransferProps(this.props)
    const selected = this.isSelected(this.props.file.id)
    const dragFiles = selected
      ? this.props.getSelectedFiles()
      : [this.props.file]
    const filesWithMeta = dragFiles.map(file => {
      return {
        ...file,
        host: this.props.tab?.host,
        tabType: this.props.tab?.type,
        tabId: transferProps.tabId,
        title: transferProps.title
      }
    })
    e.dataTransfer.setData('fromFile', JSON.stringify(filesWithMeta))
  }

  getDropFileList = data => {
    return getDropFileList(data)
  }

  onDragEnd = () => {
    this.props.modifier({
      onDrag: false
    })
    removeClass(this.domRef.current, onDragCls, onMultiDragCls)
    document.querySelectorAll('.' + onDragOverCls).forEach((d) => {
      removeClass(d, onDragOverCls)
    })
  }

  onDrop = async (e, dropTarget) => {
    e.preventDefault()
    // 2026-09-02 coder(lq): Prefer the app-owned payload because Electron may expose files for an internal drag too, which would turn a local move into a self-copy.
    const fromFileData = e?.dataTransfer?.getData('fromFile')
    const fromFileManager = !fromFileData && !!e?.dataTransfer?.files?.length
    const fromFiles = this.getDropFileList(e.dataTransfer)
    if (!fromFiles || !fromFiles.length) {
      return
    }

    let toFile = dropTarget
    if (!toFile) {
      let { target } = e
      if (!target) {
        return
      }
      target = target.closest?.('.' + fileItemCls)
      if (!target) {
        return
      }
      const id = target.getAttribute('data-id')
      const type = target.getAttribute('data-type')
      if (!type) {
        return
      }
      toFile = this.props[type + 'FileTree'].get(id) || {}
      if (!toFile.id || !toFile.isDirectory) {
        toFile = {
          type,
          ...getFolderFromFilePath(this.props[type + 'Path'], type === typeMap.remote),
          isDirectory: false
        }
      }
    }
    this.onDropFile(fromFiles, toFile, fromFileManager)
  }

  confirmLocalMove = (files, destination) => {
    const names = files.length === 1
      ? files[0].name
      : `${files.length} ${e('files')}`
    return new Promise(resolve => {
      Modal.confirm({
        title: e('confirmMove'),
        content: (
          <div className='wordbreak'>
            {names} → {destination}
          </div>
        ),
        okText: e('ok'),
        cancelText: e('cancel'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      })
    })
  }

  onDropFile = async (fromFiles, toFile, fromFileManager) => {
    const { type: fromType } = fromFiles[0]
    const {
      id,
      type: toType,
      isDirectory: isDirectoryTo
    } = toFile

    let operation = ''
    const targetHost = this.props.tab?.host
    const isCrossTerminalRemoteDrop = !fromFileManager &&
      fromType === typeMap.remote &&
      toType === typeMap.remote &&
      fromFiles.every(file => file?.tabId && (
        file.host !== targetHost || file.tabId !== this.props.tab?.id
      ))

    if (isCrossTerminalRemoteDrop) {
      const handled = refsStatic.get('remote2remote-handlers')?.onRemote2RemoteDrop({
        fromFiles,
        toFile,
        targetTab: this.props.tab
      })
      if (handled) {
        return
      }
    }

    // same side and drop to file = drop to folder
    if (!fromFileManager && fromType === toType && !isDirectoryTo) {
      return
    }

    // drop from file manager
    if (fromFileManager && toType === typeMap.local) {
      operation = fileOperationsMap.cp
      if (id) {
        toFile = {
          ...toFile,
          ...getFolderFromFilePath(
            resolve(toFile.path, sanitizeFilename(toFile.name))
          ),
          id: undefined
        }
      }
    }

    // same side and drop to folder, do mv
    if (fromType === toType && isDirectoryTo && !fromFileManager) {
      operation = fileOperationsMap.mv
    }

    // 2026-09-02 coder(lq): Resolve OS file metadata before no-op filtering so dropped folders can be rejected when the destination is themselves or a child.
    let files = fromFiles
    if (fromFileManager) {
      files = await this.filterFiles(fromFiles)
    }
    if (!files.length) return

    const destination = resolveDropDestination(toFile)
    const isSameSideCopy = fromFileManager && fromType === toType
    if (operation === fileOperationsMap.mv || isSameSideCopy) {
      // 2026-09-02 coder(lq): Treat an item dropped back onto its own row or source directory as a no-op on every transport, not only local files.
      // Without this guard a remote folder can be sent as `/root/logs -> /root/logs/logs`, producing a misleading move error even though the user made no change.
      const safeFiles = files.filter(file => !isNoOpDrop(file, destination))
      if (!safeFiles.length) return
      files = safeFiles
      if (operation === fileOperationsMap.mv && fromType === typeMap.local) {
        const confirmed = await this.confirmLocalMove(safeFiles, destination)
        if (!confirmed) {
          return
        }
      }
    }

    // other side, do transfer
    this.transferDrop(
      files,
      toFile,
      operation,
      // 2026-09-02 coder(lq): Keep the validated drag set for every move; re-expanding selection could reintroduce an ignored self-move.
      operation !== fileOperationsMap.mv
    )
  }

  filterFiles = async (files) => {
    const res = []
    for (const file of files) {
      const { name, path } = file
      const info = await getLocalFileInfo(
        resolve(path, name)
      ).catch(console.log)
      if (info) {
        res.push(info)
      }
    }
    return res
  }

  transferDrop = (fromFiles, toFile, operation, respectSelection = true) => {
    const files = respectSelection && this.isSelected(fromFiles[0]?.id)
      ? this.props.getSelectedFiles()
      : fromFiles
    return this.doTransferSelected(
      null,
      files,
      resolveDropDestination(toFile),
      toFile.type,
      operation
    )
  }

  // 2026-09-03 coder(lq): Extract archives from the current SFTP pane without opening a terminal or exposing command details.
  extractArchive = async () => {
    const { file } = this.state
    const { type, path, name } = file
    const archivePath = resolve(path, name)
    const extractPath = resolve(path, getArchiveExtractName(name))
    try {
      if (type === typeMap.local) {
        await window.fs.extractArchive(archivePath, extractPath)
        await this.props.localList()
      } else {
        const canUseSshExtract = this.props.tab?.enableSsh !== false && this.props.sftp?.extractArchive
        if (canUseSshExtract) {
          try {
            await this.props.sftp.extractArchive(archivePath, extractPath)
            await wait(300)
            await this.props.remoteList()
            notification.success({
              message: e('extractArchiveSuccess')
            })
            return
          } catch (error) {
            console.warn('remote archive extract fallback', error)
          }
        }
        if (!this.props.sftp?.download || !this.props.sftp?.upload) {
          throw new Error('当前连接不支持远程解压')
        }
        await this.extractArchiveBySftp(archivePath, extractPath, name)
        await wait(300)
        await this.props.remoteList()
      }
      notification.success({
        message: e('extractArchiveSuccess')
      })
    } catch (error) {
      notification.error({
        message: e('extractArchiveFailed'),
        description: error?.message || String(error)
      })
    }
  }

  // 2026-09-22 coder(lq): Truncate active logs in place so writers keep the same inode, owner and permissions.
  clearLogFile = async () => {
    const { file } = this.state
    if (!isClearableLogFile(file)) {
      return
    }
    const { type, path, name, size } = file
    const filePath = resolve(path, name)
    const confirmed = await new Promise(resolve => {
      Modal.confirm({
        title: e('clearLogFileConfirm'),
        content: (
          <div className='wordbreak'>
            <div>{filePath}</div>
            <div>{filesize(Number(size) || 0)}</div>
            <div className='mg1t'>{e('clearLogFileWarning')}</div>
          </div>
        ),
        okText: e('clearLogFile'),
        cancelText: e('cancel'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      })
    })
    if (!confirmed) {
      return
    }
    try {
      const result = type === typeMap.remote
        ? await this.props.sftp.writeFile(filePath, '')
        : await window.fs.writeFile(filePath, '')
      if (!result) {
        throw new Error(e('clearLogFileFailed'))
      }
      await this.props[`${type}List`]()
      notification.success({
        message: e('clearLogFileSuccess'),
        description: `${filePath} · ${e('releasedSpace')} ${filesize(Number(size) || 0)}`
      })
    } catch (error) {
      notification.error({
        message: e('clearLogFileFailed'),
        description: error?.message || String(error)
      })
    }
  }

  extractArchiveBySftp = async (archivePath, extractPath, name) => {
    const tempId = generate()
    const tempRoot = resolve(window.pre.tempDir, `electerm-extract-${tempId}`)
    const tempArchivePath = resolve(tempRoot, name)
    const tempExtractBase = resolve(tempRoot, getArchiveExtractName(name))
    const sftp = this.props.sftp
    const getAvailableRemotePath = async (basePath) => {
      let candidate = basePath
      let suffix = 1
      while (true) {
        try {
          await sftp.stat(candidate)
          candidate = `${basePath}${suffix}`
          suffix += 1
        } catch {
          return candidate
        }
      }
    }
    const runTransfer = (type, fromPath, toPath, isDirectory) => {
      return new Promise((resolve, reject) => {
        let transport = null
        const cleanup = () => {
          if (transport?.destroy) {
            transport.destroy()
          }
          transport = null
        }
        const onEnd = () => resolve()
        const onError = (error) => {
          cleanup()
          reject(error)
        }
        sftp[type]({
          remotePath: type === 'download' ? fromPath : toPath,
          localPath: type === 'download' ? toPath : fromPath,
          isDirectory,
          onData: () => {},
          onError,
          onEnd
        }).then(t => {
          transport = t
        }).catch(onError)
      })
    }
    const remoteExtractPath = await getAvailableRemotePath(extractPath)
    await window.fs.mkdir(tempRoot, { recursive: true }).catch(() => {})
    try {
      await runTransfer('download', archivePath, tempArchivePath, false)
      const localExtractPath = await window.fs.extractArchive(tempArchivePath, tempExtractBase)
      await runTransfer('upload', localExtractPath, remoteExtractPath, true)
    } finally {
      await window.fs.rmrf(tempRoot).catch(() => {})
    }
  }

  isSelected = (fileId = '') => {
    return this.props.selectedFiles.has(fileId)
  }

  doRename = () => {
    const file = copy(this.state.file)
    file.nameTemp = file.name
    file.isEditing = true
    this.props.modifier({
      onEditFile: true
    })
    this.setState({
      file
    })
  }

  editPermission = () => {
    this.openFileModeModal(this.state.file)
  }

  showInfo = () => {
    const { type } = this.props
    refsStatic.get('file-modal')?.showFileInfoModal({
      file: this.state.file,
      tab: this.props.tab,
      visible: true,
      pid: this.props.pid,
      uidTree: this.props[`${type}UidTree`],
      gidTree: this.props[`${type}GidTree`]
    })
  }

  cancelNew = (type) => {
    let list = this.props[type]
    list = list.filter(p => p.id)
    this.props.modifier({
      [type]: list
    })
  }

  localCreateNew = async file => {
    const { nameTemp, isDirectory } = file
    const { localPath } = this.props
    const p = resolve(localPath, nameTemp)
    const func = isDirectory
      ? window.fs.mkdir
      : window.fs.touch
    const res = await func(p)
      .then(() => true)
      .catch(window.store.onError)
    if (res) {
      this.props.localList()
    }
  }

  remoteCreateNew = async file => {
    const { nameTemp, isDirectory } = file
    const { remotePath, sftp } = this.props
    const p = resolve(remotePath, nameTemp)
    const func = isDirectory
      ? sftp.mkdir
      : sftp.touch
    const res = await func(p)
      .then(() => true)
      .catch(window.store.onError)
    if (res) {
      await wait(500)
      await this.props.remoteList()
    }
  }

  selectAll = (e) => {
    const { type } = this.props.file
    this.props.selectAll(type, e)
  }

  createNew = file => {
    const { type } = file
    return this[`${type}CreateNew`](file)
  }

  getShiftSelected (file, type) {
    const indexs = this.props.getSelectedFiles().map(
      this.props.getIndex
    )
    const i = this.props.getIndex(file)
    const lastI = this.props.getIndex(this.props.lastClickedFile)
    const arr = [...indexs, i].sort(sorter)
    const last = arr.length - 1
    const from = arr[0]
    const to = arr[last]
    let [start, end] = [from, to]
    if (indexs.includes(i)) {
      const other = lastI > i ? from : to
      ;[start, end] = [other, i].sort(sorter)
    }
    return this.props.getFileList(type).slice(start, end + 1)
  }

  onClick = e => {
    const { file } = this.state
    const {
      id,
      type,
      isParent,
      isEmpty
    } = file
    if (isEmpty || isParent) {
      return this.props.modifier({
        selectedFiles: new Set()
      })
    }
    this.props.modifier({
      lastClickedFile: file
    })
    this.onDragEnd(e)
    const selectedFilesOld = this.props.getSelectedFiles()
    const isSameSide = selectedFilesOld.length &&
      type === selectedFilesOld[0].type
    let selectedFiles = [file]
    if (isSameSide) {
      if (
        (e.ctrlKey && !isMac) ||
        (e.metaKey && isMac)
      ) {
        const isSelected = some(
          selectedFilesOld,
          s => s.id === id
        )
        selectedFiles = isSelected
          ? selectedFilesOld.filter(s => s.id !== id)
          : [
              ...copy(selectedFilesOld),
              file
            ]
      } else if (e.shiftKey) {
        selectedFiles = this.getShiftSelected(file, type)
      }
    }
    this.props.modifier({
      selectedFiles: new Set(selectedFiles.map(f => f.id)),
      selectedType: type,
      lastClickedFile: file
    })
  }

  changeFileMode = async (file) => {
    this.clearRef()
    const { permission, type, path, name } = file
    const func = type === typeMap.local
      ? window.fs.chmod
      : this.props.sftp.chmod
    const p = resolve(path, name)
    await func(p, permission).catch(window.store.onError)
    this.props[type + 'List']()
  }

  openFileModeModal = () => {
    const { type } = this.props
    refs.add(this.id, this)
    refsStatic.get('file-modal')?.showFileModeModal(
      {
        tab: this.props.tab,
        visible: true,
        uidTree: this.props[`${type}UidTree`],
        gidTree: this.props[`${type}GidTree`]
      },
      this.state.file,
      this.id
    )
  }

  handleBlur = () => {
    const file = copy(this.state.file)
    const { nameTemp, name, type, id } = this.state.file
    if (name === nameTemp) {
      if (!id) {
        return this.cancelNew(type)
      }
      delete file.nameTemp
      delete file.isEditing
      return this.setState({
        file
      })
    }
    if (!id) {
      return this.createNew(file)
    }
    this.rename(name, nameTemp)
  }

  rename = (oldname, newname) => {
    const { type } = this.props.file
    return this[`${type}Rename`](oldname, newname)
  }

  localRename = async (oldname, newname) => {
    const { localPath } = this.props
    const p1 = resolve(localPath, oldname)
    const p2 = resolve(localPath, newname)
    await window.fs.rename(p1, p2).catch(window.store.onError)
    this.props.localList()
  }

  remoteRename = async (oldname, newname) => {
    const { remotePath, sftp } = this.props
    const p1 = resolve(remotePath, oldname)
    const p2 = resolve(remotePath, newname)
    const res = await sftp.rename(p1, p2)
      .catch(window.store.onError)
      .then(() => true)
    if (res) {
      this.props.remoteList()
    }
  }

  handleChange = e => {
    const nameTemp = e.target.value
    const file = copy(this.state.file)
    file.nameTemp = nameTemp
    this.setState({
      file
    })
  }

  enterDirectory = (e, file = this.state.file) => {
    e && e.stopPropagation && e.stopPropagation()
    const { type, name, isParent } = file
    const n = `${type}Path`
    const path = isParent ? file.path : this.props[n]
    let np = resolve(path, name)
    if (type === typeMap.remote) {
      np = normalizeRemotePath(np)
    }
    const op = this.props[type + 'Path']
    this.props.modifier({
      [n]: np,
      [n + 'Temp']: np
    }, () => this.props[`${type}List`](
      undefined,
      undefined,
      op
    ))
  }

  openFile = file => {
    const filePath = resolve(file.path, file.name)
    window.fs.openFile(filePath)
      .catch(window.store.onError)
  }

  removeFileEditEvent = () => {
    this.clearRef()
    if (this.watchingFile) {
      window.pre.ipcOffEvent('file-change', this.onFileChange)
      window.pre.runGlobalAsync('unwatchFile', this.watchingFile)
      window.fs.unlink(this.watchingFile).catch(console.log)
      delete this.watchingFile
    }
  }

  editWithSystemEditor = async (text) => {
    const {
      path,
      name,
      type
    } = this.state.file
    let tempPath = ''
    if (type === typeMap.local) {
      tempPath = window.pre.resolve(path, name)
    } else {
      const id = generate()
      tempPath = window.pre.resolve(
        window.pre.tempDir, `electerm-temp-${id}-${name}`
      )
      await window.fs.writeFile(tempPath, text)
    }
    this.watchingFile = tempPath
    this.watchFile(tempPath)
  }

  editWithCustomEditor = async (text, editorCommand) => {
    const {
      path,
      name,
      type
    } = this.state.file
    let tempPath = ''
    if (type === typeMap.local) {
      tempPath = window.pre.resolve(path, name)
    } else {
      const id = generate()
      tempPath = window.pre.resolve(
        window.pre.tempDir, `electerm-temp-${id}-${name}`
      )
      await window.fs.writeFile(tempPath, text)
    }
    this.watchingFile = tempPath
    window.pre.runGlobalAsync('watchFile', tempPath)
    await window.pre.runGlobalAsync('openFileWithEditor', tempPath, editorCommand)
    window.pre.ipcOnEvent('file-change', this.onFileChange)
  }

  onFileChange = (e, text) => {
    this.editor.editWithSystemEditorDone({
      id: this.id,
      text
    })
  }

  watchFile = async (tempPath) => {
    window.pre.runGlobalAsync('watchFile', tempPath)
    window.fs.openFile(tempPath)
      .catch(window.store.onError)
    window.pre.showItemInFolder(tempPath)
    window.pre.ipcOnEvent('file-change', this.onFileChange)
  }

  gotoFolderInTerminal = () => {
    const {
      path, name
    } = this.state.file
    let rp = path ? resolve(path, name) : this.props[`${this.props.type}Path`]
    if (this.props.type === typeMap.remote) {
      rp = this.convertSftpPathToTerminalPath(rp)
    }
    this.props.tab.pane = paneMap.terminal
    const ownerTabId = this.props.activeOwnerTabId || this.props.tab.id
    refs.get('term-' + resolveTerminalId(ownerTabId))?.cd(rp)
  }

  convertSftpPathToTerminalPath = (p) => {
    const m = p.match(/^\/([a-zA-Z]:)(.*)$/)
    if (m) {
      return m[1] + m[2].replace(/\//g, '\\')
    }
    return p
  }

  fetchEditorText = async (path, type) => {
    // const sftp = sftpFunc()
    const text = typeMap.remote === type
      ? await this.props.sftp.readFile(path)
      : await window.fs.readFile(path)
    return text
  }

  onSubmitEditFile = async (mode, type, path, text, noClose) => {
    const r = typeMap.remote === type
      ? await this.props.sftp.writeFile(
        path,
        text,
        mode
      ).catch(window.store.onError)
      : await window.fs.writeFile(
        path,
        text,
        mode
      ).catch(window.store.onError)
    const data = {
      loading: false
    }
    if (r && !noClose) {
      data.id = ''
      data.file = null
      data.text = ''
    }
    this.clearRef()
    this.editor?.setState(data)
    if (r && !noClose) {
      this.props[`${type}List`]()
    }
  }

  editFile = () => {
    refs.add(this.id, this)
    this.editor?.openEditor({
      id: this.id,
      file: this.state.file
    })
  }

  transferOrEnterDirectory = async (e, edit) => {
    const { file } = this.state
    const { isDirectory, type, size } = file
    const isLocal = type === typeMap.local
    const isRemote = type === typeMap.remote
    if (isDirectory) {
      return this.enterDirectory(e)
    }
    if (!edit && isLocal) {
      return this.openFile(this.state.file)
    }
    const remoteEdit = !edit && isRemote && size < maxEditFileSize
    if (
      edit === true || remoteEdit
    ) {
      return this.editFile()
    }
    if (
      this.props.tab?.host
    ) {
      this.transfer()
    }
  }

  getTransferList = async (
    file,
    toPathBase,
    _typeTo,
    operation
  ) => {
    const { name, path, type } = file
    const isLocal = type === typeMap.local
    let typeTo = isLocal
      ? typeMap.remote
      : typeMap.local
    if (_typeTo) {
      typeTo = _typeTo
    }
    let toPath = isLocal
      ? this.props[typeMap.remote + 'Path']
      : this.props[typeMap.local + 'Path']
    if (toPathBase) {
      toPath = toPathBase
    }
    toPath = resolve(toPath, sanitizeFilename(name))
    const currentTabId = this.props.tab?.id
    const sourceTabId = file.tabId || currentTabId
    const targetTabId = currentTabId
    const obj = {
      typeFrom: type,
      typeTo,
      fromPath: resolve(path, name),
      toPath,
      fromFile: file,
      id: generate(),
      ...createTransferProps(this.props),
      // 2026-09-02 coder(lq): Preserve both endpoints so a transfer can cross SFTP terminals without using the target connection as its source.
      tabId: sourceTabId || targetTabId || currentTabId,
      sourceTabId,
      targetTabId,
      host: type === typeMap.remote ? (file.host || this.props.tab?.host) : this.props.tab?.host,
      tabType: type === typeMap.remote ? (file.tabType || this.props.tab?.type) : this.props.tab?.type,
      operation
    }
    return [obj]
  }

  doTransferSelected = async (
    e,
    selectedFiles = this.props.getSelectedFiles(),
    toPathBase,
    typeTo,
    operation
  ) => {
    let all = []
    for (const f of selectedFiles) {
      const arr = await this.getTransferList(f, toPathBase, typeTo, operation)
      all = [
        ...all,
        ...arr
      ]
    }
    this.props.addTransferList(all)
  }

  transfer = async (mapper) => {
    const { file } = this.state
    const arr = await this.getTransferList(file)
    if (mapper) {
      arr.forEach(mapper)
    }
    this.props.addTransferList(arr)
  }

  doEnterDirectory = (e) => {
    this.enterDirectory(e)
  }

  refresh = () => {
    this.props.onGoto(this.props.file.type)
  }

  shouldShowSelectedMenu = () => {
    const {
      file: {
        id
      },
      selectedFiles
    } = this.props
    return id &&
      selectedFiles.size > 1 &&
      selectedFiles.has(id)
  }

  del = async () => {
    const delSelected = this.shouldShowSelectedMenu()
    const { file } = this.props
    const { type } = file
    const files = delSelected
      ? this.props.getSelectedFiles()
      : [file]
    await this.props.delFiles(type, files)
  }

  doTransfer = () => {
    this.transfer()
  }

  zipAndTransfer = async () => {
    this.transfer(transfer => {
      transfer.zip = true
    })
  }

  newFile = () => {
    return this.newItem(false)
  }

  newDirectory = () => {
    return this.newItem(true)
  }

  showInDefaultFileManager = () => {
    const { path, name } = this.state.file
    const p = resolve(path, name)
    window.pre.showItemInFolder(p)
  }

  downloadFromBrowser = async () => {
    const { path, name, isDirectory } = this.state.file
    const p = resolve(path, name)
    if (window.et.downloadFromBrowser) {
      return window.et.downloadFromBrowser(p)
    }
    const url = '/api/download?path=' + encodeURIComponent(p)
    const res = await window.api.fetch(url)
      .catch(window.store.onError)
    if (!res) return
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = isDirectory ? name + '.tar.gz' : name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  newItem = (isDirectory) => {
    const { type } = this.state.file
    const list = copy(this.props[type])
    list.unshift({
      name: '',
      nameTemp: '',
      isDirectory,
      isEditing: true,
      type
    })
    this.props.modifier({
      [type]: list,
      onEditFile: true
    })
  }

  renderDelConfirmTitle (shouldShowSelectedMenu) {
    const { file } = this.props
    const files = shouldShowSelectedMenu
      ? this.props.getSelectedFiles()
      : [file]
    return this.props.renderDelConfirmTitle(files, true)
  }

  showModeEdit (type, isRealFile) {
    if (!isRealFile) {
      return false
    }
    if (type === typeMap.remote) {
      return true
    }
    return !isWin
  }

  handleContextMenuCapture = (e) => {
    this.props.setClickFileId(this.id)
    if (!this.isSelected(this.state.file.id)) {
      this.onClick(e)
    }
    this.contextMenuPosition = {
      clientY: e.clientY
    }
  }

  itemToMenuFormat = (r) => {
    const { func, text, disabled, icon, subText, requireConfirm, title } = r
    const IconCom = iconsMap[icon]
    return {
      key: func,
      label: title
        ? <span title={title}>{text}</span>
        : text,
      disabled,
      icon: <IconCom />,
      extra: subText,
      danger: requireConfirm,
      title
    }
  }

  renderContextMenu = () => {
    const items = this.renderContextItems()

    // Check if we need to split the menu
    if (this.contextMenuPosition) {
      const windowHeight = window.innerHeight
      const { clientY } = this.contextMenuPosition
      const estimatedMenuHeight = items.length * 32 // Approximate height per menu item
      const availableHeight = windowHeight - clientY

      // If menu would extend beyond window, split into two parts
      if (estimatedMenuHeight > availableHeight && items.length > 6) {
        const firstHalf = items.slice(0, Math.ceil(items.length / 2))
        const secondHalf = items.slice(Math.ceil(items.length / 2))

        // Create "More..." submenu with second half of items
        const moreSubmenu = {
          key: 'more-submenu',
          label: '…',
          icon: <ArrowRightOutlined />,
          children: secondHalf.map(this.itemToMenuFormat)
        }

        // Return first half + "More..." submenu
        return [...firstHalf.map(this.itemToMenuFormat), moreSubmenu]
      }
    }

    // Otherwise return normal menu
    return items.map(this.itemToMenuFormat)
  }

  renderContextItems () {
    const {
      file: {
        type,
        isDirectory,
        size,
        id,
        isEmpty,
        isParent
      },
      selectedFiles,
      tab
    } = this.props
    const isRealFile = !isEmpty && !isParent
    const hasHost = !!tab.host
    const { enableSsh } = tab
    const isLocal = type === typeMap.local
    const isRemote = type === typeMap.remote
    const transferText = isLocal
      ? e(transferTypeMap.upload)
      : e(transferTypeMap.download)
    const iconType = isLocal
      ? 'CloudUploadOutlined'
      : 'CloudDownloadOutlined'
    const len = selectedFiles.size
    const shouldShowSelectedMenu = id &&
      len > 1 &&
      selectedFiles.has(id)
    const delTxt = shouldShowSelectedMenu ? `${e('del')}:${e('selected')}(${len})` : e('del')
    const canPaste = hasFileInClipboardText()
    const showEdit = !isDirectory && id &&
      size < maxEditFileSize
    const showExtract = isRealFile && !isDirectory && isArchiveFile(this.state.file.name) &&
      (isLocal || (isRemote && hasHost && !this.props.isFtp))
    const showClearLog = !shouldShowSelectedMenu && isClearableLogFile(this.state.file)
    const res = []
    if (isDirectory && isRealFile) {
      res.push({
        func: 'doEnterDirectory',
        icon: 'EnterOutlined',
        text: e('enter')
      })
    }
    if (shouldShowSelectedMenu && hasHost) {
      res.push({
        func: 'doTransferSelected',
        icon: iconType,
        text: `${e('selected')}(${len})`
      })
    }
    if (
      isDirectory &&
      (
        (hasHost && enableSsh !== false && isRemote) ||
        (isLocal && !hasHost)
      ) &&
      !this.props.isFtp
    ) {
      res.push({
        func: 'gotoFolderInTerminal',
        icon: 'CodeOutlined',
        text: e('gotoFolderInTerminal')
      })
    }
    if (!(!isRealFile || !hasHost || shouldShowSelectedMenu)) {
      res.push({
        func: 'doTransfer',
        icon: iconType,
        text: transferText,
        title: isRemote
          ? '下载到左侧当前路径'
          : '上传到右侧当前路径'
      })
      // if (isDirectory && !this.props.isFtp) {
      //   res.push({
      //     func: 'zipAndTransfer',
      //     icon: 'FileZipOutlined',
      //     text: e('compressAndTransfer')
      //   })
      // }
    }
    if (!isDirectory && isRealFile && isLocal) {
      res.push({
        func: 'transferOrEnterDirectory',
        icon: 'ArrowRightOutlined',
        text: e('open')
      })
    }
    if (isRealFile && isLocal) {
      res.push({
        func: 'showInDefaultFileManager',
        icon: 'ContainerOutlined',
        text: e('showInDefaultFileMananger')
      })
    }
    if (isLocal && isRealFile && window.et.isWebApp) {
      res.push({
        func: 'downloadFromBrowser',
        icon: 'DownloadOutlined',
        text: e('downloadFromBrowser'),
        title: '下载到浏览器默认下载目录'
      })
    }
    if (showEdit) {
      res.push({
        func: 'editFile',
        icon: 'EditOutlined',
        text: e('edit')
      })
    }
    if (showExtract) {
      res.push({
        func: 'extractArchive',
        icon: 'FileZipOutlined',
        text: e('extractArchive')
      })
    }
    if (showClearLog) {
      res.push({
        func: 'clearLogFile',
        icon: 'ClearOutlined',
        text: e('clearLogFile'),
        requireConfirm: true
      })
    }
    if (isRealFile) {
      res.push({
        func: 'del',
        icon: 'CloseCircleOutlined',
        text: delTxt,
        requireConfirm: true
      })
      res.push({
        func: 'onCopy',
        icon: 'CopyOutlined',
        text: e('copy'),
        subText: `${ctrlOrCmd}+c`
      })
      res.push({
        func: 'onCut',
        icon: 'FileExcelOutlined',
        text: e('cut'),
        subText: `${ctrlOrCmd}+x`
      })
    }
    res.push({
      func: 'onPaste',
      icon: 'CopyOutlined',
      text: e('paste'),
      disabled: !canPaste,
      subText: `${ctrlOrCmd}+v`
    })
    if (isRealFile) {
      res.push({
        func: 'doRename',
        icon: 'EditOutlined',
        text: e('rename')
      })
      res.push({
        func: 'onCopyPath',
        icon: 'CopyOutlined',
        text: e('copyFilePath')
      })
    }
    if (enableSsh !== false || isLocal) {
      res.push({
        func: 'newFile',
        icon: 'FileAddOutlined',
        text: e('newFile')
      })
      res.push({
        func: 'newDirectory',
        icon: 'FolderAddOutlined',
        text: e('newFolder')
      })
    }
    res.push({
      func: 'selectAll',
      icon: 'CheckSquareOutlined',
      text: e('selectAll'),
      subText: `${ctrlOrCmd}+a`
    })
    res.push({
      func: 'refresh',
      icon: 'ReloadOutlined',
      text: e('refresh')
    })
    if (
      this.showModeEdit(type, isRealFile) &&
      !this.props.isFtp
    ) {
      res.push({
        func: 'editPermission',
        icon: 'LockOutlined',
        text: e('editPermission')
      })
    }
    if (isRealFile) {
      res.push({
        func: 'showInfo',
        icon: 'InfoCircleOutlined',
        text: e('info')
      })
    }
    return res
  }

  onContextMenu = ({ key }) => {
    // If it's not the submenu itself
    if (key !== 'more-submenu') {
      this[key]()
    }
  }

  renderEditing (file) {
    const {
      nameTemp,
      isDirectory
    } = file
    const Icon = isDirectory ? FolderOutlined : FileOutlined
    const pre = <Icon />
    return (
      <div className='sftp-item'>
        <Input
          value={nameTemp}
          prefix={pre}
          onChange={this.handleChange}
          onBlur={this.handleBlur}
          onPressEnter={this.handleBlur}
        />
      </div>
    )
  }

  renderProp = ({ id, size }) => {
    const { file } = this.state
    let value = file[id]
    let typeIcon = null
    let symbolicLinkText = null
    const {
      isDirectory,
      isSymbolicLink,
      isParent
    } = file
    if (isDirectory && id === 'size') {
      value = isParent ? null : this.renderFolderSize()
    } else if (!isDirectory && id === 'size') {
      value = filesize(value)
    } else if (id === 'owner') {
      const { type } = this.props
      value = this.props[`${type}UidTree`]['' + value] || value
    } else if (id === 'group') {
      const { type } = this.props
      value = this.props[`${type}GidTree`]['' + value] || value
    }
    if (id === 'name') {
      // const Icon = isDirectory
      //   ? FolderOutlined
      //   : FileOutlined
      typeIcon = <ExtIcon file={file} className='mg1r' />
      symbolicLinkText = isSymbolicLink
        ? <sup className='color-blue symbolic-link-icon'>*</sup>
        : null
    } else if (id === 'mode') {
      value = permission2mode(mode2permission(value))
    } else if (id.toLowerCase().includes('time')) {
      value = time(value)
    }
    const divProps = {
      className: classnames(`sftp-file-prop noise shi-${id}`, {
        'sftp-folder-size-cell': isDirectory && id === 'size' && !isParent
      }),
      style: {
        width: size + '%',
        flexBasis: `${size}%`
      },
      title: React.isValidElement(value) ? '' : value
    }
    if (isParent && id !== 'name') {
      value = null
      divProps.title = ''
    } else if (isParent && id === 'name') {
      value = '..'
    }
    return (
      <div
        {...divProps}
        key={id}
      >
        {typeIcon}
        {symbolicLinkText}
        {value}
      </div>
    )
  }

  render () {
    const { type, selectedFiles, draggable = true, properties = [], onDragStart, cls = '' } = this.props
    const { file } = this.state
    const {
      isDirectory,
      id,
      isEditing,
      isParent
    } = file
    if (isEditing) {
      return this.renderEditing(file)
    }
    const selected = selectedFiles.has(id)
    const className = classnames('sftp-item', cls, type, {
      directory: isDirectory,
      selected
    })
    const props = {
      className,
      draggable: draggable && !isParent,
      onDragStart: onDragStart || this.onDragStart,
      'data-id': id,
      id: this.id,
      'data-type': type,
      role: isParent ? undefined : 'option',
      'aria-selected': isParent ? undefined : selected,
      title: file.name
    }
    return (
      <div
        ref={this.domRef}
        {...props}
        onContextMenu={this.handleContextMenuCapture}
      >
        <div className='file-bg' />
        <div className='file-props-div'>
          {
            properties.map(this.renderProp)
          }
        </div>
      </div>
    )
  }
}
