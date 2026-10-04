const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildPosixFolderSizeCommand,
  getSizeCount,
  getSizeCountWin,
  parseHumanSizeToBytes
} = require('../../src/app/common/get-folder-size-and-file-count.js')

describe('folder size parsing', () => {
  test('parses POSIX human-readable sizes into bytes without changing legacy size', () => {
    assert.equal(parseHumanSizeToBytes('1.5G'), 1.5 * 1024 * 1024 * 1024)
    assert.deepEqual(getSizeCount('512M /var/log\n12\n'), {
      count: 12,
      size: 0.5,
      sizeBytes: 512 * 1024 * 1024
    })
  })

  test('parses PowerShell table output with colon separators', () => {
    assert.deepEqual(getSizeCountWin('Count    : 3\nAverage  :\nSum      : 4096\n'), {
      count: 3,
      size: 4,
      sizeBytes: 4096
    })
  })

  test('builds a best-effort POSIX scan for volatile directories', () => {
    const command = buildPosixFolderSizeCommand('"/proc"')
    assert.match(command, /du -sh "\/proc" 2>\/dev\/null/)
    assert.match(command, /find "\/proc" -type f 2>\/dev\/null \| wc -l/)
    assert.match(command, /\$\{folder_size:-0\}/)
  })
})
