/**
 * workspace related functions
 */

import {
  settingMap,
  splitMap,
  splitConfig
} from '../common/constants'
import getInitItem from '../common/init-setting-item'
import generate from '../common/uid'

export default Store => {
  /**
   * Get current workspace state (layout + tabs for each batch)
   */
  Store.prototype.getCurrentWorkspaceState = function () {
    const { store } = window
    const { tabs } = store
    // 2026-10-04 coder(lq): Preserve the actual pane assignment. The previous
    // implementation flattened every saved workspace into the first pane.
    const tabsByBatch = {}
    for (const tab of tabs) {
      if (!tab.srcId) {
        continue
      }
      const batch = Number.isInteger(tab.batch) && tab.batch >= 0
        ? tab.batch
        : 0
      if (!tabsByBatch[batch]) {
        tabsByBatch[batch] = []
      }
      tabsByBatch[batch].push({
        srcId: tab.srcId
      })
    }
    return {
      layout: splitConfig[store.layout] ? store.layout : splitMap.c1,
      tabsByBatch
    }
  }

  /**
   * Save current workspace
   */
  Store.prototype.saveWorkspace = function (name, id = null) {
    const { store } = window
    const state = store.getCurrentWorkspaceState()
    const workspace = {
      id: id || generate(),
      name,
      ...state,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    if (id) {
      // Update existing
      store.editItem(id, workspace, settingMap.workspaces)
    } else {
      // Add new
      store.addItem(workspace, settingMap.workspaces)
    }
    return workspace
  }

  /**
   * Load a workspace - set layout and open tabs
   */
  Store.prototype.loadWorkspace = function (workspaceId) {
    const { store } = window
    const workspace = store.workspaces.find(w => w.id === workspaceId)
    if (!workspace) {
      return
    }
    const tabsByBatch = workspace.tabsByBatch || {}
    const layout = splitConfig[workspace.layout]
      ? workspace.layout
      : splitMap.c1

    // Close all existing tabs first
    store.removeTabs(() => true)

    // 2026-10-04 coder(lq): Restore the saved layout before opening resources,
    // then route each saved resource back to its original pane.
    store.setLayout(layout)
    const maxBatch = splitConfig[layout].children - 1
    for (const [batchKey, tabInfos] of Object.entries(tabsByBatch)) {
      const parsedBatch = Number.parseInt(batchKey, 10)
      const batch = Number.isInteger(parsedBatch) && parsedBatch >= 0
        ? Math.min(parsedBatch, maxBatch)
        : 0
      // 2026-10-04 coder(lq): Ignore malformed legacy pane data instead of
      // aborting the whole workspace restore operation.
      const validTabInfos = Array.isArray(tabInfos) ? tabInfos : []
      for (const tabInfo of validTabInfos) {
        if (tabInfo.srcId) {
          window.openTabBatch = batch
          store.onSelectBookmark(tabInfo.srcId)
        }
      }
    }
  }

  /**
   * Delete a workspace
   */
  Store.prototype.deleteWorkspace = function (id) {
    window.store.delItem({ id }, settingMap.workspaces)
  }

  /**
   * Open workspace settings
   */
  Store.prototype.openWorkspaceSettings = function () {
    const { store } = window
    store.storeAssign({
      settingTab: settingMap.workspaces
    })
    store.setSettingItem(getInitItem([], settingMap.workspaces))
    store.openSettingModal()
  }
}
