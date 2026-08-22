const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const profilePromise = import(pathToFileURL(path.resolve(
  __dirname,
  '../../src/client/components/terminal/command-assistant-profile.mjs'
)).href)

describe('command assistant machine profile', () => {
  test('recognizes software discovered from a running process', async () => {
    const { parseMachineProfile } = await profilePromise
    const profile = parseMachineProfile([
      '__PROFILE_OS__=Linux',
      '__PROFILE_SOFTWARE__=nginx|/data/nginx/sbin/nginx|process'
    ].join('\n'))

    assert.deepEqual(profile.software, [{
      name: 'nginx',
      path: '/data/nginx/sbin/nginx',
      source: 'process'
    }])
  })

  test('prefers a PATH command when the same software has multiple sources', async () => {
    const { parseMachineProfile } = await profilePromise
    const profile = parseMachineProfile([
      '__PROFILE_SOFTWARE__=nginx|/opt/nginx/sbin/nginx|common',
      '__PROFILE_SOFTWARE__=nginx|/data/nginx/nginx|process',
      '__PROFILE_SOFTWARE__=nginx|/usr/sbin/nginx|path'
    ].join('\n'))

    assert.deepEqual(profile.software, [{
      name: 'nginx',
      path: '/usr/sbin/nginx',
      source: 'path'
    }])
  })

  test('probe reads Linux process executables without a full disk scan', async () => {
    const { machineProbeCommand } = await profilePromise
    assert.match(machineProbeCommand, /\/proc\/\$pid\/exe/)
    assert.match(machineProbeCommand, /__PROFILE_SOFTWARE__=%s\|%s\|process/)
    assert.doesNotMatch(machineProbeCommand, /find \/ -/)
  })

  test('probe includes standard OpenResty nginx locations', async () => {
    const { machineProbeCommand } = await profilePromise
    assert.match(machineProbeCommand, /\/usr\/local\/openresty\/nginx\/sbin\/nginx/)
    assert.match(machineProbeCommand, /\|common/)
  })
})
