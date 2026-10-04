import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldReconnectOnEnter } from '../../src/client/components/terminal/reconnect-on-enter.js'

function reconnectCheck (overrides = {}) {
  return shouldReconnectOnEnter({
    event: {
      type: 'keydown',
      key: 'Enter',
      isComposing: false,
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false
    },
    isSsh: true,
    isDisconnected: true,
    isLoading: false,
    isPending: false,
    ...overrides
  })
}

test('plain Enter reconnects a disconnected SSH terminal', () => {
  assert.equal(reconnectCheck(), true)
})

test('Enter remains normal while SSH is connected or connecting', () => {
  assert.equal(reconnectCheck({ isDisconnected: false }), false)
  assert.equal(reconnectCheck({ isLoading: true }), false)
  assert.equal(reconnectCheck({ isPending: true }), false)
})

test('Enter does not reconnect non-SSH terminals or modified/composing input', () => {
  assert.equal(reconnectCheck({ isSsh: false }), false)
  assert.equal(reconnectCheck({ event: { type: 'keyup', key: 'Enter' } }), false)
  assert.equal(reconnectCheck({ event: { type: 'keydown', key: 'Enter', shiftKey: true } }), false)
  assert.equal(reconnectCheck({ event: { type: 'keydown', key: 'Enter', isComposing: true } }), false)
  assert.equal(reconnectCheck({ event: { type: 'keydown', key: 'Enter', repeat: true } }), false)
})
