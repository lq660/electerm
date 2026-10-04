const { test } = require('node:test')
const assert = require('node:assert/strict')
const { manage, autoRun } = require('manate')

const historyModule = import('../../src/client/common/lazy-history.mjs')
const name = 'aiChatHistory'
const makeStore = () => ({
  historyLoadState: { aiChatHistory: 'idle', terminalCommandHistory: 'idle' },
  aiChatHistory: [],
  terminalCommandHistory: []
})

test('history remains lazy, concurrent reads share one request and publish baseline first', async () => {
  const { createHistoryLoader } = await historyModule
  const store = makeStore()
  let count = 0
  let finish
  const rows = [{ id: 'saved', result: 'previous conversation' }]
  const load = createHistoryLoader({
    store,
    read: () => { count++; return new Promise(resolve => { finish = resolve }) },
    snapshot: (table, items) => {
      assert.equal(table, name)
      assert.deepEqual(items, rows)
      assert.deepEqual(store[name], [])
      assert.equal(store.historyLoadState[name], 'loading')
    }
  })
  assert.equal(count, 0)
  const first = load(name)
  const second = load(name)
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(count, 1)
  finish(rows)
  await first
  assert.deepEqual(store[name], rows)
  assert.equal(store.historyLoadState[name], 'ready')
  assert.equal(store.historyLoadState.terminalCommandHistory, 'idle')
  await load(name)
  assert.equal(count, 1)
})

test('read failures and invalid responses never replace saved history; retry succeeds', async () => {
  const { createHistoryLoader } = await historyModule
  for (const failure of [new Error('offline'), undefined, {}]) {
    const store = makeStore()
    store[name] = [{ id: 'untouched' }]
    let attempt = 0
    let snapshots = 0
    const load = createHistoryLoader({
      store,
      read: async () => {
        if (++attempt > 1) return [{ id: 'restored' }]
        if (failure instanceof Error) throw failure
        return failure
      },
      snapshot: () => { snapshots++ }
    })
    await assert.rejects(load(name))
    assert.deepEqual(store[name], [{ id: 'untouched' }])
    assert.equal(snapshots, 0)
    assert.equal(store.historyLoadState[name], 'error')
    await load(name)
    assert.deepEqual(store[name], [{ id: 'restored' }])
    assert.equal(snapshots, 1)
  }
})

test('empty history is a valid successful read and unknown tables cannot be loaded', async () => {
  const { createHistoryLoader } = await historyModule
  const store = makeStore()
  const load = createHistoryLoader({ store, read: async () => [], snapshot: () => {} })
  await assert.rejects(load('bookmarks'), /Unknown/)
  await load(name)
  assert.equal(store.historyLoadState[name], 'ready')
})

test('Manate persistence waits for restoration, then observes new messages without rewriting old rows', async () => {
  const { createHistoryLoader, isHistoryReady } = await historyModule
  const store = manage(makeStore())
  let baseline = []
  const changes = []
  let readyRuns = 0
  const watcher = autoRun(() => {
    if (!isHistoryReady(store, name)) return
    readyRuns++
    const current = JSON.parse(JSON.stringify(store[name]))
    if (JSON.stringify(current) !== JSON.stringify(baseline)) changes.push(current)
    baseline = current
  })
  watcher.start()
  try {
    assert.equal(readyRuns, 0)
    const load = createHistoryLoader({
      store,
      read: async () => [{ id: 'saved' }],
      snapshot: (_, items) => { baseline = structuredClone(items) }
    })
    await load(name)
    assert.ok(readyRuns > 0)
    assert.deepEqual(changes, [])
    store[name].push({ id: 'new' })
    assert.deepEqual(changes.at(-1), [{ id: 'saved' }, { id: 'new' }])
  } finally {
    watcher.stop()
  }
})

test('a first command queued during restoration is appended after existing history', async () => {
  const { createHistoryLoader } = await historyModule
  const store = makeStore()
  const table = 'terminalCommandHistory'
  const load = createHistoryLoader({ store, read: async () => [{ id: 'saved' }], snapshot: () => {} })
  const append = id => load(table).then(() => store[table].push({ id }))
  await Promise.all([append('first'), append('second')])
  assert.deepEqual(store[table].map(row => row.id), ['saved', 'first', 'second'])
})
