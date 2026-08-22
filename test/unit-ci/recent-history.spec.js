const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function loadRecentHistory () {
  const sourcePath = path.resolve(__dirname, '../../src/client/common/recent-history.js')
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'electerm-recent-history-'))
  const tempPath = path.join(tempDir, 'recent-history.mjs')
  await fs.copyFile(sourcePath, tempPath)
  return import(pathToFileURL(tempPath).href)
}

describe('recent history', () => {
  test('uses a stable key for the same ssh server', async () => {
    const { getRecentHistoryKey } = await loadRecentHistory()
    const first = getRecentHistoryKey({
      type: 'ssh',
      pane: 'terminal',
      title: 'OpenClaw',
      username: 'root',
      host: '112.126.58.25',
      port: 22,
      lastUseTime: '2026-07-25T10:00:00.000Z'
    })
    const second = getRecentHistoryKey({
      type: 'ssh',
      pane: 'terminal',
      title: 'OpenClaw',
      username: 'root',
      host: '112.126.58.25',
      port: '22',
      lastUseTime: '2026-07-25T10:05:00.000Z'
    })

    assert.equal(first, second)
  })

  test('deduplicates existing records and keeps visit count', async () => {
    const { dedupeRecentHistory } = await loadRecentHistory()
    const history = [
      {
        id: 'latest',
        count: 2,
        time: 30,
        tab: {
          type: 'ssh',
          pane: 'terminal',
          username: 'root',
          host: '112.126.58.25',
          port: 22,
          lastUseTime: '2026-07-25T10:00:00.000Z'
        }
      },
      {
        id: 'older',
        count: 3,
        time: 10,
        tab: {
          type: 'ssh',
          pane: 'terminal',
          username: 'root',
          host: '112.126.58.25',
          port: '22',
          lastUseTime: '2026-07-24T10:00:00.000Z'
        }
      },
      {
        id: 'other',
        count: 1,
        time: 20,
        tab: {
          type: 'ssh',
          pane: 'terminal',
          username: 'root',
          host: '60.205.152.238',
          port: 22
        }
      }
    ]

    const result = dedupeRecentHistory(history)

    assert.equal(result.length, 2)
    assert.equal(result[0].id, 'latest')
    assert.equal(result[0].count, 5)
    assert.equal(result[1].id, 'other')
  })

  test('deduplicates then orders by latest visit time', async () => {
    const { dedupeRecentHistory } = await loadRecentHistory()
    const result = dedupeRecentHistory([
      {
        id: 'old-server',
        count: 1,
        time: 10,
        tab: {
          type: 'ssh',
          pane: 'terminal',
          title: 'old',
          username: 'root',
          host: '112.126.58.25',
          port: 22
        }
      },
      {
        id: 'other-server',
        count: 1,
        time: 20,
        tab: {
          type: 'ssh',
          pane: 'terminal',
          username: 'root',
          host: '60.205.152.238',
          port: 22
        }
      },
      {
        id: 'new-server',
        count: 2,
        time: 30,
        tab: {
          type: 'ssh',
          pane: 'terminal',
          title: 'new',
          username: 'root',
          host: '112.126.58.25',
          port: '22'
        }
      }
    ])

    assert.deepEqual(result.map(item => item.id), ['old-server', 'other-server'])
    assert.equal(result[0].count, 3)
    assert.equal(result[0].time, 30)
    assert.equal(result[0].tab.title, 'new')
  })

  test('normalizes recent history length after dedupe', async () => {
    const { normalizeRecentHistory } = await loadRecentHistory()
    const result = normalizeRecentHistory([
      {
        id: 'server-a-old',
        time: 10,
        tab: {
          type: 'ssh',
          username: 'root',
          host: 'a.example.com',
          port: 22
        }
      },
      {
        id: 'server-b',
        time: 30,
        tab: {
          type: 'ssh',
          username: 'root',
          host: 'b.example.com',
          port: 22
        }
      },
      {
        id: 'server-a-new',
        time: 40,
        tab: {
          type: 'ssh',
          username: 'root',
          host: 'a.example.com',
          port: 22
        }
      }
    ], 1)

    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'server-a-old')
    assert.equal(result[0].time, 40)
  })

  test('keeps different accounts or ports as separate entries', async () => {
    const { dedupeRecentHistory } = await loadRecentHistory()
    const result = dedupeRecentHistory([
      {
        id: 'root',
        tab: {
          type: 'ssh',
          pane: 'terminal',
          username: 'root',
          host: '112.126.58.25',
          port: 22
        }
      },
      {
        id: 'deploy',
        tab: {
          type: 'ssh',
          pane: 'terminal',
          username: 'deploy',
          host: '112.126.58.25',
          port: 22
        }
      },
      {
        id: 'other-port',
        tab: {
          type: 'ssh',
          pane: 'terminal',
          username: 'root',
          host: '112.126.58.25',
          port: 2200
        }
      }
    ])

    assert.equal(result.length, 3)
  })

  test('treats terminal and file manager panes for the same ssh server as one server', async () => {
    const { dedupeRecentHistory } = await loadRecentHistory()
    const result = dedupeRecentHistory([
      {
        id: 'terminal',
        tab: {
          type: 'ssh',
          pane: 'terminal',
          username: 'root',
          host: '112.126.58.25',
          port: 22
        }
      },
      {
        id: 'file-manager',
        tab: {
          type: 'ssh',
          pane: 'fileManager',
          username: 'root',
          host: '112.126.58.25',
          port: 22
        }
      }
    ])

    assert.equal(result.length, 1)
  })
})
