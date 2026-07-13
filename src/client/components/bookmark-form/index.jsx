/**
 * Config-driven bookmark form (drop-in replacement)
 */
import { PureComponent } from 'react'
import { Radio, Button } from 'antd'
import {
  settingMap,
  connectionMap,
  terminalSerialType,
  terminalWebType,
  terminalRdpType,
  terminalVncType,
  terminalLocalType,
  terminalTelnetType,
  terminalFtpType,
  newBookmarkIdPrefix,
  terminalSpiceType
} from '../../common/constants'
import { createTitleWithTag } from '../../common/create-title'
import { LoadingOutlined, BookOutlined, RobotOutlined } from '@ant-design/icons'
import sessionConfig from './config/session-config'
import renderForm from './render-form'
import AIBookmarkForm from './ai-bookmark-form'
import './bookmark-form.styl'

const e = window.translate

const cnTypeNames = {
  ssh: 'SSH/SFTP',
  local: '本地终端',
  telnet: 'Telnet',
  serial: '串口',
  rdp: '远程桌面',
  vnc: 'VNC',
  ftp: 'FTP/SFTP',
  web: 'Web 入口',
  spice: 'SPICE'
}

export default class BookmarkIndex2 extends PureComponent {
  constructor (props) {
    super(props)
    let initType = props.formData.type
    if (![
      terminalTelnetType,
      terminalWebType,
      terminalLocalType,
      terminalSerialType,
      terminalRdpType,
      terminalVncType,
      terminalFtpType,
      terminalSpiceType
    ].includes(initType)) {
      initType = connectionMap.ssh
    }
    const v = this.getInitAiModeState()
    this.state = {
      ready: v,
      bookmarkType: initType,
      aiMode: v
    }
  }

  componentDidMount () {
    this.timer = setTimeout(() => {
      this.setState({ ready: true })
    }, 75)
  }

  componentWillUnmount () {
    clearTimeout(this.timer)
    clearTimeout(this.timer1)
  }

  getInitAiModeState () {
    const v = window.et.openBookmarkWithAIMode
    if (v !== true) {
      return false
    }
    this.timer1 = setTimeout(() => {
      delete window.et.openBookmarkWithAIMode
    }, 1000)

    return true
  }

  handleChange = (e) => {
    this.setState({ bookmarkType: e.target.value })
  }

  handleCancelAiMode = () => {
    this.setState({ aiMode: false })
  }

  handleToggleAIMode = () => {
    if (window.store.aiConfigMissing()) {
      window.store.toggleAIConfig()
      return
    }
    this.setState(prev => ({ aiMode: !prev.aiMode }))
  }

  renderTypes (bookmarkType, isNew, keys) {
    if (!isNew || this.state.aiMode) return null
    const filtered = window.et && Array.isArray(window.et.supportSessionTypes)
      ? keys.filter(k => window.et.supportSessionTypes.includes(k))
      : keys
    return (
      <Radio.Group
        buttonStyle='solid'
        size='small'
        className='mg1l'
        value={bookmarkType}
        disabled={!isNew}
        onChange={this.handleChange}
      >
        {filtered.map(v => {
          const txt = cnTypeNames[v] || e(v)
          return (<Radio.Button key={v} value={v}>{txt}</Radio.Button>)
        })}
      </Radio.Group>
    )
  }

  renderTitle (formData, isNew) {
    if (isNew) return null
    return (
      <b className='mg1x'>
        {createTitleWithTag(formData)}
      </b>
    )
  }

  renderAIButton (isNew) {
    if (!isNew || this.state.aiMode) {
      return null
    }
    return (
      <Button
        size='small'
        className='mg2l create-ai-btn'
        icon={<RobotOutlined />}
        onClick={this.handleToggleAIMode}
      >
        {e('createBookmarkByAI')}
      </Button>
    )
  }

  renderAiForm () {
    return (
      <AIBookmarkForm
        onCancel={this.handleCancelAiMode}
      />
    )
  }

  renderForm () {
    const { bookmarkType, aiMode } = this.state
    if (aiMode) {
      return this.renderAiForm()
    }
    return renderForm(bookmarkType, this.props)
  }

  render () {
    const { formData } = this.props
    const { id = '' } = formData
    const { type } = this.props
    if (type !== settingMap.bookmarks) return null
    const { ready, bookmarkType } = this.state
    if (!ready) {
      return (
        <div className='pd3 aligncenter'>
          <LoadingOutlined />
        </div>
      )
    }
    const isNew = id.startsWith(newBookmarkIdPrefix)
    const keys = Object.keys(sessionConfig)
    return (
      <div className='form-wrap pd1x cn-bookmark-form'>
        <div className='form-title pd1t pd1x pd2b bold cn-bookmark-form-title'>
          <div className='cn-bookmark-title-main'>
            <BookOutlined className='mg1r' />
            <span>
              {!isNew ? '编辑服务器连接' : '新建服务器连接'}
            </span>
            {this.renderTitle(formData, isNew)}
          </div>
          <div className='cn-bookmark-title-sub'>
            服务器资源详情页，用于维护协议、账号、认证方式和连接高级参数
          </div>
          <div className='cn-bookmark-type-row'>
            {this.renderTypes(bookmarkType, isNew, keys)}
            {this.renderAIButton(isNew)}
          </div>
        </div>
        {this.renderForm()}
      </div>
    )
  }
}
