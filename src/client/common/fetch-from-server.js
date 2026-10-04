/**
 * fetch from server
 */

import initWs from './ws'
import generate from './uid'
import { NewPromise } from './promise-timeout'

const id = 's'
window.et.wsOpened = false
let wsInitPromise

export const initWsCommon = async () => {
  if (window.et.wsOpened) {
    return
  }
  // 2026-09-02 coder(lq): Share one in-flight connection handshake so startup and concurrent requests do not open duplicate WebSockets.
  if (!wsInitPromise) {
    wsInitPromise = (async () => {
      const ws = await initWs('common', id, undefined, true)
      if (!ws) {
        return
      }
      window.et.wsOpened = true
      ws.onclose = () => {
        window.et.wsOpened = false
      }
      window.et.commonWs = ws
      window.store.wsInited = true
    })().finally(() => {
      wsInitPromise = null
    })
  }
  return wsInitPromise
}

window.pre.ipcOnEvent('power-resume', initWsCommon)

const wsFetch = async (data) => {
  if (!window.et.wsOpened) {
    await initWsCommon()
  }
  const id = generate()
  return new NewPromise((resolve, reject) => {
    window.et.commonWs.once((arg) => {
      if (arg.error) {
        console.error('fetch error', arg.error)
        return reject(new Error(arg.error.message))
      }
      resolve(arg.data)
    }, id)
    window.et.commonWs.s({
      id,
      ...data
    })
  })
}
window.wsFetch = wsFetch
export default wsFetch
