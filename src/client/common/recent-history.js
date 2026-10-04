function normalizePart (value, lowerCase = false) {
  if (value === null || typeof value === 'undefined') {
    return ''
  }
  const text = String(value).trim()
  return lowerCase ? text.toLowerCase() : text
}

export function getRecentHistoryKey (tab) {
  if (!tab) {
    return ''
  }
  const type = normalizePart(tab.type || 'ssh', true)
  const pane = normalizePart(tab.pane, true)
  const host = normalizePart(tab.host, true)
  if (host) {
    return [
      'host',
      type,
      normalizePart(tab.username),
      host,
      normalizePart(tab.port)
    ].join('|')
  }
  const path = normalizePart(tab.path)
  if (path) {
    return ['path', type, pane, path].join('|')
  }
  const url = normalizePart(tab.url)
  if (url) {
    return ['url', type, pane, url].join('|')
  }
  return ''
}

export function getHistoryItemKey (item) {
  return getRecentHistoryKey(item?.tab)
}

export function findHistoryBookmark (tab, bookmarks = []) {
  if (!tab) return null
  // 2026-09-08 coder(lq): Prefer the saved connection identity; old snapshots may only be recovered when their endpoint is unambiguous.
  if (tab.from === 'bookmarks' && tab.srcId) {
    return bookmarks.find(item => item.id === tab.srcId) || null
  }
  if (!tab.host) return null
  const endpointKey = item => getRecentHistoryKey({
    ...item,
    port: item.port || ((item.type || 'ssh') === 'ssh' ? 22 : '')
  })
  const key = endpointKey(tab)
  const matches = bookmarks.filter(item => item.host && endpointKey(item) === key)
  return matches.length === 1 ? matches[0] : null
}

export function findRecentHistoryIndex (history, tab) {
  const key = getRecentHistoryKey(tab)
  if (!key) {
    return -1
  }
  return (history || []).findIndex(item => getHistoryItemKey(item) === key)
}

export function dedupeRecentHistory (history) {
  const result = []
  const indexMap = new Map()
  ;(history || []).forEach(item => {
    const key = getHistoryItemKey(item)
    if (!key) {
      result.push(item)
      return
    }
    const index = indexMap.get(key)
    if (typeof index !== 'number') {
      indexMap.set(key, result.length)
      result.push({
        ...item,
        count: item.count || 1
      })
      return
    }
    const current = result[index]
    current.count = (current.count || 1) + (item.count || 1)
    if ((item.time || 0) > (current.time || 0)) {
      current.time = item.time
      current.tab = item.tab
    }
  })
  return result
    .map((item, index) => ({ ...item, originalIndex: index }))
    .sort((a, b) => {
      const timeDiff = (b.time || 0) - (a.time || 0)
      return timeDiff || a.originalIndex - b.originalIndex
    })
    .map(({ originalIndex, ...item }) => item)
}

export function normalizeRecentHistory (history, maxLength) {
  const result = dedupeRecentHistory(history)
  return typeof maxLength === 'number' && maxLength > 0
    ? result.slice(0, maxLength)
    : result
}
