import React, { Component } from 'react'
import {
  ArrowRightOutlined,
  LoadingOutlined,
  SunOutlined,
  MoonOutlined
} from '@ant-design/icons'
import message from '../common/message'
import { notification } from '../common/notification'
import {
  Select,
  Switch,
  Button,
  Table,
  Space,
  Tag
} from 'antd'
import deepCopy from 'json-deep-copy'
import Password from '../common/password'
import InputConfirm from '../common/input-confirm'
import InputNumberConfirm from '../common/input-number-confirm'
import TextareaConfirm from '../common/textarea-confirm'
import {
  settingMap,
  proxyHelpLink
} from '../../common/constants'
import defaultSettings from '../../common/default-setting'
import Link from '../common/external-link'
import { isNumber, isNaN } from 'lodash-es'
import createEditLangLink from '../../common/create-lang-edit-link'
import StartSession from './start-session-select'
import HelpIcon from '../common/help-icon'
import delay from '../../common/wait.js'
import isColorDark from '../../common/is-color-dark'
import getThemeDisplayName from '../../common/get-theme-display-name'
import DeepLinkControl from './deep-link-control'
import HotkeySetting from './hotkey'
import './setting.styl'

const { Option } = Select
const e = window.translate

export default class SettingCommon extends Component {
  state = {
    ready: false,
    submittingPass: false,
    passInputFocused: false,
    placeholderLogin: window.pre.requireAuth ? '********' : e('notSet'),
    loginPass: ''
  }

  componentDidMount () {
    this.timer = setTimeout(() => {
      this.setState({
        ready: true
      })
    }, 0)
  }

  componentWillUnmount () {
    clearTimeout(this.timer)
    clearTimeout(this.timer1)
  }

  handleLoginSubmit = async () => {
    if (this.submitting) {
      return
    }
    this.submitting = true
    this.setState({
      submittingPass: true
    })
    const pass = this.state.loginPass
    const r = await window.pre.runGlobalAsync(
      'setPassword',
      pass
    )
    await delay(600)
    if (r === true) {
      window.pre.requireAuth = !!pass
      this.setState({
        loginPass: pass ? '********' : '',
        submittingPass: false,
        placeholderLogin: pass ? '********' : e('notSet')
      }, () => {
        this.submitting = false
      })
      message.success('已保存')
    } else {
      this.setState({
        submittingPass: false
      }, () => {
        this.submitting = false
      })
    }
  }

  handleLoginPassFocus = () => {
    this.setState({
      passInputFocused: true
    })
  }

  blurPassInput = () => {
    this.setState({
      passInputFocused: false
    })
  }

  handleLoginPassBlur = () => {
    this.timer1 = setTimeout(
      this.blurPassInput, 300
    )
  }

  handleChangeLoginPass = e => {
    this.setState({
      loginPass: e.target.value
    })
  }

  handleResetAll = () => {
    this.saveConfig(
      deepCopy(defaultSettings)
    )
  }

  onChangeTimeout = sshReadyTimeout => {
    return this.saveConfig({
      sshReadyTimeout
    })
  }

  handleChangeLang = async language => {
    await this.saveConfig({
      language
    })
    notification.info({
      message: (
        <div>
          {e('saveLang')}
          <Button
            onClick={() => window.location.reload()}
            className='mg1l'
            size='small'
          >
            {e('restartNow')}
          </Button>
        </div>
      )
    })
  }

  handleChangeTerminalTheme = id => {
    this.props.store.setTheme(id)
  }

  handleCustomCss = (value) => {
    this.onChangeValue(value, 'customCss')
  }

  onChangeValue = (value, name) => {
    if (name === 'useSystemTitleBar') {
      message.info(e('useSystemTitleBarTip'), 5)
    }
    if (name === 'disableConnectionHistory' && value) {
      window.store.history = []
    }
    this.saveConfig({
      [name]: value
    })
  }

  onChangeStartSessions = value => {
    this.onChangeValue(value, 'onStartSessions')
  }

