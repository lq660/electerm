/**
 * handle terminal interactive operation - queue based
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { message } from 'antd'
import wait from '../../common/wait'
import TermInteractiveUI from './terminal-interactive-ui'

export default function TermInteractive () {
  const [current, setCurrent] = useState(null)
  const queueRef = useRef([])
  const hasCurrentRef = useRef(false)

  function updateTab (data) {
    window.store.updateTab(data.tabId, data.update)
  }

  function saveBookmarkPassword (savePassword) {
    const { bookmarkId, tabId, password } = savePassword || {}
    if (!bookmarkId || !password) {
      return
    }
    const store = window.store
    const bookmark = store.bookmarksMap?.get(bookmarkId) ||
      store.bookmarks?.find(item => item.id === bookmarkId)
    if (!bookmark || bookmark.password) {
      return
    }
    // 2026-07-20 coder(lq): Passwords entered during SSH login are useful only after the user explicitly opts in to saving.
    store.editItem(bookmarkId, {
      authType: 'password',
      password
    }, 'bookmarks')
    if (tabId) {
      store.updateTab(tabId, {
        authType: 'password',
        password
      })
    }
    message.success(window.translate('passwordSavedToBookmark'))
  }

  function processNext () {
    const next = queueRef.current.shift()
    if (next) {
      setCurrent(next)
    } else {
      hasCurrentRef.current = false
      setCurrent(null)
    }
  }

  const onMsgRef = useRef(null)
  onMsgRef.current = function onMsg (e) {
    if (
      e &&
      e.data &&
      typeof e.data === 'string' &&
      e.data.includes('session-interactive')
    ) {
      const parsed = JSON.parse(e.data)
      if (hasCurrentRef.current) {
        queueRef.current.push(parsed)
      } else {
        hasCurrentRef.current = true
        setCurrent(parsed)
      }
    } else if (
      e &&
      e.data &&
      typeof e.data === 'string' &&
      e.data.includes('ssh-tunnel-result')
    ) {
      updateTab(JSON.parse(e.data))
    }
  }

  function onSend (data) {
    const { savePassword, ...payload } = data
    saveBookmarkPassword(savePassword)
    window.et.commonWs.s(payload)
  }

  const onClose = useCallback(() => {
    processNext()
  }, [])

  useEffect(() => {
    let cancelled = false
    function handler (e) {
      if (!cancelled) {
        onMsgRef.current(e)
      }
    }
    async function initWatch () {
      for (;;) {
        if (cancelled) {
          return
        }
        if (window.et.commonWs) {
          window.et.commonWs.addEventListener('message', handler)
          return
        }
        await wait(400)
      }
    }
    initWatch()
    return () => {
      cancelled = true
      if (window.et.commonWs) {
        window.et.commonWs.removeEventListener('message', handler)
      }
    }
  }, [])

  if (!current) {
    return null
  }

  return (
    <TermInteractiveUI
      opts={current}
      onSend={onSend}
      onClose={onClose}
    />
  )
}
