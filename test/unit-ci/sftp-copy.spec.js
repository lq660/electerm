const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Sftp } = require('../../src/app/server/session-sftp')
const globalState = require('../../src/app/server/global-state')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function fileSession (t) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'electerm-copy-test-'))
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }))
  const transport = {}
  for (const name of ['lstat', 'realpath', 'mkdir', 'chmod', 'readlink', 'symlink']) {
    transport[name] = fs[name].bind(fs)
  }
  transport.readdir = (directory, callback) => fs.readdir(directory, (err, names) => {
    callback(err, names?.map(filename => ({ filename })))
  })
  transport.createReadStream = fs.createReadStream
  transport.createWriteStream = fs.createWriteStream
  return { root, ...await session(t, { enableSsh: false }, {}, transport) }
}

async function session (t, terminalOptions = {}, fileOptions = {}, sftp = {}) {
  const id = `copy-${Math.random()}`
  const commands = []
  const conn = {
    sftp: callback => callback(null, sftp),
    exec (command, options, callback) {
      commands.push(command)
      const stream = new EventEmitter()
      stream.stderr = new EventEmitter()
      callback(null, stream)
      queueMicrotask(() => stream.emit('close', 0))
    }
  }
  globalState.setSession(id, { conn, initOptions: terminalOptions })
  const instance = new Sftp({ uid: `${id}-files` })
  t.after(() => {
    globalState.removeSession(id)
    globalState.removeSession(instance.pid)
  })
  await instance.connect({ terminalId: id, ...fileOptions })
  return { instance, commands }
}

test('SSH with default capability can copy on its file connection', async t => {
  const { instance, commands } = await session(t)
  assert.equal(await instance.cp('/srv/a', '/srv/b'), 1)
  assert.ok(commands.some(command => command.startsWith('cp -r ')))
})

test('file connection cannot override a terminal with SSH disabled', async t => {
  const { instance, commands } = await session(t, { enableSsh: false }, { enableSsh: true })
  await assert.rejects(instance.execBuffered('pwd'), /只有 SFTP/)
  assert.deepEqual(commands, [])
})

test('SFTP-only copy preserves nested hidden files and links without commands', async t => {
  const { root, instance, commands } = await fileSession(t)
  const from = path.join(root, '.config')
  const to = path.join(root, '.config1')
  await fs.promises.mkdir(path.join(from, 'nested'), { recursive: true })
  await fs.promises.writeFile(path.join(from, 'nested', '.env'), 'hello\u0000world')
  await fs.promises.symlink('nested/.env', path.join(from, 'link'))
  assert.equal(await instance.cp(from, to), 1)
  assert.equal(await fs.promises.readFile(path.join(to, 'nested', '.env'), 'utf8'), 'hello\u0000world')
  assert.equal(await fs.promises.readlink(path.join(to, 'link')), 'nested/.env')
  assert.deepEqual(commands, [])
})

test('SFTP-only copies a single file and refuses to overwrite an existing target', async t => {
  const { root, instance } = await fileSession(t)
  const from = path.join(root, '.env')
  const to = path.join(root, '.env1')
  await fs.promises.writeFile(from, 'original')
  assert.equal(await instance.cp(from, to), 1)
  assert.equal(await fs.promises.readFile(to, 'utf8'), 'original')
  await fs.promises.writeFile(from, 'changed')
  await assert.rejects(instance.cp(from, to), { code: 'EEXIST' })
  assert.equal(await fs.promises.readFile(to, 'utf8'), 'original')
  await assert.rejects(instance.cp(from, from), { code: 'EEXIST' })
  assert.equal(await fs.promises.readFile(from, 'utf8'), 'changed')
})

test('SFTP-only rejects recursive self-copy including a symlinked destination parent', async t => {
  const { root, instance } = await fileSession(t)
  const from = path.join(root, 'source')
  await fs.promises.mkdir(from)
  await fs.promises.symlink(from, path.join(root, 'alias'))
  await assert.rejects(instance.cp(from, from), /自身/)
  await assert.rejects(instance.cp(from, path.join(root, 'alias', 'child')), /自身/)
  assert.deepEqual(await fs.promises.readdir(from), [])
})

test('SFTP-only reports read errors instead of claiming copy succeeded', async t => {
  const { root, instance, commands } = await fileSession(t)
  await assert.rejects(instance.cp(path.join(root, 'missing'), path.join(root, 'copy')), { code: 'ENOENT' })
  assert.deepEqual(commands, [])
})

test('an explicitly SFTP-only file request retains its execution restriction', async t => {
  const { instance, commands } = await session(t, {}, { enableSsh: false })
  await assert.rejects(instance.execBuffered('pwd'), /只有 SFTP/)
  assert.deepEqual(commands, [])
})
