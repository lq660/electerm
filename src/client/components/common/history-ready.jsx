import { useEffect } from 'react'
import { auto } from 'manate/react'
import { Button, Space, Spin } from 'antd'

// 2026-09-09 coder(lq): Mount consumers only after restoration so an empty initial array cannot start a new conversation or overwrite history.
export default auto(function HistoryReady ({ names, children }) {
  const key = names.join(',')
  const load = () => Promise.all(names.map(name => window.store.ensureHistoryLoaded(name))).catch(window.store.onError)
  useEffect(() => { load() }, [key])
  const states = names.map(name => window.store.historyLoadState[name])
  if (states.every(state => state === 'ready')) return children
  if (states.includes('error')) {
    return <Space role='alert'>历史记录加载失败<Button onClick={load}>重试</Button></Space>
  }
  return <Space role='status'><Spin size='small' />正在加载历史记录…</Space>
})