  saveConfig = async (ext) => {
    const { config } = this.props
    if (ext.hotkey && ext.hotkey !== config.hotkey) {
      const res = await window.pre.runGlobalAsync('changeHotkey', ext.hotkey)
      if (!res) {
        message.warning(e('hotkeyNotOk'))
        delete ext.hotkey
      } else {
        message.success(e('saved'))
      }
    }
    this.props.store.setConfig(ext)
  }

  renderSection = (title, desc, children, cls = '') => {
    return (
      <section className={`cn-settings-section ${cls}`}>
        <div className='cn-settings-section-title'>
          <strong>{title}</strong>
          {
            desc
              ? <span>{desc}</span>
              : null
          }
        </div>
        <div className='cn-settings-section-body'>
          {children}
        </div>
      </section>
    )
  }

  renderField = (label, children, desc = '') => {
    return (
      <div className='cn-settings-field'>
        <div className='cn-settings-label'>
          <strong>{label}</strong>
          {
            desc
              ? <span>{desc}</span>
              : null
          }
        </div>
        <div className='cn-settings-control'>
          {children}
        </div>
      </div>
    )
  }

  renderToggle = (name, extra = null) => {
    const checked = !!this.props.config[name]
    return (
      <div className='pd2b cn-settings-toggle' key={'rt' + name}>
        <Switch
          checked={checked}
          checkedChildren={e(name)}
          unCheckedChildren={e(name)}
          onChange={v => this.onChangeValue(v, name)}
        />
        {isNumber(extra) ? null : extra}
      </div>
    )
  }

  renderNumber = (name, options, title = '') => {
    let value = this.props.config[name]
    if (options.valueParser) {
      value = options.valueParser(value)
    }
    const defaultValue = defaultSettings[name]
    const {
      step = 1,
      min,
      max,
      cls,
      onChange = (v) => {
        this.onChangeValue(v, name)
      }
    } = options
    const opts = {
      step,
      value,
      min,
      max,
      onChange,
      placeholder: defaultValue
    }
    if (title) {
      opts.formatter = v => `${title}${options.extraDesc || ''}: ${v}`
      opts.parser = (v) => {
        let vv = isNumber(v)
          ? v
          : Number(v.split(': ')[1], 10)
        if (isNaN(vv)) {
          vv = defaultValue
        }
        return vv
      }
    }
    return (
      <div className={`pd2b ${cls || ''}`}>
        <InputNumberConfirm
          {...opts}
        />
      </div>
    )
  }

  renderText = (name, placeholder) => {
    const value = this.props.config[name]
    const defaultValue = defaultSettings[name]
    const onChange = (v) => this.onChangeValue(v, name)
    return (
      <div className='pd2b'>
        <InputConfirm
          value={value}
          onChange={onChange}
          placeholder={placeholder || defaultValue}
        />
      </div>
    )
  }

  renderTextExec = (name) => {
    const agrsProp = `${name}Args`
    const args = this.props.config[agrsProp]
    const value = this.props.config[name]
    const defaultValue = defaultSettings[name]
    const onChange = (v) => this.onChangeValue(v, name)
    const onChangeArgs = (v) => this.onChangeValue(v, agrsProp)
    const styleArg = {
      style: {
        width: '40%'
      }
    }
    return (
      <div className='pd2b'>
        <Space.Compact className='width-100'>
          <InputConfirm
            value={value}
            onChange={onChange}
            placeholder={defaultValue}
          />
          <Select
            {...styleArg}
            placeholder={e('args')}
            onChange={onChangeArgs}
            value={args}
            mode='tags'
          >
            {
              args.map((arg, i) => {
                return (
                  <Option key={arg + '__' + i} value={arg}>
                    {arg}
                  </Option>
                )
              })
            }
          </Select>
        </Space.Compact>
      </div>
    )
  }

  renderReset = () => {
    return (
      <div className='pd1b pd1t'>
        <Button
          onClick={this.handleResetAll}
        >
          {e('resetAllToDefault')}
        </Button>
      </div>
    )
  }

