/**
 * Add button menu component
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Tabs } from 'antd'
import {
  CodeFilled,
  RightSquareFilled
} from '@ant-design/icons'
import BookmarksList from '../sidebar/bookmark-select'
import History from '../sidebar/history'
import DragHandle from '../common/drag-handle'

const e = window.translate

export const addPanelDefaultWidth = 480
export const addPanelMinWidth = 420
export const addPanelMaxWidth = 760

export function getAddPanelWidth (storedWidth, viewportWidth) {
  const availableWidth = Math.max(280, viewportWidth - 40)
  const maxWidth = Math.min(addPanelMaxWidth, availableWidth)
  const minWidth = Math.min(addPanelMinWidth, maxWidth)
  const preferredWidth = !storedWidth || storedWidth <= 300
    ? addPanelDefaultWidth
    : storedWidth
  return Math.min(Math.max(preferredWidth, minWidth), maxWidth)
}

export function getAddPanelHeight (menuTop, viewportHeight) {
  const availableHeight = viewportHeight - menuTop - 20
  return Math.max(280, Math.min(600, availableHeight))
}

export default function AddBtnMenu ({
  menuRef,
  menuPosition,
  menuTop,
  menuLeft,
  onMenuScroll,
  onTabAdd,
  addPanelWidth,
  setAddPanelWidth
}) {
  const { onNewSsh } = window.store
  const [activeTab, setActiveTab] = useState('bookmarks')
  const cls = 'context-item pointer cn-add-menu-secondary-btn'
  const panelWidth = getAddPanelWidth(addPanelWidth, window.innerWidth)
  const panelHeight = getAddPanelHeight(menuTop, window.innerHeight)
  const addTabBtn = window.store.hasNodePty
    ? (
      <button
        type='button'
        className={cls}
        onClick={onTabAdd}
      >
        <RightSquareFilled /> {e('newTab')}
      </button>
      )
    : null

  useEffect(() => {
    const store = window.store
    // 2026-07-13 coder(lq): A server selector should expose saved servers immediately, while preserving any existing expansion preference.
    if (store.bookmarks?.length && !store.expandedKeys?.length) {
      store.expandBookmarks()
    }
    // 2026-07-13 coder(lq): Migrate the legacy 300px popup width so existing users receive the larger selector, not only fresh installs.
    if (addPanelWidth !== panelWidth && setAddPanelWidth) {
      setAddPanelWidth(panelWidth)
    }
  }, [addPanelWidth, panelWidth, setAddPanelWidth])

  const onDragEnd = useCallback((nw) => {
    if (setAddPanelWidth) {
      setAddPanelWidth(nw)
    }
  }, [setAddPanelWidth])

  const onDragMove = useCallback((nw) => {
    if (menuRef.current) {
      menuRef.current.style.width = nw + 'px'
    }
  }, [menuRef])

  const dragProps = {
    min: Math.min(addPanelMinWidth, panelWidth),
    max: Math.min(addPanelMaxWidth, window.innerWidth - 40),
    width: panelWidth,
    onDragEnd,
    onDragMove,
    left: menuPosition === 'right'
  }

  const tabItems = [
    {
      key: 'bookmarks',
      label: '服务器列表'
    },
    {
      key: 'history',
      label: '最近连接'
    }
  ]

  let listContent
  if (activeTab === 'bookmarks') {
    listContent = <BookmarksList store={window.store} autoFocus />
  } else {
    listContent = <History store={window.store} />
  }

  return (
    <div
      ref={menuRef}
      className={`add-menu-wrap add-menu-${menuPosition}`}
      style={{
        top: menuTop,
        left: menuLeft,
        width: panelWidth + 'px',
        height: panelHeight + 'px'
      }}
      onScroll={onMenuScroll}
    >
      <DragHandle
        {...dragProps}
      />
      <div className='add-menu-header'>
        <div className='cn-add-menu-title'>
          <strong>选择服务器</strong>
          <span>点击已保存的服务器，直接打开连接</span>
        </div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </div>
      <div className='add-menu-list'>
        {listContent}
      </div>
      <div className='cn-add-menu-footer'>
        <span className='cn-add-menu-footer-label'>其他操作</span>
        <div className='cn-add-menu-actions'>
          <button
            type='button'
            className={cls}
            onClick={onNewSsh}
          >
            <CodeFilled /> 添加服务器
          </button>
          {addTabBtn}
        </div>
      </div>
    </div>
  )
}
