function getActiveTerminalIds () {
  return window.store?.activeTerminalIds || {}
}

// 2026-07-12 coder(lq): Child terminals belong to an outer connection tab, so keep one active terminal per owner instead of one process-wide ID.
export function setActiveTerminalId (ownerTabId, terminalId) {
  if (!ownerTabId || !terminalId || !window.store) {
    return
  }
  window.store.activeTerminalIds = {
    ...getActiveTerminalIds(),
    [ownerTabId]: terminalId
  }
}

export function clearActiveTerminalId (ownerTabId) {
  if (!ownerTabId || !window.store) {
    return
  }
  const next = { ...getActiveTerminalIds() }
  delete next[ownerTabId]
  window.store.activeTerminalIds = next
}

export function resolveTerminalTarget (requestedTabId = window.store?.activeTabId) {
  const activeTerminalIds = getActiveTerminalIds()
  if (!requestedTabId) {
    return {
      ownerTabId: '',
      terminalId: ''
    }
  }
  if (activeTerminalIds[requestedTabId]) {
    return {
      ownerTabId: requestedTabId,
      terminalId: activeTerminalIds[requestedTabId]
    }
  }
  const ownerTabId = Object.keys(activeTerminalIds)
    .find(id => activeTerminalIds[id] === requestedTabId)
  return {
    ownerTabId: ownerTabId || requestedTabId,
    terminalId: requestedTabId
  }
}

export function resolveTerminalId (requestedTabId) {
  return resolveTerminalTarget(requestedTabId).terminalId
}
