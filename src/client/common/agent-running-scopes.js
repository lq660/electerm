export function getAgentRunningScopeId (entry = {}) {
  return entry.terminalSessionId || entry.sessionRootId || entry.id || ''
}

export function isAgentScopeRunning (scopes = {}, scopeId = '') {
  return Boolean(scopeId && Number(scopes?.[scopeId]) > 0)
}

export function hasRunningAgentScopes (scopes = {}) {
  return Object.values(scopes || {}).some(value => Number(value) > 0)
}

export function startAgentScope (scopes = {}, scopeId = '') {
  if (!scopeId) {
    return { ...scopes }
  }
  return {
    ...scopes,
    [scopeId]: Number(scopes?.[scopeId] || 0) + 1
  }
}

export function finishAgentScope (scopes = {}, scopeId = '') {
  if (!scopeId || !scopes?.[scopeId]) {
    return { ...scopes }
  }
  const next = { ...scopes }
  const remaining = Number(next[scopeId]) - 1
  if (remaining > 0) {
    next[scopeId] = remaining
  } else {
    delete next[scopeId]
  }
  return next
}
