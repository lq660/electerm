const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

test('background jobs expose partial output, retain completion and share exact command cancellation', async () => {
  const { runRemoteCommand, startBackgroundCommand, getBackgroundCommand, cancelCommand } = require('../../src/app/server/agent-command-execution')
  const owner = {}
  let channel
  const start = () => runRemoteCommand(owner, {
    command: 'background work',
    executionId: 'job',
    background: true,
    client: {
      exec (cmd, options, callback) {
        channel = new EventEmitter()
        channel.stderr = new EventEmitter()
        channel.signal = () => {}
        channel.close = () => channel.emit('close')
        callback(null, channel)
      }
    }
  })
  assert.equal(startBackgroundCommand(owner, 'job', start).status, 'running')
  channel.emit('data', Buffer.from('progress'))
  assert.equal(getBackgroundCommand(owner, 'job').stdout, 'progress')
  assert.equal(getBackgroundCommand({}, 'job').status, 'unknown')
  cancelCommand(owner, 'job')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(getBackgroundCommand(owner, 'job').status, 'cancelled')
  assert.equal(getBackgroundCommand(owner, 'job').exitCode, null)
})

test('background completion preserves its actual exit status without PID files', async () => {
  const { runLocalCommand, startBackgroundCommand, getBackgroundCommand } = require('../../src/app/server/agent-command-execution')
  const owner = {}
  let completion
  startBackgroundCommand(owner, 'done', () => {
    completion = runLocalCommand(owner, { shell: '/bin/sh', command: 'printf done; exit 7', executionId: 'done', background: true })
    return completion
  })
  await completion
  await new Promise(resolve => setImmediate(resolve))
  const result = getBackgroundCommand(owner, 'done')
  assert.equal(result.status, 'completed')
  assert.equal(result.stdout, 'done')
  assert.equal(result.exitCode, 7)
})

test('isolated SSH cancellation targets one channel, never the shared connection or another command', async () => {
  const { runRemoteCommand, cancelCommand } = require('../../src/app/server/agent-command-execution')
  const channels = []
  const client = {
    exec: (cmd, options, callback) => {
      const stream = new EventEmitter()
      stream.stderr = new EventEmitter()
      stream.signals = []
      stream.signal = value => stream.signals.push(value)
      stream.close = () => { stream.closed = true; stream.emit('close') }
      channels.push(stream)
      callback(null, stream)
    }
  }
  const owner = {}
  const one = runRemoteCommand(owner, { client, command: 'sleep 20', executionId: 'one' })
  const two = runRemoteCommand(owner, { client, command: 'printf ok', executionId: 'two' })
  assert.equal(cancelCommand({}, 'one').cancelled, false)
  assert.equal(cancelCommand(owner, 'missing').cancelled, false)
  assert.equal(cancelCommand(owner, 'one').cancelled, true)
  assert.deepEqual(channels[0].signals, ['TERM'])
  assert.equal(channels[1].closed, undefined)
  channels[1].emit('data', Buffer.from('ok'))
  channels[1].emit('close', 0)
  assert.equal((await one).cancelled, true)
  assert.equal((await two).stdout, 'ok')
  assert.equal(cancelCommand(owner, 'one').cancelled, false)
})

test('stopping before SSH channel creation closes the late channel without accepting its result', async () => {
  const { runRemoteCommand, cancelCommand } = require('../../src/app/server/agent-command-execution')
  let callback
  const owner = {}
  const pending = runRemoteCommand(owner, { client: { exec: (cmd, opts, cb) => { callback = cb } }, command: 'sleep 20', executionId: 'pending' })
  cancelCommand(owner, 'pending')
  assert.equal((await pending).cancelled, true)
  const signals = []
  const channel = new EventEmitter()
  channel.signal = value => signals.push(value)
  channel.close = () => { signals.push('close'); channel.emit('error', new Error('closed late')) }
  callback(null, channel)
  assert.deepEqual(signals, ['TERM', 'close'])
})

test('local cancellation stops the owned process group and leaves another command running', async () => {
  const { runLocalCommand, cancelCommand } = require('../../src/app/server/agent-command-execution')
  const owner = {}
  const pending = runLocalCommand(owner, { shell: '/bin/sh', command: 'sleep 20', executionId: 'local' })
  const other = runLocalCommand(owner, { shell: '/bin/sh', command: 'printf independent', executionId: 'other' })
  assert.equal(cancelCommand(owner, 'local').cancelled, true)
  assert.equal((await pending).cancelled, true)
  assert.equal((await other).stdout, 'independent')
})
