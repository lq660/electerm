function stripPromptPrefix (line = '') {
  return line
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')
    .replace(/^\s*(?:[\w.-]+@[\w.-]+(?::[^#$%>]*)?[#$%>]\s*)/, '')
    .replace(/^\s*(?:[$#%>]\s*)/, '')
    .trim()
}

function normalizeToolResult (result) {
  let parsed = result
  if (typeof result === 'string') {
    try {
      parsed = JSON.parse(result)
    } catch {
      parsed = { output: result }
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    parsed = { output: String(parsed || '') }
  }
  const stdout = String(parsed.stdout || '')
  const stderr = String(parsed.stderr || '')
  const output = String(parsed.output || [stdout, stderr].filter(Boolean).join('\n') || parsed.message || '')
  const exitCode = parsed.exitCode === undefined ? null : parsed.exitCode
  // 2026-09-01 coder(lq): A non-zero exit code is authoritative; provider-provided success flags must not hide a failed command.
  const success = parsed.timedOut === true || parsed.waitingForInput === true
    ? false
    : exitCode !== null
      ? exitCode === 0
      : parsed.success === true || parsed.ok === true
  return {
    ...parsed,
    command: parsed.command || '',
    stdout,
    stderr,
    output,
    exitCode,
    success,
    timedOut: parsed.timedOut === true,
    waitingForInput: parsed.waitingForInput === true
  }
}

function isDiscoveryOnlyCommand (command = '') {
  const clean = stripPromptPrefix(command)
  return /^(?:command\s+-v|which|whereis|type|readlink\s+-f|realpath)\b/i.test(clean)
}

// 2026-09-01 coder(lq): Finish only when the command output contains evidence for the requested fact; generic probes must not end a task prematurely.
function hasAnswerEvidence (taskText = '', command = '', result) {
  const normalized = normalizeToolResult(result)
  if (!normalized.success || normalized.timedOut || normalized.waitingForInput || !normalized.output.trim()) {
    return false
  }
  const text = String(taskText || '').toLowerCase()
  const cleanCommand = stripPromptPrefix(command).toLowerCase()
  if (isDiscoveryOnlyCommand(cleanCommand)) {
    return /(路径|位置|在哪|指向|path|location|where|which|whereis|type)/i.test(text)
  }
  if (/(版本|version)/i.test(text)) {
    return /(?:--version|\s-v(?:\s|$)|\sv\b|\bversion\b)/i.test(cleanCommand) || /(?:version|版本)\s*[:=]?\s*\S+/i.test(normalized.output)
  }
  if (/(日志|log|日志文件)/i.test(text)) {
    return /(?:journalctl|tail|head|less|more|cat|grep|rg|log)/i.test(cleanCommand)
  }
  if (/(状态|status|是否运行|运行情况)/i.test(text)) {
    return /(?:status|ps|pgrep|pidof|systemctl|service|health|check)/i.test(cleanCommand)
  }
  return true
}

// 2026-09-01 coder(lq): A terminal task may only finish when at least one completed command is relevant to the user's request; a successful but unrelated probe (for example `date` during a log query) is not an answer.
function hasRelevantAnswerEvidence (taskText = '', toolCalls = []) {
  return toolCalls.some(tool => (
    tool?.status === 'completed' &&
    tool?.args?.command &&
    hasAnswerEvidence(taskText, tool.args.command, tool.result)
  ))
}

export { hasAnswerEvidence, hasRelevantAnswerEvidence, normalizeToolResult }
