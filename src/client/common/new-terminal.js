/**
 * output default new terminal data obj
 */

import uid from './id-with-stamp'
import {
  paneMap
} from './constants'

window.et.tabCount = 0

export function updateCount (tab) {
  window.et.tabCount++
  return window.et.tabCount
}

export default (removeTitle) => {
  const res = {
    id: uid(),
    status: 'processing',
    pane: paneMap.terminal,
    // 2026-07-04 coder(lq): Use a Chinese default title so local terminal tabs are understandable without relying on upstream translations.
    title: '本地终端'
  }
  if (removeTitle) {
    delete res.title
  }
  return res
}
