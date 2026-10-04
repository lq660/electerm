/**
 * file list table
 */

import { Component, createRef } from 'react'
import { Dropdown } from 'antd'
import classnames from 'classnames'
import FileSection from './file-item'
import PagedList from './paged-list'
import FileListTableHeader from './file-table-header'
import {
  CheckOutlined
} from '@ant-design/icons'
import IconHolder from '../sys-menu/icon-holder'
import { filesRef } from '../common/ref'
import findParent from '../../common/find-parent'
import { removeClass } from '../../common/class'
import {
  normalizeMarqueeRect,
  rectanglesIntersect,
  resolveMarqueeSelection
} from './marquee-selection'
import {
  appendTypeaheadKey,
  findTypeaheadFileIndex,
  getKeyboardTargetIndex
} from './file-list-keyboard'

const e = window.translate
const fileItemCls = 'sftp-item'
const onDragCls = 'sftp-ondrag'
const onDragOverCls = 'sftp-dragover'
const onMultiDragCls = 'sftp-dragover-multi'
const isEditableTarget = target => target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)

export default class FileListTable extends Component {
  constructor (props) {
    super(props)
    this.state = {
      ...this.initFromProps(),
      scrollTop: 0,
      marqueeRect: null,
      itemSize: 36
    }
  }

  containerRef = createRef()
  pagedListRef = createRef()

  componentDidMount () {
    this.measureFrame = requestAnimationFrame(this.measureListLayout)
  }

  componentWillUnmount () {
    this.stopMarqueeListeners()
    window.cancelAnimationFrame(this.measureFrame)
  }

  // 2026-09-25 coder(lq): Theme overrides change the visual row height; measure it so virtual scrolling always reaches the real last file.
  measureListLayout = () => {
    const container = this.containerRef.current
    if (!container) return
    const row = container.querySelector('.real-file-item')
    const rowStyle = row ? window.getComputedStyle(row) : null
    const rawItemSize = row
      ? row.getBoundingClientRect().height + parseFloat(rowStyle.marginTop || 0) + parseFloat(rowStyle.marginBottom || 0)
      : this.state.itemSize
    const measuredItemSize = Number.isFinite(rawItemSize) && rawItemSize > 0
      ? rawItemSize
      : this.state.itemSize
    const itemSize = Math.max(1, measuredItemSize)
    if (Math.abs(itemSize - this.state.itemSize) > 0.5) {
      this.setState({ itemSize })
    }
  }

  stopMarqueeListeners = () => {
    document.removeEventListener('pointermove', this.handleMarqueeMove)
    document.removeEventListener('pointerup', this.handleMarqueeEnd)
    document.removeEventListener('pointercancel', this.handleMarqueeEnd)
  }

  // 2026-09-22 coder(lq): Start rubber-band selection only from list whitespace so normal file dragging remains unchanged.
  handleMarqueeStart = (event) => {
    if (event.button !== 0) {
      return
    }
    const targetRow = event.target.closest('.' + fileItemCls)
    if (targetRow && targetRow.getAttribute('data-id') !== this.props.emptyFileId) {
      return
    }

    this.marqueeStart = {
      x: event.clientX,
      y: event.clientY
    }
    this.marqueeMoved = false
    this.marqueeToggle = event.metaKey || event.ctrlKey
    this.marqueeBaseSelection = this.props.selectedType === this.props.type
      ? new Set(this.props.selectedFiles || [])
      : new Set()
    document.addEventListener('pointermove', this.handleMarqueeMove)
    document.addEventListener('pointerup', this.handleMarqueeEnd)
    document.addEventListener('pointercancel', this.handleMarqueeEnd)
  }

  handlePointerDown = (event) => {
    if (isEditableTarget(event.target)) return
    this.containerRef.current?.focus({ preventScroll: true })
    this.handleMarqueeStart(event)
  }