  renderProxy () {
    const {
      enableGlobalProxy
    } = this.props.config
    const helps = `http# http://proxy-server-over-tcp.com:3128
      https#https://proxy-server-over-tls.com:3129
      socks(v5)#socks://username:password@some-socks-proxy.com:9050 (username & password are optional)
      socks5#socks5://username:password@some-socks-proxy.com:9050 (username & password are optional)
      socks5h#socks5h://username:password@some-socks-proxy.com:9050 (username & password are optional)
      socks4#socks4://some-socks-proxy.com:9050
      socks4a#socks4a://some-socks-proxy.com:9050`
      .split('\n')
      .filter(d => d.trim())
      .map(d => {
        const [protocol, example] = d.split('#')
        return {
          protocol, example
        }
      })
    const cols = Object.keys(helps[0]).map(k => {
      return {
        title: k,
        dataIndex: k,
        key: k,
        render: (k) => k || ''
      }
    })
    const table = (
      <div>
        <Table
          columns={cols}
          dataSource={helps}
          bordered
          pagination={false}
          size='small'
          rowKey='protocol'
        />
        <div>
          <Link to={proxyHelpLink}>{proxyHelpLink}</Link>
        </div>
      </div>
    )
    const style = {
      height: '414px',
      width: '500px'
    }
    return (
      <div className='cn-settings-proxy'>
        <div className='cn-settings-inline-head'>
          <strong>
            {e('global')} {e('proxy')}
          </strong>
          <HelpIcon
            title={table}
            style={{ body: { style } }}
          />
          <Switch
            checked={enableGlobalProxy}
            onChange={v => {
              this.onChangeValue(v, 'enableGlobalProxy')
            }}
          />
        </div>
        {
          this.renderText('proxy', 'socks5://127.0.0.1:1080')
        }
      </div>
    )
  }

  renderLoginPassAfter () {
    const {
      loginPass,
      submittingPass,
      passInputFocused
    } = this.state
    if (!loginPass && !passInputFocused) {
      return null
    } else if (
      submittingPass
    ) {
      return <LoadingOutlined />
    }
    return (
      <ArrowRightOutlined
        className='pointer'
        onClick={this.handleLoginSubmit}
      />
    )
  }

  renderLoginPass () {
    if (window.et.isWebApp) {
      return null
    }
    const {
      loginPass,
      submittingPass,
      placeholderLogin
    } = this.state
    const props = {
      value: loginPass,
      disabled: submittingPass,
      onFocus: this.handleLoginPassFocus,
      onBlur: this.handleLoginPassBlur,
      onChange: this.handleChangeLoginPass,
      suffix: this.renderLoginPassAfter(),
      placeholder: placeholderLogin
    }
    return (
      <div>
        <div className='pd1b'>{e('loginPassword')}</div>
        <div className='pd2b'>
          <Password
            {...props}
          />
        </div>
      </div>
    )
  }

