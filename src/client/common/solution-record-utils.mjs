const MAX_RECORDS = 100

function cleanText (value, maxLength = 0) {
  const text = String(value || '').trim()
  return maxLength ? text.slice(0, maxLength) : text
}

function cleanArray (value, maxLength = 0) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\n,，]/)
  return [...new Set(list.map(item => cleanText(item, maxLength)).filter(Boolean))]
}

export function getSolutionConnectionKey (tab = {}) {
  const type = tab.type || (tab.host ? 'ssh' : 'local')
  return [
    type,
    cleanText(tab.username),
    cleanText(tab.host, 200) || 'local',
    cleanText(tab.port)
  ].join('|')
}

export function toSolutionCommands (value) {
  const list = Array.isArray(value) ? value : String(value || '').split('\n')
  return [...new Set(list.map(item => cleanText(item, 2000)).filter(Boolean))].slice(0, 40)
}

export function normalizeSolutionRecord (record = {}) {
  const now = Date.now()
  return {
    id: cleanText(record.id),
    connectionKey: cleanText(record.connectionKey, 500),
    serverName: cleanText(record.serverName, 120),
    host: cleanText(record.host, 300),
    title: cleanText(record.title, 80),
    problem: cleanText(record.problem, 2000),
    summary: cleanText(record.summary, 4000),
    commands: toSolutionCommands(record.commands),
    tags: cleanArray(record.tags, 30).slice(0, 8),
    createdAt: Number(record.createdAt) || now,
    updatedAt: Number(record.updatedAt) || now
  }
}

export function sortSolutionRecords (records = []) {
  return records
    .map(normalizeSolutionRecord)
    .filter(record => record.id && record.title)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECORDS)
}

export function getSessionRecentCommands (history = [], sessionId = '', limit = 12) {
  const latest = new Map()
  history.forEach(item => {
    const lastUseTime = item?.sessionUsages?.[sessionId] || (
      item?.lastSessionId === sessionId ? item.lastUseTime : ''
    )
    if (!lastUseTime || !item?.cmd) {
      return
    }
    const command = cleanText(item.cmd, 2000)
    if (!command) return
    const previous = latest.get(command)
    if (!previous || new Date(previous.lastUseTime).getTime() < new Date(lastUseTime).getTime()) {
      latest.set(command, {
        ...item,
        lastUseTime
      })
    }
  })
  return [...latest.values()]
    .sort((a, b) => new Date(a.lastUseTime).getTime() - new Date(b.lastUseTime).getTime())
    .slice(-limit)
    .map(item => cleanText(item.cmd, 2000))
}

export function getSessionAiContext (history = [], sessionId = '', limit = 4) {
  return history
    .filter(item => item?.sessionRootId === sessionId && (item.prompt || item.response))
    .slice(-limit)
    .map(item => ({
      prompt: cleanText(item.prompt, 1800),
      response: cleanText(item.response, 2600)
    }))
}

function stripCodeFence (value) {
  const text = String(value || '').trim()
  if (!text.startsWith('```')) return text
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

export function parseSolutionSummary (value) {
  const text = stripCodeFence(value)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) {
    return null
  }
  try {
    const data = JSON.parse(text.slice(start, end + 1))
    if (!data || typeof data !== 'object') return null
    return {
      title: cleanText(data.title, 80),
      problem: cleanText(data.problem, 2000),
      summary: cleanText(data.summary, 4000),
      commands: toSolutionCommands(data.commands),
      tags: cleanArray(data.tags, 30).slice(0, 8)
    }
  } catch (error) {
    return null
  }
}

export function buildSolutionSummaryPrompt ({ serverName, host, commands = [], conversation = [] }) {
  const commandText = commands.length
    ? commands.map((command, index) => `${index + 1}. ${command}`).join('\n')
    : '没有采集到命令'
  const conversationText = conversation.length
    ? conversation.map((item, index) => {
      return `对话 ${index + 1}\n用户：${item.prompt || '无'}\nAI：${item.response || '无'}`
    }).join('\n\n')
    : '没有采集到当前会话的 AI 对话'
  return `你是经验丰富的中文运维工程师。请将一次已完成的问题处理整理成可复用的处理记录。\n\n服务器：${serverName || '当前服务器'}\n地址：${host || '本机'}\n\n实际执行过的命令：\n${commandText}\n\n当前会话 AI 对话：\n${conversationText}\n\n只输出 JSON，不要 Markdown，不要解释。格式：\n{"title":"不超过 28 字的问题标题","problem":"问题现象","summary":"已确认的原因和处理结论","commands":["只能保留上述实际执行过且与处理有关的命令，禁止编造"],"tags":["最多 4 个中文标签"]}\n\n当上下文无法确认原因时，在 summary 中明确写“待验证”，不要推测。`
}
