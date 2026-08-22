import { refsStatic } from '../common/ref'
import { useEffect, useRef } from 'react'
import BookmarkSelect from './bookmark-select'
import { debounce } from 'lodash-es'
import {
  CloudServerOutlined,
  ImportOutlined,
  PlusOutlined
} from '@ant-design/icons'
import getInitItem from '../../common/init-setting-item'
import {
  settingMap
} from '../../common/constants'

export default function BookmarkPanel (props) {
  const { store } = window
  const bookmarksPanelRef = useRef(null)
  const SCROLL_REF_ID = 'bookmarks-scroll-position'

  // On component mount, restore scroll position
  useEffect(() => {
    if (store.openedSideBar) {
      const savedPosition = refsStatic.get(SCROLL_REF_ID)
      if (savedPosition) {
        setTimeout(() => {
          bookmarksPanelRef.current.scrollTop = savedPosition
        }, 100)
      }
    }
  }, [store.openedSideBar])

  // Save scroll position when scrolling
  const handleScroll = debounce((e) => {
    const top = e.target.scrollTop
    if (top > 0) {
      refsStatic.add(SCROLL_REF_ID, e.target.scrollTop)
    }
  }, 100)

  const handleOpenBookmarkManager = () => {
    store.openBookmarkEdit(store.bookmarks?.[0] || getInitItem([], settingMap.bookmarks))
  }

  const handleNewSsh = () => {
    store.onNewSsh()
  }

  if (!store.bookmarks?.length) {
    return (
      <div className='sidebar-panel-bookmarks cn-bookmark-empty-panel' ref={bookmarksPanelRef}>
        <div className='cn-bookmark-empty-card'>
          <CloudServerOutlined />
          <strong>暂无服务器资源</strong>
          <span>新建 SSH、SFTP、RDP、VNC 等连接后，会在这里按分组展示，点击即可打开到顶部 tab。</span>
          <div className='cn-bookmark-empty-actions'>
            <button type='button' className='primary' onClick={handleNewSsh}>
              <PlusOutlined />
              <span>新建服务器</span>
            </button>
            <button type='button' onClick={handleOpenBookmarkManager}>
              <ImportOutlined />
              <span>进入资源管理</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='sidebar-panel-bookmarks' ref={bookmarksPanelRef} onScroll={handleScroll}>
      <div className='pd2l sidebar-inner'>
        <BookmarkSelect store={store} from='sidebar' />
      </div>
    </div>
  )
}