  render () {
    const { ready } = this.state
    if (!ready) {
      return (
        <div className='pd3 aligncenter'>
          <LoadingOutlined />
        </div>
      )
    }
    const { props } = this
    const {
      hotkey,
      language,
      theme,
      customCss
    } = props.config
    const {
      langs = []
    } = window.et
    const terminalThemes = props.store.getSidebarList(settingMap.terminalThemes)
    const pops = {
      onStartSessions: props.config.onStartSessions,
      bookmarks: props.bookmarks,
      bookmarkGroups: props.bookmarkGroups,
      workspaces: props.store.workspaces,
      onChangeStartSessions: this.onChangeStartSessions
    }
    const hotkeyProps = {
      hotkey,
      onSaveConfig: this.saveConfig
    }
    return (
      <div className='form-wrap pd1y pd2x'>
        <div className='cn-setting-card-title'>
          <strong>{e('settings')}</strong>
          <span>常用偏好、网络连接和安全行为</span>
        </div>
        {
          this.renderSection(
            '基础行为',
            '启动、语言、主题和外观',
            <>
              <HotkeySetting
                {...hotkeyProps}
              />
              {
                this.renderField(
                  e('onStartBookmarks'),
                  <StartSession {...pops} />,
                  '打开应用后自动进入常用连接或工作区'
                )
              }
              {
                this.renderField(
                  e('uiThemes'),
                  <Select
                    onChange={this.handleChangeTerminalTheme}
                    popupMatchSelectWidth={false}
                    value={theme}
                  >
                    {
                      terminalThemes
                        .filter(d => d.id && d.name && d.uiThemeConfig)
                        .map(l => {
                          const { id, uiThemeConfig } = l
                          const displayName = getThemeDisplayName(l)
                          const { main, text } = uiThemeConfig
                          const isDark = isColorDark(main)
                          const txt = isDark ? <MoonOutlined /> : <SunOutlined />
                          const tag = (
                            <Tag
                              color={main}
                              className='mg1l'
                              variant='solid'
                              style={
                                {
                                  color: text
                                }
                              }
                            >
                              {txt}
                            </Tag>
                          )
                          return (
                            <Option key={id} value={id}>
                              {tag} {displayName}
                            </Option>
                          )
                        })
                    }
                  </Select>
                )
              }
              {
                this.renderField(
                  e('language'),
                  <>
                    <Select
                      onChange={this.handleChangeLang}
                      value={language}
                      popupMatchSelectWidth={false}
                    >
                      {
                        langs.map(l => {
                          const { id, name } = l
                          return (
                            <Option key={id} value={id}>{name}</Option>
                          )
                        })
                      }
                    </Select>
                    <Link className='mg1l' to={createEditLangLink(language)}>{e('edit')}</Link>
                  </>
                )
              }
              {
                this.renderField(
                  e('opacity'),
                  this.renderNumber('opacity', {
                    step: 0.05,
                    min: 0,
                    max: 1,
                    cls: 'opacity'
                  }, e('opacity')),
                  '窗口透明度'
                )
              }
              {
                this.renderField(
                  e('customCss'),
                  <TextareaConfirm
                    onChange={this.handleCustomCss}
                    value={customCss}
                    rows={3}
                  />,
                  '仅用于本机界面微调'
                )
              }
            </>
          )
        }
        {
          this.renderSection(
            '网络与连接',
            '代理、超时和保活策略',
            <>
              {this.renderProxy()}
              {
                this.renderField(
                  e('timeoutDesc'),
                  this.renderNumber('sshReadyTimeout', {
                    step: 200,
                    min: 100,
                    cls: 'timeout-desc'
                  }, e('timeoutDesc'))
                )
              }
              {
                this.renderField(
                  e('keepaliveIntervalDesc'),
                  this.renderNumber('keepaliveInterval', {
                    step: 1000,
                    min: 0,
                    max: 20000000,
                    cls: 'keepalive-interval-desc',
                    extraDesc: '(ms)'
                  }, e('keepaliveIntervalDesc')),
                  '单位 ms，设置为 0 表示关闭'
                )
              }
            </>
          )
        }
        {
          this.renderSection(
            '默认终端命令',
            '按系统指定本地终端启动命令',
            <>
              {this.renderField('Windows 默认命令', this.renderTextExec('execWindows'))}
              {this.renderField('macOS 默认命令', this.renderTextExec('execMac'))}
              {this.renderField('Linux 默认命令', this.renderTextExec('execLinux'))}
              {this.renderField(e('keyword2FA'), this.renderText('keyword2FA'))}
            </>
          )
        }
        {
          this.renderSection(
            '系统行为',
            '文件、历史、更新和窗口行为',
            <div className='cn-settings-toggle-grid'>
              {
                [
                  'autoRefreshWhenSwitchToSftp',
                  'showHiddenFilesOnSftpStart',
                  'screenReaderMode',
                  'initDefaultTabOnStart',
                  'disableConnectionHistory',
                  'disableTransferHistory',
                  'checkUpdateOnStart',
                  'useSystemTitleBar',
                  'confirmBeforeExit',
                  'hideIP',
                  'allowMultiInstance',
                  'disableDeveloperTool',
                  'debug'
                ].map(this.renderToggle)
              }
            </div>
          )
        }
        {
          this.renderSection(
            '安全与重置',
            '登录密码、系统唤起和恢复默认',
            <>
              {
                window.et.isWebApp ? null : <DeepLinkControl />
              }
              {this.renderLoginPass()}
              {this.renderReset()}
            </>
          )
        }
      </div>
    )
  }
}