  getSelectedIndex = () => {
    if (this.props.selectedType !== this.props.type || this.props.selectedFiles.size !== 1) {
      return -1
    }
    const [selectedId] = this.props.selectedFiles
    return this.props.fileList.findIndex(file => file.id === selectedId)
  }

  selectKeyboardFile = (index) => {
    const file = this.props.fileList[index]
    if (!file) return
    this.props.modifier({
      selectedFiles: new Set([file.id]),
      selectedType: this.props.type,
      lastClickedFile: file
    })
    this.pagedListRef.current?.scrollToIndex(index)
  }

  activateSelectedFile = () => {
    if (this.props.selectedType !== this.props.type || this.props.selectedFiles.size !== 1) return
    const [selectedId] = this.props.selectedFiles
    filesRef.get('file-' + selectedId)?.transferOrEnterDirectory()
  }

  handleTypeahead = (event) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
      return false
    }
    const typedAt = Date.now()
    this.typeahead = appendTypeaheadKey(this.typeahead || {}, event.key, typedAt)
    const index = findTypeaheadFileIndex(this.props.fileList, this.typeahead.query)
    if (index < 0) return false
    event.preventDefault()
    this.selectKeyboardFile(index)
    return true
  }

  // 2026-09-25 coder(lq): A focused file pane supports desktop-style navigation without installing document-level listeners that would intercept terminal typing.
  handleKeyDown = (event) => {
    if (isEditableTarget(event.target)) return
    if (this.handleTypeahead(event)) return
    const { key } = event
    const navigationKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']
    if (navigationKeys.includes(key)) {
      event.preventDefault()
      const itemSize = this.state.itemSize || 36
      const nextIndex = getKeyboardTargetIndex({
        currentIndex: this.getSelectedIndex(),
        fileCount: this.props.fileList.length,
        key,
        pageSize: Math.max(1, Math.floor(this.containerRef.current.clientHeight / itemSize) - 1)
      })
      this.selectKeyboardFile(nextIndex)
    } else if (key === 'Enter') {
      event.preventDefault()
      this.activateSelectedFile()
    } else if (key === 'Escape') {
      event.preventDefault()
      this.typeahead = null
      this.props.modifier({ selectedFiles: new Set(), selectedType: '' })
    } else if ((event.ctrlKey || event.metaKey) && key.toLocaleLowerCase() === 'a') {
      event.preventDefault()
      this.props.modifier({
        selectedFiles: new Set(this.props.fileList.map(file => file.id)),
        selectedType: this.props.type
      })
    }
  }

  getMarqueeFileIds = (rect) => {
    const fileIds = new Map(
      this.props.fileList.map(file => [String(file.id), file.id])
    )
    return Array.from(
      this.containerRef.current?.querySelectorAll('.real-file-item[data-id]') || []
    ).reduce((ids, element) => {
      const id = fileIds.get(element.getAttribute('data-id'))
      if (id !== undefined && rectanglesIntersect(rect, element.getBoundingClientRect())) {
        ids.push(id)
      }
      return ids
    }, [])
  }

  handleMarqueeMove = (event) => {
    if (!this.marqueeStart) {
      return
    }
    const rect = normalizeMarqueeRect(this.marqueeStart, {
      x: event.clientX,
      y: event.clientY
    })
    if (!this.marqueeMoved && rect.width < 4 && rect.height < 4) {
      return
    }

    this.marqueeMoved = true
    event.preventDefault()
    const selectedFiles = resolveMarqueeSelection(
      this.marqueeBaseSelection,
      this.getMarqueeFileIds(rect),
      this.marqueeToggle
    )
    this.setState({ marqueeRect: rect })
    this.props.modifier({
      selectedFiles,
      selectedType: selectedFiles.size ? this.props.type : ''
    })
  }

  handleMarqueeEnd = () => {
    if (this.marqueeMoved) {
      this.suppressNextClick = true
    }
    this.marqueeStart = null
    this.marqueeBaseSelection = null
    this.stopMarqueeListeners()
    if (this.state.marqueeRect) {
      this.setState({ marqueeRect: null })
    }
  }

  renderMarquee = () => {
    const { marqueeRect } = this.state
    if (!marqueeRect) {
      return null
    }
    return (
      <div
        className='sftp-selection-marquee'
        style={{
          left: marqueeRect.left,
          top: marqueeRect.top,
          width: marqueeRect.width,
          height: marqueeRect.height
        }}
      />
    )
  }

  onDragOver = e => {
    e.preventDefault()
  }

  onDragEnter = e => {
    let { target } = e
    target = findParent(target, '.' + fileItemCls)
    if (!target) {
      return e.preventDefault()
    }
    if (this.dropTarget && this.dropTarget !== target) {
      this.dropTarget.classList.remove(onDragOverCls)
    }
    this.dropTarget = target
    target.classList.add(onDragOverCls)
  }

  onDragLeave = e => {
    let { target } = e
    target = findParent(target, '.' + fileItemCls)
    if (!target) {
      return e.preventDefault()
    }
    if (
      this.containerRef.current &&
      !this.containerRef.current.contains(e.relatedTarget)
    ) {
      target.classList.remove(onDragOverCls)
    }
  }

  onDrop = e => {
    e.preventDefault()
    const target = findParent(e.target, '.' + fileItemCls)
    if (target) {
      const id = target.getAttribute('data-id')
      const ref = filesRef.get('file-' + id)
      if (ref) {
        // 2026-09-04 coder(lq): The virtual empty row represents the current directory,
        // not a real file. Pass its directory target explicitly so a remote drop is
        // downloaded into the visible local path instead of resolving against an
        // empty placeholder item.
        if (id === this.props.emptyFileId && this.props.currentPath) {
          ref.onDrop(e, {
            type: this.props.type,
            path: this.props.currentPath,
            name: '',
            isDirectory: true
          })
        } else {
          ref.onDrop(e)
        }
      }
      return
    }

    // 2026-09-04 coder(lq): Treat blank space as the current directory so remote files can be downloaded without targeting a row.
    const { type, currentPath, emptyFileId } = this.props
    if (!currentPath || !emptyFileId) {
      return
    }
    const emptyRef = filesRef.get('file-' + emptyFileId)
    if (emptyRef) {
      emptyRef.onDrop(e, {
        type,
        path: currentPath,
        name: '',
        isDirectory: true
      })
    }
  }

  onDragEnd = e => {
    this.props.modifier({
      onDrag: false
    })
    document.querySelectorAll('.' + onDragCls).forEach((d) => {
      removeClass(d, onDragCls, onMultiDragCls)
    })
    document.querySelectorAll('.' + onDragOverCls).forEach((d) => {
      removeClass(d, onDragOverCls)
    })
    e && e.dataTransfer && e.dataTransfer.clearData()
  }

  componentDidUpdate (prevProps) {
    const prevList = prevProps.fileList
    const nextList = this.props.fileList
    const contentChanged = prevList.length !== nextList.length ||
      prevList.some((f, i) => f.id !== nextList[i].id)
    if (contentChanged) {
      this.handleMarqueeEnd()
      if (this.containerRef.current) {
        this.containerRef.current.scrollTop = 0
      }
      this.setState({ scrollTop: 0 })
      this.typeahead = null
      this.measureFrame = requestAnimationFrame(this.measureListLayout)
    }
  }

  onScroll = (e) => {
    this.setState({ scrollTop: e.target.scrollTop })
  }

  initFromProps = (pps = this.getPropsDefault()) => {
    const { length } = pps
    const size = (100 / length)
    const max = (100 - length * 2)
    const min = 2
    const properties = pps.map((name, i) => {
      return {
        id: name,
        max,
        min,
        size
      }
    })
    return {
      properties
    }
  }

  getPropsDefault = () => {
    return this.props.config.filePropsEnabled || [
      'name',
      'size',
      'modifyTime'
    ]
  }

  getPropsAll = () => {
    return [
      'name',
      'size',
      'modifyTime',
      'accessTime',
      'owner',
      'group',
      'mode',
      'path',
      'ext'
    ]
  }

  otherDirection = (direction) => {
    return direction === this.props.directions[0]
      ? this.props.directions[1]
      : this.props.directions[0]
  }

  onResize = size => {
    this.setState(old => {
      const { properties } = old
      const total = size.reduce((a, b) => a + b, 0)
      const newProps = properties.map((d, i) => {
        return {
          ...d,
          size: size[i] * 100 / total
        }
      })
      return {
        properties: newProps
      }
    })
  }

  renderTableHeader = () => {
    const headerProps = {
      renderContextMenu: this.renderContextMenu,
      onContextMenu: this.onContextMenu,
      onClickName: this.onClickName,
      onResize: this.onResize,
      properties: this.state.properties,
      sortDirection: this.props.sortDirection,
      sortProp: this.props.sortProp,
      maxWidth: this.props.width
    }
    return (
      <FileListTableHeader {...headerProps} />
    )
  }

  computePos = (e, height) => {
    return e.target.getBoundingClientRect()
  }

  onToggleProp = name => {
    const { properties } = this.state
    const names = properties.map(d => d.id)
    const all = this.getPropsAll()
    const newProps = names.includes(name)
      ? names.filter(d => d !== name)
      : [...names, name]
    const props = all.filter(g => newProps.includes(g))
    const update = this.initFromProps(props)
    window.store.setConfig({
      filePropsEnabled: props
    })
    this.setState(update)
  }

  onClickName = (e) => {
    const id = e.currentTarget.getAttribute('data-id')
    const { properties } = this.state
    const propObj = properties.find(
      p => p.id === id
    )
    if (!propObj) {
      return
    }
    const { id: name } = propObj
    const { sortDirection, sortProp } = this.props
    const sortDirectionNew = sortProp === name
      ? this.otherDirection(sortDirection)
      : this.props.defaultDirection()
    const { type } = this.props
    window.store.setSftpSortSetting({
      [type]: {
        direction: sortDirectionNew,
        prop: name
      }
    })

    this.props.modifier({
      [`sortDirection.${type}`]: sortDirectionNew,
      [`sortProp.${type}`]: name
    })
  }

  renderContextMenu = () => {
    const { properties } = this.state
    const all = this.getPropsAll()
    const selectedNames = properties.map(d => d.id)
    return all.map((p, i) => {
      const selected = selectedNames.includes(p)
      const disabled = !i
      const icon = disabled || selected ? <CheckOutlined /> : <IconHolder />
      return {
        key: p,
        label: e(p),
        disabled,
        icon
      }
    })
  }

  positionProps = [
    'width',
    'left'
  ]

  // reset
  resetWidth = () => {
    this.setState(this.initFromProps())
  }

  setClickFileId = (id) => {
    this.currentFileId = id
  }

  // 2026-09-02 coder(lq): Seed the context target for blank-space clicks so the first context menu is usable before any file row has been visited.
  handleContextMenu = (e) => {
    const target = e.target.closest('.' + fileItemCls)
    if (target) {
      return
    }
    if (this.props.emptyFileId) {
      this.setClickFileId('file-' + this.props.emptyFileId)
      this.props.modifier?.({
        selectedFiles: new Set(),
        selectedType: ''
      })
      this.forceUpdate()
    }
  }

  renderItem = (item, index) => {
    const { type } = this.props
    const cls = item.isParent ? 'parent-file-item' : 'real-file-item'
    const key = item.id ?? index + 'file-item'
    const fileProps = {
      ...this.props.getFileProps(item, type),
      cls,
      properties: this.state.properties,
      setClickFileId: this.setClickFileId
    }
    return (
      <FileSection
        {...fileProps}
        key={key}
      />
    )
  }

  onContextMenu = ({ key }) => {
    this.onToggleProp(key)
  }

  handleClick = (e) => {
    if (this.suppressNextClick) {
      this.suppressNextClick = false
      e.preventDefault()
      return
    }
    const target = e.target.closest('[data-id]')
    if (target) {
      const id = target.getAttribute('data-id')
      const refKey = 'file-' + id
      const ref = filesRef.get(refKey)
      if (ref) {
        ref.onClick(e)
      }
    }
  }

  handleDoubleClick = (e) => {
    const target = e.target.closest('[data-id]')
    if (target) {
      const id = target.getAttribute('data-id')
      const ref = filesRef.get('file-' + id)
      if (ref) {
        ref.transferOrEnterDirectory(e)
      }
    }
  }

  getClickedFile = () => {
    const current = filesRef.get(this.currentFileId)
    if (current) {
      return current
    }
    // 2026-09-02 coder(lq): Fall back to the virtual directory row so a freshly opened list has a complete context menu even before a file row is clicked.
    return this.props.emptyFileId
      ? filesRef.get('file-' + this.props.emptyFileId)
      : null
  }

  handleDropdownOpenChange = (open) => {
    if (open) {
      this.forceUpdate()
    }
  }

  onContextMenuFile = ({ key }) => {
    if (key !== 'more-submenu') {
      const inst = this.getClickedFile()
      if (inst) {
        inst[key]()
      }
    }
  }

  renderContextMenuFile = () => {
    const fileInst = this.getClickedFile()
    return fileInst ? fileInst.renderContextMenu() : []
  }

  renderParent = (type) => {
    const { parentItem } = this.props
    return parentItem
      ? this.renderItem(parentItem)
      : null
  }

  render () {
    const { fileList, height, type } = this.props
    const containerHeight = Math.max(0, height - 42 - 30 - 32 - 90)
    const props = {
      ref: this.containerRef,
      className: 'sftp-table-content overscroll-y relative',
      tabIndex: 0,
      role: 'listbox',
      'aria-label': type === 'local' ? '本地文件列表' : '远程文件列表',
      'aria-multiselectable': true,
      style: {
        height: containerHeight
      },
      draggable: false,
      onScroll: this.onScroll,
      onPointerDown: this.handlePointerDown,
      onKeyDown: this.handleKeyDown,
      onClick: this.handleClick,
      onDoubleClick: this.handleDoubleClick,
      onContextMenu: this.handleContextMenu,
      onDragOver: this.onDragOver,
      onDragEnter: this.onDragEnter,
      onDragLeave: this.onDragLeave,
      onDrop: this.onDrop,
      onDragEnd: this.onDragEnd
    }
    const cls = classnames('sftp-table relative')
    const ddProps = {
      menu: {
        items: this.renderContextMenuFile(),
        onClick: this.onContextMenuFile
      },
      trigger: ['contextMenu'],
      onOpenChange: this.handleDropdownOpenChange
    }
    return (
      <div className={cls}>
        {this.renderTableHeader()}
        <Dropdown {...ddProps}>
          <div
            {...props}
          >
            {
                this.props.renderEmptyFile(
                  type,
                  {
                    setClickFileId: this.setClickFileId
                  }
                )
            }
            {this.renderParent(type)}
            <PagedList
              ref={this.pagedListRef}
              list={fileList}
              renderItem={this.renderItem}
              scrollTop={this.state.scrollTop}
              containerHeight={containerHeight}
              itemSize={this.state.itemSize}
            />
            <div className='sftp-list-blank-space' role='note'>
              空白区域 · 右键可新建文件或文件夹
            </div>
            {this.renderMarquee()}
          </div>
        </Dropdown>
      </div>
    )
  }
}
