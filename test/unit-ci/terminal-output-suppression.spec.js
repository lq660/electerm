import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.window = { xtermAddons: {} }

const { default: AttachAddonCustom } = await import('../../src/client/components/terminal/attach-addon-custom.js')

const ESC = '\x1b'
const BEL = '\x07'
const cwdMarker = `${ESC}]633;P;`
const promptMarker = `${ESC}]633;A${BEL}`

function createAddon () {
  const writes = []
  const term = {
    parent: {},
    write: data => writes.push(data)
  }
  return {
    addon: new AttachAddonCustom(term, {}, false),
    writes
  }
}

test('silent prompt refresh discards command echo and restores only cwd metadata plus the new prompt', () => {
  const { addon, writes } = createAddon()
  let ended = false

  addon.startOutputSuppressionUntil(
    promptMarker,
    { replayFromSequence: cwdMarker, timeout: 1000, onEnd: () => { ended = true } }
  )

  addon.writeToTerminal(`hidden-command\r\n${ESC}]633;P;Cwd=/srv/app${BEL}${ESC}]633;`)
  assert.deepEqual(writes, [])

  addon.writeToTerminal(`A${BEL}root@host:/srv/app# `)

  assert.equal(ended, true)
  assert.deepEqual(writes, [
    `${ESC}]633;P;Cwd=/srv/app${BEL}${promptMarker}root@host:/srv/app# `
  ])
})

test('ordinary suppression keeps the existing first-shell-marker behavior', () => {
  const { addon, writes } = createAddon()
  let ended = false

  addon.startOutputSuppression(1000, () => { ended = true })
  addon.writeToTerminal(`hidden${ESC}]633;C${BEL}`)

  assert.equal(ended, true)
  assert.deepEqual(writes, [])
})
