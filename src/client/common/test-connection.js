/**
 * test connection
 */

import fetch from './fetch-from-server'
import { terminalWebType } from './constants'

export default (body) => {
  if (body.type === terminalWebType) {
    return fetch({
      body,
      action: 'test-web-connection'
    })
  }
  return fetch({
    body,
    action: 'test-terminal'
  })
}
