const { test } = require('node:test')
const assert = require('node:assert/strict')

test('prefers the app clipboard when it still matches the system text', async () => {
  const { resolveSftpClipboardTransfer } = await import('../../src/client/common/sftp-clipboard.js')
  const clipboardText = 'remote:/tmp/a'
  const appClipboard = {
    text: clipboardText,
    files: [{ tabId: 'terminal-a' }],
    operation: 'cp'
  }
  const systemClipboard = {
    text: clipboardText,
    files: [{ tabId: 'terminal-b' }],
    operation: 'mv'
  }

  const result = resolveSftpClipboardTransfer({
    clipboardText,
    appClipboard,
    systemClipboard
  })

  assert.equal(result, appClipboard)
})

test('falls back to the shared clipboard payload when the window clipboard is empty', async () => {
  const { resolveSftpClipboardTransfer } = await import('../../src/client/common/sftp-clipboard.js')
  const clipboardText = 'remote:/tmp/a'
  const systemClipboard = {
    text: clipboardText,
    files: [{ tabId: 'terminal-a' }],
    operation: 'cp'
  }

  const result = resolveSftpClipboardTransfer({
    clipboardText,
    appClipboard: null,
    systemClipboard
  })

  assert.equal(result, systemClipboard)
})

test('does not treat plain text as a terminal file clipboard', async () => {
  const { resolveSftpClipboardTransfer } = await import('../../src/client/common/sftp-clipboard.js')

  const result = resolveSftpClipboardTransfer({
    clipboardText: '/tmp/a',
    appClipboard: null,
    systemClipboard: null
  })

  assert.equal(result, null)
})
