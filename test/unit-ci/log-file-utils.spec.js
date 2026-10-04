import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isClearableLogFile,
  isLogFileName
} from '../../src/client/components/sftp/log-file-utils.js'

describe('SFTP log file recognition', () => {
  it('recognizes common active log file names', () => {
    for (const name of [
      'nohup.out',
      'catalina.out',
      'server.log',
      'server.LOG',
      'error.err',
      'request.trace',
      'server.log.1',
      'stdout',
      'access_log'
    ]) {
      assert.equal(isLogFileName(name), true, name)
    }
  })

  it('does not treat ordinary or compressed files as active logs', () => {
    for (const name of [
      'notes.txt',
      'application.json',
      'server.log.gz',
      'output',
      ''
    ]) {
      assert.equal(isLogFileName(name), false, name)
    }
  })

  it('only allows real regular files to be cleared', () => {
    const file = {
      id: '/var/log/app.log',
      name: 'app.log',
      isDirectory: false,
      isEmpty: false,
      isParent: false
    }
    assert.equal(isClearableLogFile(file), true)
    assert.equal(isClearableLogFile({ ...file, isDirectory: true }), false)
    assert.equal(isClearableLogFile({ ...file, isParent: true }), false)
    assert.equal(isClearableLogFile({ ...file, id: '' }), false)
  })
})
