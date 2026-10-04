import { PureComponent, createRef } from 'react'
import {
  Button,
  Input
} from 'antd'
import message from '../common/message'
import {
  EditFilled,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons'
import { throttle } from 'lodash-es'
import { getKeyCharacter } from './get-key-char.js'

export default class ShortcutEdit extends PureComponent {
  state = {
    editMode: false,
    shortcut: '',
    data: null
  }

  containerRef = createRef()

  componentWillUnmount () {
    this.removeEventListener()
  }

  addEventListener = () => {
    document.addEventListener('click', this.handleClickOuter, true)
    document.addEventListener('keydown', this.handleKeyDown)
    document.addEventListener('mousewheel', this.handleKeyDown)
  }

  removeEventListener = () => {
    document.removeEventListener('click', this.handleClickOuter, true)
    document.removeEventListener('keydown', this.handleKeyDown)
    document.removeEventListener('mousewheel', this.handleKeyDown)
  }

  handleClickOuter = (e) => {
    const container = this.containerRef.current
    if (container && !container.contains(e.target)) {
      this.handleCancel()
    }
  }

  handleEditClick = () => {
    this.setState({
      editMode: true
    }, this.addEventListener)
  }

  handleCancel = () => {
    this.setState({
      editMode: false
    }, this.removeEventListener)
  }

  handleConfirm = () => {
    const {
      name
    } = this.props.data
    this.props.updateConfig(
      name, this.state.shortcut
    )
    this.handleCancel()
  }

  warnCtrolKey = throttle(() => {
    message.info(
      '快捷键必须包含 Ctrl、Shift、Alt 或 Meta 中的任意一个',
      undefined
    )
  }, 3000)

  warnExist = throttle(() => {
    message.info(
      '这个快捷键已被占用',
      undefined
    )
  }, 3000)

  handleKeyDown = (e) => {
    const {
      code,
      ctrlKey,
      shiftKey,
      metaKey,
      altKey,
      wheelDeltaY
    } = e
    e.preventDefault()
    e.stopPropagation()
    const codeName = e instanceof window.WheelEvent
      ? (wheelDeltaY > 0 ? 'mouseWheelUp' : 'mouseWheelDown')
      : code
    const codeK = getKeyCharacter(codeName)
    const noControlKey = !ctrlKey && !shiftKey && !metaKey && !altKey
    if (noControlKey && codeK === 'Escape') {
      return this.handleCancel()
    } else if (noControlKey) {
      return this.warnCtrolKey()
    }
    const r = (ctrlKey ? 'ctrl+' : '') +
      (metaKey ? 'meta+' : '') +
      (shiftKey ? 'shift+' : '') +
      (altKey ? 'alt+' : '') +
      codeK.toLowerCase()
    if (this.props.keysTaken[r]) {
      return this.warnExist()
    }
    this.setState({
      shortcut: r
    })
  }

  renderStatic () {
    const {
      shortcut
    } = this.props.data
    return (
      <Button
        className='edit-shortcut-button'
      >
        <span>{shortcut}</span>
        <button type='button' className='icon-button shortcut-edit-icon mg1l' aria-label='编辑快捷键' title='编辑快捷键' onClick={this.handleEditClick}><EditFilled /></button>
        {
          this.renderClear()
        }
      </Button>
    )
  }

  renderClear () {
    const { renderClear, handleClear, data } = this.props
    const hasShortcut = data && data.shortcut
    if (renderClear && hasShortcut && handleClear) {
      return (
        <button type='button' className='icon-button mg1l' aria-label='清除快捷键' title='清除快捷键' onClick={handleClear}><CloseOutlined /></button>
      )
    }
  }

  renderAfter () {
    const {
      shortcut
    } = this.state
    if (!shortcut) {
      return null
    }
    return (
      <>
        <button type='button' className='icon-button' aria-label='确认快捷键' title='确认快捷键' onClick={this.handleConfirm}><CheckOutlined /></button>
        <button type='button' className='icon-button mg1l' aria-label='取消编辑' title='取消编辑' onClick={this.handleCancel}><CloseOutlined /></button>
      </>
    )
  }

  render () {
    const {
      shortcut,
      editMode
    } = this.state
    if (!editMode) {
      return this.renderStatic()
    }
    return (
      <div ref={this.containerRef}>
        <Input
          suffix={this.renderAfter()}
          value={shortcut}
          className='shortcut-input'
        />
      </div>
    )
  }
}
