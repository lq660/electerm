const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')

test('provider cancellation closes only its own HTTP request and clears its registry', { timeout: 5000 }, async (t) => {
  const previousEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  t.after(() => { if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv })
  const { AIchatWithTools, cancelAIRequest } = require('../../src/app/lib/ai')
  let requestArrived
  let requestClosed
  const arrived = new Promise(resolve => { requestArrived = resolve })
  const closed = new Promise(resolve => { requestClosed = resolve })
  const server = http.createServer((req, res) => {
    req.resume()
    if (req.url === '/wait') {
      res.on('close', requestClosed)
      requestArrived()
      return
    }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'independent' } }] }))
  })
  t.after(() => { server.closeAllConnections(); server.close() })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const request = (path, id) => AIchatWithTools([{ role: 'user', content: 'test' }], 'test', base, path, 'test-only', null, [], null, 'auto', undefined, id)
  const pending = request('/wait', 'owned')
  t.after(() => cancelAIRequest('owned'))
  await arrived
  assert.equal(cancelAIRequest('missing').cancelled, false)
  const other = request('/complete', 'independent')
  assert.equal(cancelAIRequest('owned').cancelled, true)
  assert.equal((await pending).cancelled, true)
  await closed
  assert.equal((await other).message.content, 'independent')
  assert.equal(cancelAIRequest('owned').cancelled, false)
  assert.equal(cancelAIRequest('independent').cancelled, false)
})
