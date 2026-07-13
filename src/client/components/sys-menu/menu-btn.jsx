/**
 * btns
 */

import { PureComponent } from 'react'
import {
  Popover
} from 'antd'
import {
  AppstoreOutlined
} from '@ant-design/icons'
import { shortcutDescExtend } from '../shortcuts/shortcut-handler.js'
import MenuRender from './sys-menu.jsx'
import { refsStatic } from '../common/ref.js'

class MenuBtn extends PureComponent {
  componentDidMount () {
    refsStatic.add('menu-btn', this)
  }

  onNewSsh = () => {
    window.store.onNewSsh()
  }

  addTab = () => {
    window.store.addTab()
  }

  openAbout = () => {
    window.store.openAbout()
  }

  openSetting = () => {
    window.store.openSetting()
  }

  openDevTools = () => {
    window.pre.runGlobalAsync('openDevTools')
  }

  minimize = () => {
    window.pre.runGlobalAsync('minimize')
  }

  maximize = () => {
    window.pre.runGlobalAsync('maximize')
  }

  reload = () => {
    window.location.reload()
  }

  onCheckUpdate = () => {
    window.store.onCheckUpdate(true)
  }

  restart = () => {
    window.store.restart()
  }

  close = () => {
    window.store.exit()
  }

  renderContext = () => {
    const items = [
      {
        type: 'group',
        text: '常用操作'
      },
      {
        func: 'onNewSsh',
        icon: 'CodeFilled',
        text: '新建连接',
        subText: this.getShortcut('app_newBookmark')
      }
    ]
    if (window.store.hasNodePty) {
      items.push({
        func: 'addTab',
        icon: 'RightSquareFilled',
        text: '新建本地终端',
        subText: this.getShortcut('app_newTab')
      })
    }
    items.push({
      type: 'group',
      text: '资源与窗口'
    })
    items.push({
      noCloseMenu: true,
      icon: 'BookOutlined',
      text: '服务器资源',
      submenu: 'Bookmark'
    })
    items.push(
      {
        noCloseMenu: true,
        icon: 'ClockCircleOutlined',
        text: '最近连接',
        submenu: 'History'
      },
      {
        noCloseMenu: true,
        icon: 'BarsOutlined',
        text: '已打开会话',
        submenu: 'Tabs'
      },
      {
        icon: 'AppstoreOutlined',
        text: '窗口布局',
        submenu: 'Layout'
      },
      {
        type: 'group',
        text: '应用设置'
      },
      {
        func: 'openAbout',
        icon: 'InfoCircleOutlined',
        text: '关于云舵'
      },
      {
        func: 'openSetting',
        icon: 'SettingOutlined',
        text: '设置中心'
      },
      {
        func: 'openDevTools',
        icon: 'LeftSquareFilled',
        text: '开发者工具',
        className: 'context-item-secondary'
      },
      {
        type: 'group',
        text: '显示与窗口'
      },
      {
        module: 'Zoom'
      },
      {
        func: 'minimize',
        icon: 'SwitcherFilled',
        text: '最小化'
      },
      {
        func: 'maximize',
        icon: 'LayoutFilled',
        text: '最大化'
      },
      {
        func: 'reload',
        icon: 'ReloadOutlined',
        text: '重新加载'
      },
      {
        type: 'group',
        text: '维护'
      },
      {
        func: 'onCheckUpdate',
        icon: 'UpCircleOutlined',
        text: '检查更新'
      },
      {
        func: 'restart',
        icon: 'RedoOutlined',
        text: '重启应用'
      },
      {
        func: 'close',
        icon: 'CloseOutlined',
        text: '退出应用',
        className: 'context-item-danger'
      }
    )
    return items
  }

  renderMenu () {
    const { store } = window
    const rprops = {
      items: this.renderContext(),
      tabs: store.getTabs(),
      config: store.config,
      history: store.history
    }
    return (
      <MenuRender {...rprops} />
    )
  }

  render () {
    const pops = {
      className: 'menu-control',
      onMouseDown: evt => evt.preventDefault(),
      onClick: this.openMenu,
      title: '菜单'
    }
    const popProps = {
      content: this.renderMenu(),
      // open: this.state.opened,
      placement: 'right',
      trigger: ['click'],
      overlayClassName: 'cn-app-menu-popover',
      rootClassName: 'cn-app-menu-popover',
      styles: {
        body: {
          padding: 0,
          background: 'transparent',
          boxShadow: 'none'
        }
      }
    }
    return (
      <Popover {...popProps}>
        <div
          {...pops}
        >
          <span
            className='menu-logo cn-menu-logo-mark'
          >
            <AppstoreOutlined />
          </span>
        </div>
      </Popover>
    )
  }
}

export default shortcutDescExtend(MenuBtn)
