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
}
