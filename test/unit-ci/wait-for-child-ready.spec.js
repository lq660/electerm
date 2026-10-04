const { EventEmitter } = require('node:events')
const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const {
  waitForChildReady
} = require('../../src/app/lib/wait-for-child-ready.js')

describe('background service startup', () => {
  test('resolves only after the child announces readiness', async () => {
    const child = new EventEmitter()
    const ready = waitForChildReady(child, { timeout: 100 })
    child.emit('message', { other: true })
    child.emit('message', { serverInited: true })
    assert.equal(await ready, child)
  })

  test('rejects when the child exits before readiness', async () => {
    const child = new EventEmitter()
    const ready = waitForChildReady(child, { timeout: 100 })
    child.emit('exit', 1, null)
    await assert.rejects(ready, /exited before startup \(code 1\)/)
  })

  test('rejects when startup times out', async () => {
    const child = new EventEmitter()
    await assert.rejects(
      waitForChildReady(child, { timeout: 5 }),
      /startup timed out after 5 ms/
    )
  })
})
