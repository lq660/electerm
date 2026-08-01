/**
 * settings page
 */

import { Component } from 'react'
import classnames from 'classnames'
import Drawer from '../common/drawer'
import { CloseCircleOutlined } from '@ant-design/icons'
import { ConfigProvider } from 'antd'
import { sidebarWidth } from '../../common/constants'
import AppDrag from '../tabs/app-drag'
import { getWorkbenchAntdTheme } from '../../common/workbench-theme'
import YunduoLogo from '../icons/yunduo-logo.jsx'
import './setting-wrap.styl'

export default class SettingWrap extends Component {
  renderDrag () {
    return (
      <AppDrag />
    )
  }

  render () {
    // 2026-07-03 coder(lq): The same drawer hosts resource, tool, and settings pages; use page metadata so users know which product area they are in.
    const pageMeta = this.props.pageMeta || {
      title: '管理中心',
      desc: '维护工作台资源、工具和系统配置',
      scope: '工作台',
      badge: '实时生效'
    }
    const pops = {
      open: this.props.visible,
      onClose: this.props.onCancel,
      className: classnames('setting-wrap', pageMeta.areaClass),
      size: this.props.innerWidth - sidebarWidth,
      zIndex: 888,
      placement: 'left'
    }
    const settingTheme = getWorkbenchAntdTheme(window.store.getUiThemeConfig())
    return (
      <ConfigProvider theme={settingTheme}>
        <Drawer
          {...pops}
        >
          <div className='cn-setting-header'>
            <div className='cn-setting-brand'>
              <span className='cn-setting-logo'>
                <YunduoLogo className='cn-setting-logo-mark' />
              </span>
              <span>
                <strong>{pageMeta.title}</strong>
                <em>{pageMeta.desc}</em>
              </span>
            </div>
            <div className='cn-setting-status'>
              <span>{pageMeta.scope}</span>
              <b>{pageMeta.badge}</b>
            </div>
          </div>
          <CloseCircleOutlined
            className='close-setting-wrap-icon close-setting-wrap'
            onClick={this.props.onCancel}
          />
          <CloseCircleOutlined
            className='close-setting-wrap alt-close-setting-wrap'
            onClick={this.props.onCancel}
          />
          {
            this.props.useSystemTitleBar ? null : <AppDrag />
          }
          {this.props.children}
        </Drawer>
      </ConfigProvider>
    )
  }
}
