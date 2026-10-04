/**
 * settings page
 */

import { Component } from 'react'
import classnames from 'classnames'
import Drawer from '../common/drawer'
import { CloseOutlined } from '@ant-design/icons'
import { ConfigProvider } from 'antd'
import { getWorkbenchAntdTheme } from '../../common/workbench-theme'
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
  // 2026-09-22 coder(lq): Mask, Escape and the close button all use one safe dismiss path; Drawer may call it without a DOM event.
  handleClose = (event) => {
    event?.preventDefault()
    event?.stopPropagation()
    if (typeof this.props.onCancel === 'function') {
      this.props.onCancel()
    }
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
      onClose: this.handleClose,
      className: classnames('setting-wrap', pageMeta.areaClass),
      zIndex: 1200,
      variant: 'modal',
      ariaLabelledBy: 'setting-dialog-title'
    }
    const settingTheme = getCompactSettingTheme(window.store.getUiThemeConfig())
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
                <strong id='setting-dialog-title'>{pageMeta.title}</strong>
                <em>{pageMeta.desc}</em>
              </span>
            </div>
            <div className='cn-setting-status'>
              <span>{pageMeta.scope}</span>
              <b>{pageMeta.badge}</b>
            </div>
          </div>
          <button
            type='button'
            className='close-setting-wrap close-setting-button'
            aria-label={`关闭${pageMeta.title}`}
            title={`关闭${pageMeta.title}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={this.handleClose}
          >
            <CloseOutlined />
          </button>
          {this.props.children}
        </Drawer>
      </ConfigProvider>
    )
  }
}
