/**
 * batch input module
 */

import { Component } from 'react'
import {
  AutoComplete,
  Button,
  Input,
  Popover
} from 'antd'
import {
  batchInputLsKey,
  terminalWebType,
  terminalRdpType,
  terminalVncType
} from '../../common/constants'
import TabSelect from './tab-select'
import classNames from 'classnames'
import deepCopy from 'json-deep-copy'

const e = window.translate

export default class BatchInput extends Component {
  constructor (props) {
    super(props)
    this.state = {
      cmd: '',
      open: false,
      enter: false
    }
  }

  componentWillUnmount () {
    clearTimeout(this.timer)
  }

  handleSubmitCommand = (e) => {
    const { batchInputSelectedTabIds } = window.store
    const { cmd } = this.state
    if (!cmd.trim()) {
      return
    }
    window.store.addBatchInput(cmd)
    this.props.input(cmd, Array.from(batchInputSelectedTabIds))
    this.setState({
      cmd: '',
      open: false
    })
    e.stopPropagation()
  }

  handleEnter = (e) => {
    this.handleSubmitCommand(e)
  }

  handleMultilineKeyDown = (e) => {
    if (e.key !== 'Enter' || (!e.ctrlKey && !e.metaKey)) {
      return
    }
    this.handleSubmitCommand(e)
  }

  handleChange = (v = '') => {
    let vv = v.replace(/^\d+:/, '').replace(/\n$/, '')
    if (vv === batchInputLsKey) {
      window.store.clearBatchInput()
      vv = ''
    }
    this.setState({
      cmd: vv,
      open: false
    })
  }

  handleTextAreaChange = (e) => {
    this.setState({
      cmd: e.target.value
    })
  }

  handleSelectHistory = (cmd) => {
    this.setState({
      cmd
    })
  }

  handleClearHistory = () => {
    window.store.clearBatchInput()
  }

  handleClick = () => {
    this.setState({
      open: true
    })
    window.store.filterBatchInputSelectedTabIds()
  }

  handleBlur = () => {
    this.setState({
      open: false
    })
  }

  mapper = (v, i) => {
    return {
      value: `${i}:${v}`,
      label: v
    }
  }

  renderClear = () => {
    return {
      value: batchInputLsKey,
      label: e('clear')
    }
  }

  buildOptions = () => {
    const arr = this.props.batchInputs.map(this.mapper)
    if (arr.length) {
      return [
        ...arr,
        this.renderClear()
      ]
    }
    return []
  }

  renderMultilineHistory = () => {
    const { batchInputs = [] } = this.props
    if (!batchInputs.length) {
      return (
        <Button
          size='small'
          disabled
        >
          历史
        </Button>
      )
    }
    const content = (
      <div className='batch-input-history-popover'>
        <div className='batch-input-history-head'>
          <strong>历史命令</strong>
          <span onClick={this.handleClearHistory}>清空</span>
        </div>
        <div className='batch-input-history-list'>
          {
            batchInputs.map((item, index) => (
              <button
                key={`${index}-${item}`}
                onClick={() => this.handleSelectHistory(item)}
                title={item}
              >
                {item}
              </button>
            ))
          }
        </div>
      </div>
    )
    return (
      <Popover
        content={content}
        trigger='click'
        placement='topRight'
      >
        <Button size='small'>历史</Button>
      </Popover>
    )
  }

  handleMouseEnter = () => {
    clearTimeout(this.timer)
    this.setState({
      enter: true
    })
  }

  leave = () => {
    this.setState({
      enter: false
    })
  }

  handleMouseLeave = () => {
    this.timer = setTimeout(this.leave, 5000)
  }

  getTabs = () => {
    const { activeTabId } = this.props
    return deepCopy(this.props.tabs.filter(tab => {
      return tab.type !== terminalWebType &&
        tab.type !== terminalRdpType &&
        tab.type !== terminalVncType
    })).sort((a, b) => {
      // Current tab goes first
      if (a.id === activeTabId) return -1
      if (b.id === activeTabId) return 1
      return 0
    })
  }

  render () {
    const { cmd, open, enter } = this.state
    const {
      batchInputSelectedTabIds
    } = this.props
    const opts = {
      options: this.buildOptions(),
      value: cmd,
      onChange: this.handleChange,
      defaultOpen: false,
      open,
      className: 'batch-input-wrap'
    }
    const cls = classNames(
      'batch-input-outer',
      {
        'bi-show': open || enter
      }
    )
    const placeholder = this.props.placeholder || e('batchInput')
    const inputProps = {
      size: 'small',
      placeholder,
      className: 'batch-input-holder'
    }
    const textAreaProps = {
      onPressEnter: this.handleEnter,
      onClick: this.handleClick,
      onBlur: this.handleBlur,
      size: 'small',
      autoSize: { minRows: 1 },
      placeholder,
      allowClear: true
    }
    const tabSelectProps = {
      activeTabId: this.props.activeTabId,
      tabs: this.getTabs(),
      selectedTabIds: batchInputSelectedTabIds,
      onSelectAll: window.store.selectAllBatchInputTabs,
      onSelectNone: window.store.selectNoneBatchInputTabs,
      onSelect: window.store.onSelectBatchInputSelectedTabId
    }
    if (this.props.multiline) {
      return (
        <div className='batch-input-outer batch-input-multiline'>
          <Input.TextArea
            value={cmd}
            onChange={this.handleTextAreaChange}
            onKeyDown={this.handleMultilineKeyDown}
            onClick={this.handleClick}
            size='small'
            rows={this.props.rows || 5}
            placeholder={placeholder}
          />
          <div className='batch-input-multiline-actions'>
            <span>Ctrl/Cmd+Enter 发送</span>
            {this.renderMultilineHistory()}
            <Button
              type='primary'
              size='small'
              onClick={this.handleSubmitCommand}
              disabled={!cmd.trim()}
            >
              发送
            </Button>
          </div>
          <TabSelect {...tabSelectProps} />
        </div>
      )
    }
    return (
      <span
        className={cls}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
      >
        <span className='bi-compact'>
          <Input
            {...inputProps}
          />
        </span>
        <span className='bi-full'>
          <AutoComplete
            {...opts}
          >
            <Input.TextArea
              {...textAreaProps}
            />
          </AutoComplete>
          <TabSelect {...tabSelectProps} />
        </span>
      </span>
    )
  }
}
