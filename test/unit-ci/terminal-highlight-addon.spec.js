import test from 'node:test'
import assert from 'node:assert/strict'
import { KeywordHighlighterAddon } from '../../src/client/components/terminal/highlight-addon.js'

test('terminal highlight addon', async (t) => {
  const ESC = String.fromCharCode(27)

  await t.test('adds colors to plain structured logs', () => {
    const addon = new KeywordHighlighterAddon([])
    const highlighted = addon.highlightKeywords(
      '2026-07-28T21:51:46.331+08:00 INFO app email=ops@example.com url=https://example.com response={"success":true,"error":null}\n'
    )

    assert.ok(highlighted.includes(`${ESC}[90m2026-07-28T21:51:46.331+08:00${ESC}[0m`))
    assert.ok(highlighted.includes(`${ESC}[1;36mINFO${ESC}[0m`))
    assert.ok(highlighted.includes(`${ESC}[36mops@example.com${ESC}[0m`))
    assert.ok(highlighted.includes(`${ESC}[4;36mhttps://example.com${ESC}[0m`))
    assert.equal(highlighted.includes(`${ESC}[32mtrue${ESC}[0m`), false)
    assert.equal(highlighted.includes(`${ESC}[90mnull${ESC}[0m`), false)
    assert.equal(highlighted.includes(`${ESC}[36m"success"${ESC}[0m`), false)
  })

  await t.test('does not inject colors into ordinary output', () => {
    const addon = new KeywordHighlighterAddon([])

    assert.equal(addon.highlightKeywords('root@host:~# ls -la\n'), 'root@host:~# ls -la\n')
  })

  await t.test('keeps configured keyword highlighting', () => {
    const addon = new KeywordHighlighterAddon([{ keyword: 'failed', color: 'red' }])

    assert.ok(addon.highlightKeywords('deploy failed\n').includes(`${ESC}[31mfailed${ESC}[0m`))
  })
})
