/**
 * bookmark select
 */

import { memo, useState } from 'react'
import BookmarkWrap from './bookmark'
import History from './history'
import { Tabs, Tooltip } from 'antd'
import MultiSelectModal from '../common/multi-select-modal'
import TransferModal from './transfer-modal'
import getInitItem from '../../common/init-setting-item'
import {
  settingMap
} from '../../common/constants'
import {
  ArrowsAltOutlined,
  EditOutlined,
  PlusCircleOutlined,
  ShrinkOutlined,
  PushpinOutlined,
  SelectOutlined,
  CloseOutlined
} from '@ant-design/icons'

const e = window.translate

export default memo(function SidebarPanel (props) {
  const { sidebarPanelTab, pinned, openedSideBar } = props
  const { store } = window
  const [openSelectModal, setOpenSelectModal] = useState(false)
  const prps = {
    className: 'font16 mg1x mg2l pointer iblock control-icon'
  }
  const prps1 = {
    className: prps.className + (pinned ? ' pinned' : '')
  }
  const tabsProps = {
    activeKey: sidebarPanelTab,
    onChange: store.handleSidebarPanelTab,
    items: [
      {
        key: 'bookmarks',
        label: '服务器列表',
        children: null
      },
      {
        key: 'history',
        label: '最近连接',
        children: null
      }
    ]
  }
  const pop1 = {
    ...prps,
    onClick: store.onNewSsh
  }
  // 2026-07-05 coder(lq): Keep the side panel actions distinct: plus creates a server, edit opens the resource manager.
  const openBookmarkManager = () => {
    const item = store.bookmarks?.[0] || getInitItem([], settingMap.bookmarks)
    store.openBookmarkEdit(item)
  }
  const popEdit = {
    ...prps,
    onClick: openBookmarkManager
  }
  const pop2 = {
    ...prps,
    onClick: store.expandBookmarks
  }
  const pop3 = {
    ...prps,
    onClick: store.collapseBookmarks
  }
  // 2026-07-04 coder(lq): Transfer panel can be opened from several entry points, so keep a visible close action inside the panel itself.
  const closeTransferPanel = (event) => {
    event.stopPropagation()
    store.setOpenedSideBar('')
  }

  function renderExpandIcons () {
    if (sidebarPanelTab !== 'bookmarks') {
      return null
    }
    return [
      <Tooltip title={e('expandAll')} key='expand'>
        <ArrowsAltOutlined
          {...pop2}
        />
      </Tooltip>,
      <Tooltip title={e('collapseAll')} key='collapse'>
        <ShrinkOutlined
          {...pop3}
        />
      </Tooltip>,
      <Tooltip title={e('open') + ' ' + e('bookmarks')} key='multi'>
        <SelectOutlined
          {...prps}
          onClick={() => setOpenSelectModal(true)}
        />
      </Tooltip>
    ]
  }
  if (openedSideBar === 'transfer') {
    return (
      <div
        className='sidebar-panel bookmarks-panel animate-fast cn-transfer-side-panel'
      >
        <div className='sidebar-pin-top cn-side-panel-heading'>
          <div>
            <strong>传输中心</strong>
            <span>查看上传、下载、远程传输和历史记录</span>
          </div>
          <div className='cn-side-panel-actions'>
            <Tooltip title={e('pin')}>
              <PushpinOutlined
                {...prps1}
                onClick={store.handlePin}
              />
            </Tooltip>
            <Tooltip title='关闭'>
              <CloseOutlined
                {...prps}
                className={`${prps.className} cn-side-panel-close`}
                onClick={closeTransferPanel}
              />
            </Tooltip>
          </div>
        </div>
        <TransferModal
          fileTransfers={props.fileTransfers}
          transferHistory={props.transferHistory}
          transferTab={props.transferTab}
          embedded
        />
      </div>
    )
  }
  return (
    <div
      className='sidebar-panel bookmarks-panel animate-fast'
    >
      <div className='sidebar-pin-top'>
        <div className='pd1y pd2t pd2x sidebar-panel-control alignright'>
          <Tooltip title={e('newBookmark')}>
            <PlusCircleOutlined
              {...pop1}
            />
          </Tooltip>
          <Tooltip title={`${e('edit')} ${e('bookmarks')}`}>
            <EditOutlined
              {...popEdit}
            />
          </Tooltip>
          {
            renderExpandIcons()
          }
          <Tooltip title={e('pin')}>
            <PushpinOutlined
              {...prps1}
              onClick={store.handlePin}
            />
          </Tooltip>
        </div>
        <div className='cn-side-panel-heading'>
          <div>
            <strong>服务器资源</strong>
            <span>按分组管理服务器、会话和最近访问</span>
          </div>
        </div>
        <div className='pd1y pd2x'>
          <Tabs {...tabsProps} />
        </div>
      </div>
      {
        sidebarPanelTab === 'bookmarks'
          ? <BookmarkWrap {...props} />
          : <History store={store} />
      }
      <MultiSelectModal
        open={openSelectModal}
        onClose={() => setOpenSelectModal(false)}
      />
    </div>
  )
})
