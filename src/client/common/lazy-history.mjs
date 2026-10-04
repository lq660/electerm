export const lazyHistoryNames = ['terminalCommandHistory', 'aiChatHistory']

// 2026-09-09 coder(lq): One in-flight read per table; publish the baseline before enabling persistence, and never publish failed reads as empty history.
export function createHistoryLoader ({ store, read, snapshot }) {
  const pending = new Map()
  return function ensureHistoryLoaded (name) {
    if (!lazyHistoryNames.includes(name)) return Promise.reject(new Error('Unknown history table'))
    if (store.historyLoadState[name] === 'ready') return Promise.resolve()
    if (pending.has(name)) return pending.get(name)
    store.historyLoadState[name] = 'loading'
    const promise = Promise.resolve().then(() => read(name)).then(items => {
      if (!Array.isArray(items)) throw new Error('Invalid history data')
      snapshot(name, items)
      store[name] = items
      store.historyLoadState[name] = 'ready'
    }).catch(error => {
      store.historyLoadState[name] = 'error'
      throw error
    }).finally(() => pending.delete(name))
    pending.set(name, promise)
    return promise
  }
}

export function isHistoryReady (store, name) {
  return !lazyHistoryNames.includes(name) || store.historyLoadState[name] === 'ready'
}
