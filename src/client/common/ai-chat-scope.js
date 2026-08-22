export function getAiChatScope ({
  activeTabId = '',
  sessionRootId = '',
  terminalSessionId = ''
} = {}) {
  const rootId = sessionRootId || activeTabId || ''
  const terminalId = terminalSessionId || activeTabId || rootId
  return {
    sessionRootId: rootId,
    terminalSessionId: terminalId
  }
}

export function getAiHistoryTerminalId (item = {}) {
  return item.terminalSessionId || item.sessionRootId || ''
}

export function filterAiChatHistoryByTerminal (history = [], terminalSessionId = '') {
  return history.filter(item => {
    return getAiHistoryTerminalId(item) === terminalSessionId
  })
}
