/**
 * extend store
 */

import { refs } from '../components/common/ref'
import { resolveTerminalId } from '../common/active-terminal'

export default Store => {
  Store.prototype.focus = function () {
    window.focused = true
    refs.get('term-' + resolveTerminalId())?.term?.focus()
  }

  Store.prototype.blur = function () {
    window.focused = false
    if (window.store.shouldSendWindowMove) {
      window.pre.runSync('windowMove', false)
    }
    refs.get('term-' + resolveTerminalId())?.term?.blur()
  }

  Store.prototype.onBlur = function () {
    window.focused = false
    if (window.store.shouldSendWindowMove) {
      window.pre.runSync('windowMove', false)
    }
  }

  Store.prototype.selectall = function () {
    document.activeElement &&
    document.activeElement.select &&
    document.activeElement.select()
    refs.get('term-' + resolveTerminalId())?.term?.selectAll()
  }

  Store.prototype.triggerResize = function () {
    window.store.resizeTrigger = window.store.resizeTrigger ? 0 : 1
    window.dispatchEvent(new Event('resize'))
  }

  Store.prototype.toggleSessFullscreen = function (fullscreen) {
    window.store.fullscreen = fullscreen
    setTimeout(window.store.triggerResize, 500)
  }
}
