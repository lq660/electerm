/**
 * system menu functions
 */

import Modal from '../components/common/modal'
import message from '../components/common/message'
import { isString } from 'lodash-es'
import getInitItem from '../common/init-setting-item'
import { settingMap } from '../common/constants'
import {
  featureIds,
  getFeatureLockedMessage,
  hasFeature
} from '../common/feature-plans'

const e = window.translate

export default Store => {
  Store.prototype.zoom = function (level = 1, plus = false, zoomOnly) {
    // 2026-08-30 coder(lq): Keep the application display at the native 100% scale; retain this method as a compatibility no-op for older menu/shortcut calls.
    window.pre.setZoomFactor(1)
    if (!zoomOnly && window.store.config?.zoom !== 1) {
      window.store.updateConfig({ zoom: 1 })
    }
  }

  Store.prototype.onZoomIn = function () {
    window.store.zoom(0.25, true)
  }

  Store.prototype.onZoomout = function () {
    window.store.zoom(-0.25, true)
  }

  Store.prototype.onZoomReset = function () {
    window.store.zoom()
  }

  Store.prototype.openAbout = function (tab) {
    const { store } = window
    store.showInfoModal = true
    if (isString(tab)) {
      store.infoModalTab = tab
    }
  }

  Store.prototype.onNewSsh = function () {
    const { store } = window
    store.storeAssign({
      settingTab: settingMap.bookmarks
    })
    store.setSettingItem(getInitItem([], settingMap.bookmarks))
    store.openSettingModal()
  }

  Store.prototype.onNewSshAI = function () {
    const { store } = window
    if (!hasFeature(store.config, featureIds.aiChat)) {
      message.warning(getFeatureLockedMessage(featureIds.aiChat))
      store.openSubscriptionSetting()
      return
    }
    if (store.aiConfigMissing()) {
      store.toggleAIConfig()
      return
    }
    window.et.openBookmarkWithAIMode = true
    store.onNewSsh()
  }

  Store.prototype.confirmExit = function (type) {
    const { store } = window
    let mod = null
    mod = Modal.confirm({
      onCancel: () => mod.destroy(),
      onOk: store.doExit,
      title: e('quit'),
      okText: e('ok'),
      cancelText: e('cancel'),
      content: ''
    })
  }

  Store.prototype.exit = function () {
    window.exitFunction = 'doExit'
    window.store.doExit()
  }

  Store.prototype.restart = function () {
    window.exitFunction = 'doRestart'
    window.store.doRestart()
  }

  Store.prototype.doExit = function () {
    window.pre.runGlobalAsync('closeApp', 'exit')
  }

  Store.prototype.doRestart = function () {
    window.pre.runGlobalAsync('restart', 'restart')
  }
}
