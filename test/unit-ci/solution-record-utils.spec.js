import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSolutionSummaryPrompt,
  getSessionAiContext,
  getSessionRecentCommands,
  getSolutionConnectionKey,
  normalizeSolutionRecord,
  parseSolutionSummary
} from '../../src/client/common/solution-record-utils.mjs'

test('solution record utilities', async (t) => {
  await t.test('uses a stable server key and keeps local sessions separate', () => {
    assert.equal(
      getSolutionConnectionKey({ type: 'ssh', username: 'root', host: '10.0.0.1', port: 22 }),
      'ssh|root|10.0.0.1|22'
    )
    assert.equal(getSolutionConnectionKey({}), 'local||local|')
  })

  await t.test('only collects the current SSH session command history', () => {
    const commands = getSessionRecentCommands([
      { cmd: 'systemctl status nginx', lastSessionId: 'ssh-a', lastUseTime: '2026-07-20T08:00:00.000Z' },
      { cmd: 'nginx -t', lastSessionId: 'ssh-a', lastUseTime: '2026-07-20T08:01:00.000Z' },
      { cmd: 'docker ps', lastSessionId: 'ssh-b', lastUseTime: '2026-07-20T08:02:00.000Z' }
    ], 'ssh-a')
    assert.deepEqual(commands, ['systemctl status nginx', 'nginx -t'])
  })

  await t.test('keeps a shared command available for every server where it ran', () => {
    const commands = getSessionRecentCommands([
      {
        cmd: 'systemctl status nginx',
        lastSessionId: 'ssh-b',
        lastUseTime: '2026-07-20T08:03:00.000Z',
        sessionUsages: {
          'ssh-a': '2026-07-20T08:00:00.000Z',
          'ssh-b': '2026-07-20T08:03:00.000Z'
        }
      }
    ], 'ssh-a')
    assert.deepEqual(commands, ['systemctl status nginx'])
  })

  await t.test('filters AI context by the current SSH session', () => {
    const context = getSessionAiContext([
      { sessionRootId: 'ssh-a', prompt: 'Nginx 502', response: '检查 upstream' },
      { sessionRootId: 'ssh-b', prompt: 'Docker', response: '查看容器' }
    ], 'ssh-a')
    assert.deepEqual(context, [{ prompt: 'Nginx 502', response: '检查 upstream' }])
  })

  await t.test('parses AI JSON summaries without keeping markdown fences', () => {
    const summary = parseSolutionSummary('```json\n{"title":"Nginx 配置检查","problem":"发布后 502","summary":"配置语法错误","commands":["nginx -t"],"tags":["Nginx"]}\n```')
    assert.deepEqual(summary, {
      title: 'Nginx 配置检查',
      problem: '发布后 502',
      summary: '配置语法错误',
      commands: ['nginx -t'],
      tags: ['Nginx']
    })
  })

  await t.test('normalizes records and asks AI not to invent commands', () => {
    const record = normalizeSolutionRecord({
      id: 'record-1',
      title: 'Nginx 发布失败',
      commands: 'nginx -t\nsystemctl reload nginx',
      tags: 'Nginx,发布'
    })
    assert.deepEqual(record.commands, ['nginx -t', 'systemctl reload nginx'])
    assert.deepEqual(record.tags, ['Nginx', '发布'])
    assert.match(buildSolutionSummaryPrompt({ commands: record.commands }), /禁止编造/)
  })
})
