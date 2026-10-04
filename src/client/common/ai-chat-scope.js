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

function normalizeMachinePart (value, lowerCase = false) {
  if (value === null || typeof value === 'undefined') {
    return ''
  }
  const text = String(value).trim()
  return lowerCase ? text.toLowerCase() : text
}

// 2026-09-01 coder(lq): Use connection identity instead of tab ids so history follows a machine across terminal tabs.
export function getAiMachineKey (itemOrScope = {}, tabs = []) {
  if (itemOrScope.machineKey) {
    return itemOrScope.machineKey
  }
  const tabId = itemOrScope.sessionRootId || itemOrScope.activeTabId
  const tab = tabs.find(item => item.id === tabId) || itemOrScope
  const type = normalizeMachinePart(tab.type || (tab.host ? 'ssh' : 'local'), true)
  const host = normalizeMachinePart(tab.host, true)
  if (host) {
    return ['remote', type, normalizeMachinePart(tab.username, true), host, normalizeMachinePart(tab.port)].join('|')
  }
  // Local terminals share one machine even when the user opens several local tabs.
  return 'local'
}

export function getAiMachineLabel (itemOrScope = {}, tabs = []) {
  if (itemOrScope.machineLabel) {
    return itemOrScope.machineLabel
  }
  const tabId = itemOrScope.sessionRootId || itemOrScope.activeTabId
  const tab = tabs.find(item => item.id === tabId) || itemOrScope
  if (tab.host) {
    return `${tab.username ? tab.username + '@' : ''}${tab.host}${tab.port ? ':' + tab.port : ''}`
  }
  return '本机'
}

export function filterAiChatHistoryByMachine (history = [], machineKey = '', tabs = []) {
  if (!machineKey) {
    return []
  }
  return history.filter(item => getAiMachineKey(item, tabs) === machineKey)
}

export function filterAiChatHistoryByTerminal (history = [], terminalSessionId = '') {
  return history.filter(item => {
    return getAiHistoryTerminalId(item) === terminalSessionId
  })
}

export function buildAiConversationGroups (history = []) {
  const groups = []
  const groupMap = new Map()

  history.forEach(item => {
    // 2026-08-30 coder(lq): Conversation boundaries are explicit metadata; never infer them from prompt wording.
    const key = item.conversationId || item.id
    let group = groupMap.get(key)
    if (!group) {
      group = {
        id: key,
        items: []
      }
      groupMap.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
  })

  return groups
}
