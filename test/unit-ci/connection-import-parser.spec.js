const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const parserPromise = import(pathToFileURL(path.resolve(
  __dirname,
  '../../src/client/common/connection-import-parser.mjs'
)).href)

describe('connection import parser', () => {
  test('parses electerm bookmark exports and preserves advanced fields', async () => {
    const { parseConnectionImport } = await parserPromise
    const result = parseConnectionImport(JSON.stringify({
      bookmarks: [{
        id: 'server-1',
        title: '生产机',
        host: '10.0.0.8',
        port: 2222,
        username: 'root',
        proxy: 'socks5://127.0.0.1:1080'
      }],
      bookmarkGroups: [{
        id: 'group-1',
        title: '生产环境',
        bookmarkIds: ['server-1']
      }]
    }), 'bookmarks.json')

    assert.equal(result.source, 'electerm')
    assert.equal(result.connections[0].groupName, '生产环境')
    assert.equal(result.connections[0].rawBookmark.proxy, 'socks5://127.0.0.1:1080')
  })

  test('parses Xshell sessions without importing encrypted passwords', async () => {
    const { parseConnectionImport } = await parserPromise
    const result = parseConnectionImport(`
[CONNECTION]
Host=192.168.1.20
Port=22
Protocol=SSH
[CONNECTION:AUTHENTICATION]
UserName=admin
Password=encrypted-value
`, 'web-server.xsh')

    assert.equal(result.source, 'xshell')
    assert.equal(result.connections[0].title, 'web-server')
    assert.equal(result.connections[0].username, 'admin')
    assert.equal(result.connections[0].password, '')
    assert.match(result.connections[0].warnings[0], /重新填写密码/)
  })

  test('parses common FinalShell field aliases and skips stored passwords', async () => {
    const { parseConnectionImport } = await parserPromise
    const result = parseConnectionImport(JSON.stringify({
      connections: [{
        id: 'final-1',
        name: '应用服务器',
        host: 'app.example.com',
        port: 2200,
        user_name: 'deploy',
        password: 'opaque-value',
        group_name: '线上环境'
      }]
    }), 'finalshell.json')

    assert.equal(result.source, 'finalshell')
    assert.equal(result.connections[0].username, 'deploy')
    assert.equal(result.connections[0].groupName, '线上环境')
    assert.equal(result.connections[0].password, '')
    assert.match(result.connections[0].warnings[0], /重新填写密码/)
  })

  test('does not mistake a FinalShell connection array for an electerm export', async () => {
    const { parseConnectionImport } = await parserPromise
    const result = parseConnectionImport(JSON.stringify([{
      name: 'FinalShell server',
      host: '10.0.0.20',
      user_name: 'root',
      password: 'opaque-value'
    }]), 'connections.json')

    assert.equal(result.source, 'finalshell')
    assert.equal(result.connections[0].username, 'root')
    assert.equal(result.connections[0].password, '')
  })

  test('parses OpenSSH config and ignores wildcard hosts', async () => {
    const { parseConnectionImport } = await parserPromise
    const result = parseConnectionImport(`
Host *
  ServerAliveInterval 30
Host staging
  HostName 10.0.0.9
  User deploy
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
`, 'config')

    assert.equal(result.source, 'openssh')
    assert.equal(result.connections.length, 1)
    assert.equal(result.connections[0].host, '10.0.0.9')
    assert.equal(result.connections[0].authType, 'privateKey')
    assert.match(result.warnings[0], /通配符/)
  })

  test('decodes UTF-16LE Xshell session files', async () => {
    const { decodeConnectionImportContent, parseConnectionImport } = await parserPromise
    const input = '[CONNECTION]\r\nHost=127.0.0.1\r\nPort=22\r\n'
    const utf16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(input, 'utf16le')])
    const decoded = decodeConnectionImportContent(utf16)
    const result = parseConnectionImport(decoded, 'local.xsh')
    assert.equal(result.connections[0].host, '127.0.0.1')
  })

  test('merges multiple import files without colliding source or group ids', async () => {
    const {
      mergeConnectionImportResults,
      parseConnectionImport
    } = await parserPromise
    const makeExport = (title, host) => parseConnectionImport(JSON.stringify({
      bookmarks: [{
        id: 'shared-server-id',
        title,
        host,
        username: 'root'
      }],
      bookmarkGroups: [{
        id: 'shared-group-id',
        title: `${title}分组`,
        bookmarkIds: ['shared-server-id']
      }]
    }), `${title}.json`)
    const merged = mergeConnectionImportResults([
      { fileName: '生产.json', result: makeExport('生产', '10.0.0.10') },
      { fileName: '测试.json', result: makeExport('测试', '10.0.0.20') }
    ])

    assert.deepEqual(merged.fileNames, ['生产.json', '测试.json'])
    assert.equal(merged.result.connections.length, 2)
    assert.equal(new Set(merged.result.connections.map(item => item.sourceId)).size, 2)
    assert.equal(new Set(merged.result.groups.map(item => item.sourceId)).size, 2)
    assert.deepEqual(
      merged.result.connections.map(item => item.sourceFileName),
      ['生产.json', '测试.json']
    )
    merged.result.groups.forEach(group => {
      assert.equal(group.connectionSourceIds.length, 1)
      assert.ok(merged.result.connections.some(connection => (
        connection.sourceId === group.connectionSourceIds[0]
      )))
    })
  })

  test('rejects invalid files', async () => {
    const { parseConnectionImport } = await parserPromise
    assert.throws(() => parseConnectionImport('not a connection file'), /不是有效/)
    assert.throws(() => parseConnectionImport('null'), /暂不支持/)
  })
})
