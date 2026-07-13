import {
  BgColorsOutlined,
  CloudServerOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  SyncOutlined,
  UpCircleOutlined,
  ToolOutlined
} from '@ant-design/icons'
import { Dropdown, Tooltip } from 'antd'
import SideBarPanel from './sidebar-panel'
import TransferList from './transfer-list'
import MenuBtn from '../sys-menu/menu-btn'
import {
  sidebarWidth,
  settingMap,
  modals
} from '../../common/constants'
import SideIcon from './side-icon'
import SidePanel from './side-panel'
import hasActiveInput from '../../common/has-active-input'
import './sidebar.styl'

const e = window.translate

export default function Sidebar (props) {
  const {
    height,
    upgradeInfo,
    settingTab,
    isSyncingSetting,
    leftSidebarWidth,
    pinned,
    fileTransfers,
    openedSideBar,
    transferHistory,
    transferTab,
    showModal,
    showInfoModal,
    sidebarPanelTab,
    openWidgetsModal
  } = props

  const { store } = window

  const handleClickOutside = (event) => {
    // Don't close if pinned or has active input
    if (store.pinned || hasActiveInput()) {
      return
    }

    // Check if click is outside the sidebar panel
    const sidebarPanel = document.querySelector('.sidebar-panel')
    if (sidebarPanel && !sidebarPanel.contains(event.target)) {
      store.setOpenedSideBar('')
      document.removeEventListener('click', handleClickOutside)
    }
  }

  const handleClickBookmark = () => {
    if (showModal) {
      store.showModal = 0
    }
    if (pinned) {
      return
    }
    if (openedSideBar === 'bookmarks') {
      // Remove listener when closing
      document.removeEventListener('click', handleClickOutside)
      store.setOpenedSideBar('')
    } else {
      // Add listener when opening, with slight delay to avoid conflict with this click
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)
      store.setOpenedSideBar('bookmarks')
    }
  }

  const handleShowUpgrade = () => {
    window.store.upgradeInfo.showUpgradeModal = true
  }

  const {
    onNewSsh,
    openSetting,
    openAbout,
    openSettingSync,
    openTerminalThemes,
    setLeftSidePanelWidth
  } = store
  const {
    showUpgradeModal,
    upgradePercent,
    checkingRemoteVersion,
    shouldUpgrade
  } = upgradeInfo
  const showSetting = showModal === modals.setting
  const bookmarksActive = showSetting && settingTab === settingMap.bookmarks
  const resourcesActive = openedSideBar === 'bookmarks' || bookmarksActive
  const manageActive = showSetting && settingTab !== settingMap.bookmarks
  const manageMenuItems = [{
    type: 'group',
    label: '配置管理',
    children: [
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: '系统设置'
      },
      {
        key: 'theme',
        icon: <BgColorsOutlined />,
        label: '终端主题'
      },
      {
        key: 'sync',
        icon: <SyncOutlined spin={isSyncingSetting} />,
        label: '数据同步'
      }
    ]
  }, {
    type: 'group',
    label: '扩展能力',
    children: [
      {
        key: 'tools',
        icon: <ToolOutlined />,
        label: '扩展工具'
      }
    ]
  }]
  const handleManageMenuClick = ({ key }) => {
    const actions = {
      settings: openSetting,
      theme: openTerminalThemes,
      sync: openSettingSync,
      tools: openWidgetsModal
    }
    actions[key]?.()
  }
  const sideProps = openedSideBar
    ? {
        className: 'sidebar-list',
        style: {
          width: `${leftSidebarWidth}px`
        }
      }
    : {
        className: 'sidebar-list'
      }
  const sidebarProps = {
    className: `sidebar type-${openedSideBar}`,
    style: {
      width: sidebarWidth,
      height
    }
  }
  const transferProps = {
    fileTransfers,
    transferTab,
    transferHistory
  }
  return (
    <div {...sidebarProps}>
      <div className='sidebar-bar btns'>
        <div className='cn-sidebar-primary'>
          <SideIcon title='应用菜单' className='cn-side-icon-menu'>
            <MenuBtn store={store} config={store.config} />
          </SideIcon>
          <div className='cn-sidebar-divider' />
          <SideIcon
            title='新建连接'
            className='cn-side-icon-new'
          >
            <PlusOutlined
              className='font18 iblock control-icon'
              onClick={onNewSsh}
            />
          </SideIcon>
          <SideIcon
            title='服务器资源'
            active={resourcesActive}
            className='cn-side-icon-server'
          >
            <CloudServerOutlined
              onClick={handleClickBookmark}
              className='font18 iblock control-icon'
            />
          </SideIcon>
          <TransferList
            {...transferProps}
            active={openedSideBar === 'transfer'}
          />
        </div>
        <div className='cn-sidebar-secondary'>
          <div className='cn-sidebar-divider' />
          <Dropdown
            menu={{
              items: manageMenuItems,
              onClick: handleManageMenuClick
            }}
            placement='rightBottom'
            trigger={['click']}
            classNames={{ root: 'cn-sidebar-manage-menu' }}
          >
            <SideIcon
              title='管理中心'
              active={manageActive}
              className='cn-side-icon-manage'
            >
              <SettingOutlined className='iblock font18 control-icon' />
            </SideIcon>
          </Dropdown>
          {
            !checkingRemoteVersion && !showUpgradeModal && shouldUpgrade
              ? (
                <Tooltip
                  title={`${e('upgrading')} ${upgradePercent || 0}%`}
                  placement='right'
                >
                  <div
                    className='control-icon-wrap'
                  >
                    <UpCircleOutlined
                      className='iblock font18 control-icon upgrade-icon'
                      onClick={handleShowUpgrade}
                    />
                  </div>
                </Tooltip>
                )
              : null
          }
          <SideIcon
            title='帮助与关于'
            active={showInfoModal}
            className='cn-side-icon-about'
          >
            <QuestionCircleOutlined
              className='iblock font18 control-icon open-about-icon'
              onClick={openAbout}
            />
          </SideIcon>
        </div>
      </div>
      <SidePanel
        sideProps={sideProps}
        setLeftSidePanelWidth={setLeftSidePanelWidth}
        leftSidebarWidth={leftSidebarWidth}
      >
        <SideBarPanel
          pinned={pinned}
          sidebarPanelTab={sidebarPanelTab}
          openedSideBar={openedSideBar}
          fileTransfers={fileTransfers}
          transferHistory={transferHistory}
          transferTab={transferTab}
        />
      </SidePanel>
    </div>
  )
}
