import React, { useCallback, useEffect, useRef } from 'react'
import createTitle, { createTitleWithTag } from '../../common/create-title'
import { DeleteOutlined, BookFilled } from '@ant-design/icons'
import { refsStatic } from '../common/ref'
import { getHistoryItemKey } from '../../common/recent-history'

export default function HistoryItem (props) {
  const { store } = window
  const {
    item
  } = props
  const timeoutRef = useRef(null)

  const handleClick = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      store.onSelectHistory(item.tab)
    }, 10)
  }, [item.tab])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  function handleDelete (e) {
    e.stopPropagation()
    const { id } = item
    const key = getHistoryItemKey(item)
    for (let i = store.history.length - 1; i >= 0; i--) {
      const historyItem = store.history[i]
      if (historyItem.id === id || (key && getHistoryItemKey(historyItem) === key)) {
        store.history.splice(i, 1)
      }
    }
  }

  function handleBookmark (e) {
    e.stopPropagation()
    refsStatic.get('bookmark-from-history-modal')?.show(item.tab)
  }
  if (!item.tab) {
    return null
  }
  const title = createTitleWithTag(item.tab)
  const tt = createTitle(item.tab)
  return (
    <div
      className='item-list-unit'
      title={tt}
      onClick={handleClick}
    >
      <div className='elli pd1y pd2x'>
        {title}
      </div>
      <BookFilled
        className='list-item-bookmark'
        title={window.translate('bookmark')}
        onClick={handleBookmark}
      />
      <DeleteOutlined
        className='list-item-edit'
        onClick={handleDelete}
      />
    </div>
  )
}
