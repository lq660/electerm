process.env.NODE_ENV = 'development'

const { test, describe, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const testWebConnection = require('../../src/app/server/test-web-connection')

describe('web bookmark connection test', () => {
  let server

  afterEach(async () => {
    if (!server) return
    await new Promise(resolve => server.close(resolve))
    server = null
  })

  test('returns the HTTP status for a reachable URL', async () => {
    server = http.createServer((request, response) => {
      response.writeHead(204)
      response.end()
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { port } = server.address()

    const result = await testWebConnection({
      url: `http://127.0.0.1:${port}/health`
    })
    assert.equal(result.status, 204)
  })

  test('rejects non-HTTP protocols', async () => {
    await assert.rejects(
      testWebConnection({ url: 'file:///tmp/index.html' }),
      /HTTP/
    )
  })
})
