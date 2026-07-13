const axios = require('axios')
const { createProxyAgent } = require('../lib/proxy-agent')

// 2026-07-12 coder(lq): Web bookmarks need an HTTP reachability check; routing them through terminal session testing incorrectly treats them as SSH.
module.exports = async function testWebConnection (options = {}) {
  const target = new URL(options.url)
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('仅支持 HTTP 或 HTTPS 地址')
  }
  const agent = createProxyAgent(options.proxy)
  const response = await axios({
    url: target.toString(),
    method: 'HEAD',
    timeout: options.readyTimeout || 10000,
    maxRedirects: 5,
    proxy: false,
    httpAgent: agent,
    httpsAgent: agent,
    validateStatus: () => true
  })
  return {
    status: response.status,
    statusText: response.statusText || ''
  }
}
