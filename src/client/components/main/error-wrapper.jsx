import React from 'react'
import { FrownOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import {
  packInfo,
  isMac,
  isWin
} from '../../common/constants'
import { copy } from '../../common/clipboard'

const e = window.translate
const os = isMac ? 'macOS' : isWin ? 'Windows' : 'Linux'
const productName = packInfo.productName || packInfo.name

const userDataPath = {
  macOS: '~/Library/Application\\ Support/electerm/users/default_user',
  Linux: '~/.config/electerm/users/default_user',
  Windows: 'C:\\Users\\你的用户名\\AppData\\Roaming\\electerm\\users\\default_user'
}

const backupCommand = {
  macOS: `cp -r ${userDataPath.macOS} ~/Desktop/yunduo_backup_${Date.now()}`,
  Linux: `cp -r ${userDataPath.Linux} ~/yunduo_backup_${Date.now()}`,
  Windows: `xcopy "${userDataPath.Windows}\\*" "%USERPROFILE%\\Desktop\\yunduo_backup_${Date.now()}" /E /I`
}

export default class ErrorBoundary extends React.PureComponent {
  constructor (props) {
    super(props)
    this.state = {
      hasError: false,
      error: {}
    }
  }

  componentDidCatch (error) {
    console.error(error)
    this.setState({
      hasError: true,
      error
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleCopyError = () => {
    const { message = '', stack = '' } = this.state.error
    copy(`${productName} ${packInfo.version}, ${os}\n${message}\n${stack}`)
  }

  renderTroubleShoot = () => {
    if (window.et.isWebApp) return null
    const command = backupCommand[os]
    return (
      <div className='pd1y wordbreak cn-error-help'>
        <h2>安全处理建议</h2>
        <p>重新加载仍无法恢复时，请先备份本机数据目录，再将错误信息交给产品维护人员。</p>
        <div className='cn-error-command'>
          <code>{command}</code>
          <CopyOutlined title='复制备份命令' onClick={() => copy(command)} />
        </div>
      </div>
    )
  }

  render () {
    if (this.state.hasError) {
      const { stack, message } = this.state.error
      return (
        <div className='pd3 error-wrapper'>
          <div className='cn-error-logo'>云</div>
          <h1>
            <FrownOutlined className='mg1r iblock' />
            <span className='iblock mg1r'>{productName}运行异常</span>
          </h1>
          <div className='cn-error-actions'>
            <Button onClick={this.handleReload} icon={<ReloadOutlined />} type='primary'>
              {e('reload')}
            </Button>
            <Button onClick={this.handleCopyError} icon={<CopyOutlined />}>
              复制错误信息
            </Button>
          </div>
          <div className='pd1y'><code>{message}</code></div>
          <div className='pd1y cn-error-stack'><pre>{stack}</pre></div>
          {this.renderTroubleShoot()}
        </div>
      )
    }
    return this.props.children
  }
}
