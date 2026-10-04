export const localAIConfigFields = [
  'nameAI',
  'baseURLAI',
  'modelAI',
  'reasoningEffortAI',
  'terminalExecutionChannelAI',
  'roleAI',
  'apiKeyAI',
  'authHeaderNameAI',
  'apiPathAI',
  'languageAI',
  'proxyAI'
]

function isSameValue (left, right) {
  if (Object.is(left, right)) {
    return true
  }
  return JSON.stringify(left) === JSON.stringify(right)
}

export function getChangedConfigFields (previousConfig = {}, nextConfig = {}) {
  const changed = {}
  for (const [key, value] of Object.entries(nextConfig || {})) {
    if (!Object.prototype.hasOwnProperty.call(previousConfig || {}, key) || !isSameValue(previousConfig[key], value)) {
      changed[key] = value
    }
  }
  return changed
}

export function omitConfigFields (config = {}, fields = []) {
  const omitted = new Set(fields)
  return Object.fromEntries(
    Object.entries(config || {}).filter(([key]) => !omitted.has(key))
  )
}
