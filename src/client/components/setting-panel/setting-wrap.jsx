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
import { getZoomPercent } from '../../common/zoom-display'
import YunduoLogo from '../icons/yunduo-logo.jsx'
import './setting-wrap.styl'

function getCompactSettingTheme (themeConfig) {
  const base = getWorkbenchAntdTheme(themeConfig)
  const baseComponents = base.components || {}
  return {
    ...base,
    token: {
      ...base.token,
      fontSize: 13,
      fontSizeSM: 12,
      fontSizeLG: 14,
      controlHeight: 32,
      controlHeightSM: 28,
      controlHeightLG: 36,
      lineHeight: 1.45
    },
    components: {
      ...baseComponents,
      Button: {
        ...(baseComponents.Button || {}),
        controlHeight: 32,
        controlHeightSM: 28,
        controlHeightLG: 36,
        fontSize: 13,
        fontSizeSM: 12,
        paddingInline: 12,
        paddingInlineSM: 8
      },
      Form: {
        ...(baseComponents.Form || {}),
        labelFontSize: 13,
        marginLG: 14,
        marginSM: 8
      },
      Input: {
        ...(baseComponents.Input || {}),
        controlHeight: 32,
        controlHeightLG: 36,
        fontSize: 13
      },
      InputNumber: {
        ...(baseComponents.InputNumber || {}),
        controlHeight: 32,
        fontSize: 13
      },
      Modal: {
        ...(baseComponents.Modal || {}),
        titleFontSize: 15
      },
      Select: {
        ...(baseComponents.Select || {}),
        controlHeight: 32,
        controlHeightLG: 36,
        fontSize: 13
      },
      Table: {
        ...(baseComponents.Table || {}),
        cellFontSize: 13,
        cellFontSizeSM: 12
      },
      Tabs: {
        ...(baseComponents.Tabs || {}),
        titleFontSize: 13,
        titleFontSizeLG: 13,
        titleFontSizeSM: 12
      }
    }
  }
}

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
    const settingTheme = getCompactSettingTheme(window.store.getUiThemeConfig())
    const zoomPercent = getZoomPercent(window.store.config?.zoom)
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
              <span>缩放 {zoomPercent}%</span>
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
