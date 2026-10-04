/**
 * server init script
 */

const createChildServer = require('../server/child-process')
const globalState = require('./glob-state')
const { waitForChildReady } = require('./wait-for-child-ready')

module.exports = async (config, env, sysLocale) => {
  const child = createChildServer(config, env, sysLocale)
  child.on('exit', () => {
    globalState.set('childPid', null)
  })
  globalState.set('childPid', child.pid)
  // 2026-10-04 coder(lq): A child that exits before its ready message must fail startup instead of leaving the desktop on a blank window forever.
  return waitForChildReady(child)
}
