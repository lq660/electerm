import { normalizeToolResult } from './agent-result-utils.js'

const escapeCharacter = String.fromCharCode(27)
const bellCharacter = String.fromCharCode(7)
const ANSI_ESCAPE = new RegExp(`${escapeCharacter}(?:[@-_][0-?]*[ -/]*[@-~]|\\][^${bellCharacter}]*(?:${bellCharacter}|${escapeCharacter}\\\\))`, 'g')
const IMPORTANT_LINE_PATTERNS = [
  { score: 100, pattern: /\b(?:fatal|panic|critical|emerg|alert)\b|traceback|stack trace/i },
  { score: 90, pattern: /\b(?:error|exception|failed|failure|denied|forbidden|timeout|timed out|unhealthy)\b|duplicate key|violates?\s+(?:unique\s+)?constraint/i },
  { score: 70, pattern: /\b(?:warn|warning|degraded|retrying|connection reset|out of memory|oom)\b/i },
  { score: 45, pattern: /\b(?:ready|started|listening|active|running|healthy|completed|succeeded|version)\b/i }
]

function cleanEvidenceText (value = '') {
  return String(value || '').replace(ANSI_ESCAPE, '').replace(/\r/g, '')
}

function boundedHeadTail (value, budget) {
  const raw = String(value || '')
  if (raw.length <= budget) return raw
  const half = Math.floor((budget - 20) / 2)
  return `${raw.slice(0, half)}\n[…输出已截断…]\n${raw.slice(-half)}`
}

function lineScore (line) {
  for (const item of IMPORTANT_LINE_PATTERNS) {
    if (item.pattern.test(line)) return item.score
  }
  return 0
}

// 2026-09-09 coder(lq): Preserve bounded, addressable excerpts from the full result so important middle log lines survive context compaction.
export function buildEvidenceExcerpts (output, toolCallId, options = {}) {
  const lines = cleanEvidenceText(output).split('\n')
  const maxExcerpts = Math.max(1, Number(options.maxExcerpts) || 12)
  const maxTotalChars = Math.max(1000, Number(options.maxTotalChars) || 9000)
  const candidates = lines
    .map((line, index) => ({ index, score: lineScore(line) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const selected = []
  let usedChars = 0
  for (const candidate of candidates) {
    const start = Math.max(0, candidate.index - 1)
    const end = Math.min(lines.length - 1, candidate.index + 1)
    if (selected.some(item => start <= item.end && end >= item.start)) continue
    const text = lines.slice(start, end + 1).join('\n').trim().slice(0, 1400)
    if (!text || usedChars + text.length > maxTotalChars) continue
    selected.push({
      id: `${toolCallId}:line-${start + 1}-${end + 1}`,
      lineStart: start + 1,
      lineEnd: end + 1,
      text
    })
    usedChars += text.length
    if (selected.length >= maxExcerpts) break
  }
  return selected.sort((a, b) => a.lineStart - b.lineStart)
}

export function buildToolEvidenceResult (tool, outputBudget = 15000) {
  const result = normalizeToolResult(tool.result)
  const raw = cleanEvidenceText(result.output || JSON.stringify(tool.result))
  const output = boundedHeadTail(raw, outputBudget)
  return {
    output,
    evidenceExcerpts: buildEvidenceExcerpts(raw, tool.id),
    exitCode: result.exitCode,
    success: result.success,
    cancelled: result.cancelled,
    timedOut: result.timedOut,
    waitingForInput: result.waitingForInput,
    status: result.status,
    taskId: result.taskId,
    outputTruncated: result.outputTruncated || output !== raw
  }
}

export function buildToolModelContent (tool) {
  return JSON.stringify(buildToolEvidenceResult(tool, 12000))
}

export function matchesEvidenceReference (reference, result) {
  const quote = cleanEvidenceText(reference?.quote).trim()
  if (!quote) return false
  const excerpts = Array.isArray(result?.evidenceExcerpts) ? result.evidenceExcerpts : []
  if (reference?.evidenceId) {
    const excerpt = excerpts.find(item => item.id === reference.evidenceId)
    return Boolean(excerpt && cleanEvidenceText(excerpt.text).includes(quote))
  }
  return cleanEvidenceText(result?.output).includes(quote) || excerpts.some(item => cleanEvidenceText(item.text).includes(quote))
}
