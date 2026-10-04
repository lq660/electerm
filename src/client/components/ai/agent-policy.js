import { normalizeToolResult } from './agent-result-utils.js'
const AGENT_CONFIRMATION_TIMEOUT = 15 * 60 * 1000
const MAX_FALLBACK_COMMANDS = 5
const MAX_NO_ACTION_REPAIRS = 2
// 2026-09-11 coder(lq): Real diagnostic commands may contain several filters and
// pipelines. Keep a defensive size limit without rejecting normal agent work.
const MAX_AGENT_COMMAND_LENGTH = 16 * 1024
// 2026-09-02 coder(lq): Providers without native tool calls still need a bounded
// multi-step loop (for example path -> version). Limit planner turns so a
// provider cannot keep probing forever when it never reaches an answer.
const MAX_GENERIC_PLAN_ATTEMPTS = 6
// 2026-09-02 coder(lq): Structured tool calls are the only command source by default. Keep the old text scanner opt-in for legacy providers instead of silently executing prose.
const ENABLE_LEGACY_COMMAND_FALLBACK = false
// 2026-09-02 coder(lq): Providers that ignore native tool schemas still get one generic recovery turn. The planner must return strict JSON; ordinary prose is never executed.
const ENABLE_GENERIC_COMMAND_PLANNER = true
const DESTRUCTIVE_PROGRAMS = new Set([
  'rm',
  'rmdir',
  'mv',
  'cp',
  'chmod',
  'chown',
  'kill',
  'pkill',
  'reboot',
  'shutdown',
  'halt',
  'poweroff',
  'mkdir',
  'touch',
  'ln',
  'unlink'
])
const NON_TERMINAL_TASK_RE = /(写一封|写邮件|翻译|润色|解释一下概念|什么是|介绍一下|帮我写文案|总结这段|起个名字|生成图片|讲个笑话)/i
const TERMINAL_TASK_RE = /(当前|服务器|终端|ssh|目录|文件|日志|报错|错误|端口|进程|服务|安装|路径|配置|磁盘|空间|大小|系统|机器|环境|命令|执行|运行|查看|检查|定位|统计|版本|状态|连接|部署|upgrade|update|install|remove|restart|start|stop|deploy|configure|migrate|version)/i
const TRANSFER_TASK_RE = /(?:(?:远程|本地|服务器|主机|sftp|scp|remote|local).*(?:拷贝|复制|下载|上传|传输|同步|拉取|推送|copy|download|upload|transfer|sync)|(?:拷贝|复制|下载|上传|传输|同步|拉取|推送|copy|download|upload|transfer|sync).*(?:远程|本地|服务器|主机|sftp|scp|remote|local))/i
const INCOMPLETE_AGENT_TEXT_RE = /(如果你要我继续|下一步(?:会|将|可以)|我(?:先|再|继续)(?:查|确认|检查|核对|执行)|仍然|尚未|未(?:完成|解决|变成|切换)|没有(?:解决|变成|切换)|需要(?:再|继续)|无法确认|还需要)/i
const MUTATION_TOKEN_RE = /(?:^|\s)(?:install|upgrade|update|uninstall|remove|delete|add|create|start|stop|restart|reload|enable|disable|deploy|publish|apply|patch|migrate|configure|set|write|edit|move|copy|rename|kill|reset|clean|purge|destroy|drop|truncate|flush|format|push|pull|commit|merge|rebase|checkout|switch|restore|clone|build|run|exec|prune|rollout|scale|drain|cordon|uncordon)(?:\s|$|[-_=])/i
const READ_ONLY_TOKEN_RE = /(?:^|\s)(?:cat|head|tail|less|more|grep|rg|find|locate|ls|pwd|stat|du|df|uname|env|printenv|whoami|id|date|ps|top|free|uptime|which|whereis|type|command\s+-v|status|list|show|view|get|describe|inspect|info|check|query|search|version|--version|-v|-V|help|--help|diff|log|outdated|explain|read|print|echo|test)(?:\s|$|[-_=])/i
const DATA_DELETION_PROGRAMS = new Set([
  'rm',
  'unlink',
  'shred',
  'wipefs',
  'mkfs',
  'dd',
  'fdisk',
  'parted'
])
const DATA_DELETION_TOKEN_RE = /(?:^|\s)(?:drop|truncate|destroy|purge|format|reset\s+--hard|clean\s+-[a-z]*f|system\s+prune|rm(?=\s|$)|rmdir|unlink|shred|wipefs|mkfs(?:\.[\w-]+)?|find\s+[^\n;|]*-delete|docker\s+(?:volume\s+)?(?:rm|remove|prune)|podman\s+(?:volume\s+)?(?:rm|remove|prune)|kubectl\s+delete|helm\s+uninstall)(?:\s|$|[-_=])/i
// 2026-08-30 coder(lq): Model context contains terminal output as well as commands; reject common output-only lines before they reach confirmation or execution.
const TERMINAL_OUTPUT_ONLY_RE = [
  /^(?:[^:\n]+:\s*)?command not found$/i,
  /^running as root without\b/i,
  /^(?:v)?\d+\.\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?$/i,
  /^(?:chrome|node|electron)\s*\/\s*(?:renderer|zygote|gpu|browser)\b/i,
  /^(?:error|warning|fatal|info)\s*:\s*/i,
  // 2026-09-01 coder(lq): Service/container state lines are evidence, never commands, even when they look shell-shaped.
  /^(?:up|active|inactive|running|stopped|exited|healthy|unhealthy)(?:\s+\d+\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?))?(?:\s+\([^)]*\))?$/i
]
const SAFE_BARE_READ_COMMANDS = new Set([
  'pwd',
  'ls',
  'whoami',
  'id',
  'date',
  'uptime',
  'hostname',
  'env',
  'printenv',
  'true',
  'false',
  'uname',
  'sw_vers',
  'df',
  'du',
  'ps',
  'which',
  'whereis',
  'type'
])
function buildAgentSystemPrompt (config) {
  const lang = config.languageAI || 'English'
  const baseRole = config.roleAI || 'You are a helpful assistant.'
  const terminalExecutionEnabled = config.terminalExecutionEnabled !== false
  const terminalCapabilityText = terminalExecutionEnabled
    ? '当前会话支持终端命令执行。优先用终端命令工具完成服务器、日志、版本、进程、服务、安装、路径、配置等问题。'
    : '当前会话只有 SFTP 文件能力，不能执行终端命令。不要调用终端命令、后台命令或终端状态工具；如果用户需要命令执行，请直接说明需要打开 SSH 终端。'
  return `${baseRole}

You are operating inside 云舵工作台, a terminal/SSH client based on the electerm open-source core. You have access to tools that let you:
- Run commands in terminal tabs and read their output
- Read previous AI conversations for the current terminal when older context is relevant
- Open new terminal tabs (local or SSH)
- Manage bookmarks (create, list, open connections)
- Switch between tabs
- Transfer files via SFTP (upload, download, list, read, delete remote files)

When the user asks you to perform terminal operations, use the available tools.
${terminalCapabilityText}
For local↔remote file copy, download, upload, transfer, or sync tasks, treat them as file-transfer tasks and use sftp_upload or sftp_download directly. Do not route them through shell commands just to inspect or echo paths.
Agent mode must be action oriented:
- Treat every request as a small state machine: identify the user's goal and required evidence, execute the minimum necessary step, then either finish or choose exactly one next step. Do not create a broad investigation unless the user asks for diagnosis.
- If the task requires checking or changing terminal state, call tools. Do not only print shell commands in Markdown.
- For server/terminal questions about files, logs, errors, ports, processes, installed software, service status, disk usage, network, environment variables, scripts, or the current machine, use tools or commands unless the user clearly asks a conceptual question unrelated to the current terminal.
- Use get_terminal_status only when the task genuinely needs the live interactive terminal state; do not call it as a generic preflight.
- AI chat records are kept until the user clears them. Do not assume only the latest messages are available: when prior conversation matters, call get_ai_chat_history and choose an appropriate limit yourself. Do not read the entire history by default.
- Return at most one terminal command tool call per assistant turn. Wait for its real result before choosing another command; never batch speculative or unrelated commands.
- For a specific question, run only the smallest command that can answer it. Do not add generic uname, OS, pwd, npm, or process checks unless the user asks for them or the previous result proves they are needed.
- After a successful terminal result that already answers the question, stop immediately with the conclusion. Do not keep narrating "I will check again" or ask to continue.
- For log or error requests, treat words such as “今天” as a time filter for the logs, not as a request for the current clock. A date/time command alone is never evidence of log content; use the service log reader or a targeted log search command.
- A progress sentence without a tool call is not a completed turn: either call the next appropriate tool now or provide the final answer. Do not emit repeated promises to check something later.
- After every command, read the returned exitCode/output and decide the next step from the real result.
- Once the requested fact is present in a successful tool result, stop and answer with that fact; do not continue exploring for context.
- When a read-only query has a successful result that answers the user's question, stop calling tools and immediately give the observed result. Never replace a conclusion with another plan or a promise to check later.
- For a requested state change, first inspect the current state, then call the command tool for the change. The application may pause for user approval; after approval, continue the same task and verify the result instead of stopping at the confirmation step.
- After a mutating command, run a concrete read-only verification (version, status, health check, or equivalent) and report the observed result. Do not claim success from a command being submitted alone.
- Never repeat the exact same mutating command more than once. If it fails, inspect the error and choose a different corrective step or explain the blocker.
- Use read-only diagnostic commands first. Do not run destructive commands unless the user explicitly asked for that operation.
- Do not run a bare program name as a diagnostic command. Understand the user's goal first, then use an explicit read-only check that matches the goal, such as checking an executable path, version/config output, service status, process, port, log, or file path.
- Never copy terminal output into the command field. Lines such as 'command not found', version strings, process names, and browser/runtime diagnostics are results, not commands; after seeing them, construct a new explicit shell command.
- If a command times out or waits for input, explain the state and ask the user for confirmation instead of pretending it finished.
Briefly explain what you are doing before or alongside tool use, then finish with a concise conclusion.
If a command produces errors, analyze the output and try to fix the issue.
Prefer using the active terminal unless the user specifies otherwise.
For SSH connections, prefer using open_tab to connect directly, or create a bookmark with add_bookmark and open it with open_bookmark if the user wants to save the connection.
For file transfers, use the sftp_upload and sftp_download tools. The tab must be an SSH/FTP connection with SFTP initialized.

Reply in ${lang} language.`
}

function stripPromptPrefix (line = '') {
  return line
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')
    .replace(/^\s*(?:[\w.-]+@[\w.-]+(?::[^#$%>]*)?[#$%>]\s*)/, '')
    .replace(/^\s*(?:[$#%>]\s*)/, '')
    .trim()
}

function isLikelyShellCommand (line = '') {
  const command = stripPromptPrefix(line)
  if (!command || command.length > MAX_AGENT_COMMAND_LENGTH || command.includes('\0')) {
    return false
  }
  // 2026-09-11 coder(lq): Shell arguments may legitimately contain Unicode
  // paths or localized log patterns. Validate command shape and risk instead of
  // treating argument language as a security boundary.
  if (/^(http|https):\/\//.test(command)) {
    return false
  }
  if (TERMINAL_OUTPUT_ONLY_RE.some(pattern => pattern.test(command))) {
    return false
  }
  // 2026-08-30 coder(lq): Bare process names copied from ps/browser output are not useful diagnostics; require arguments or an explicit safe read-only command.
  if (/^[A-Za-z_./~$][\w./:@$%+~=,-]*$/.test(command) && !SAFE_BARE_READ_COMMANDS.has(command)) {
    return false
  }
  // 2026-08-30 coder(lq): Accept command-shaped fallback text without maintaining a product or CLI allowlist.
  if (/^(?:i|we|you|please|run|execute|check|先|然后|接下来)\b[\s,:]/i.test(command)) {
    return false
  }
  return /^[A-Za-z_./~$][\w./:@$%+~=,-]*(?:\s+\S+|\s*[|;&]|\s*$)/.test(command)
}

function getInvalidAgentCommandReason (command = '') {
  const normalized = stripPromptPrefix(command)
  if (!normalized) {
    return '模型没有提供可执行的命令。'
  }
  if (TERMINAL_OUTPUT_ONLY_RE.some(pattern => pattern.test(normalized))) {
    return '这段内容看起来是终端输出或报错，不是命令，已拦截。'
  }
  if (/^[A-Za-z_./~$][\w./:@$%+~=,-]*$/.test(normalized) && !SAFE_BARE_READ_COMMANDS.has(normalized)) {
    return '这只是一个没有参数的程序名，不足以作为诊断命令，已拦截。请补充具体子命令或查询参数。'
  }
  if (!isLikelyShellCommand(normalized)) {
    return '这段内容不是可识别的 Shell 命令，已拦截。'
  }
  return ''
}

function tokenizeShellSegment (segment = '') {
  return segment.match(/"[^"]*"|'[^']*'|[^\s]+/g) || []
}

function normalizeShellToken (token = '') {
  return String(token || '').replace(/^['"]|['"]$/g, '')
}

function stripShellWrappers (tokens = []) {
  const result = tokens.map(normalizeShellToken).filter(Boolean)
  while (result.length) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(result[0])) {
      result.shift()
      continue
    }
    if (['env', 'command', 'builtin', 'nohup', 'time'].includes(result[0])) {
      result.shift()
      continue
    }
    break
  }
  return result
}

function hasUnsafeShellRedirection (command = '') {
  return /(^|[\s;&|])\d*>>?\s*(?!&|\/dev\/null\b)/.test(command)
}

function hasUnsafeShellPipeline (command = '') {
  // 2026-08-30 coder(lq): Remote-script pipelines can change system state even when they do not use sudo or a package manager.
  return /\b(?:curl|wget)\b[^;\n|]*\|\s*(?:ba)?sh\b/i.test(command)
}

function isDestructiveShellSegment (segment = '') {
  const tokens = stripShellWrappers(tokenizeShellSegment(segment))
  if (!tokens.length) {
    return false
  }

  const command = tokens[0].split('/').pop()
  if (command === 'sudo' || command === 'su') {
    return true
  }
  if (DESTRUCTIVE_PROGRAMS.has(command)) {
    return true
  }
  if (command === 'sed' && tokens.some(token => /^-.*i/.test(token))) {
    return true
  }
  if (command === 'perl' && tokens.some(token => /^-.*i/.test(token))) {
    return true
  }
  if (command === 'tee') {
    return true
  }
  if (command === 'find' && tokens.some(token => token === '-delete' || token === '-exec')) {
    return true
  }
  if (command === 'xargs' && tokens.some(token => DESTRUCTIVE_PROGRAMS.has(token.split('/').pop()))) {
    return true
  }
  // 2026-08-30 coder(lq): Detect state-changing intent generically; new tools do not require client updates.
  return MUTATION_TOKEN_RE.test(` ${tokens.join(' ')}`)
}

function isDestructiveShellCommand (command = '') {
  const cleanCommand = stripPromptPrefix(command)
  if (!cleanCommand) {
    return false
  }
  // 2026-07-24 coder(lq): Agent mode may propose risky commands, but execution must stop here until the user explicitly confirms.
  return hasUnsafeShellRedirection(cleanCommand) ||
    hasUnsafeShellPipeline(cleanCommand) ||
    cleanCommand.split(/&&|\|\||[;|\n]/).some(isDestructiveShellSegment)
}

function isDataDeletionShellSegment (segment = '') {
  const tokens = stripShellWrappers(tokenizeShellSegment(segment))
  if (!tokens.length) {
    return false
  }
  const program = tokens[0].split('/').pop()
  if (program === 'sudo' || program === 'su') {
    return isDataDeletionShellSegment(tokens.slice(1).join(' '))
  }
  if (DATA_DELETION_PROGRAMS.has(program) && !(
    (program === 'fdisk' && tokens.some(token => /^(-l|--list)$/.test(token))) ||
    (program === 'parted' && tokens.some(token => /^(print|unit|help|--help)$/.test(token)))
  )) {
    return true
  }
  if (program === 'find' && tokens.some(token => token === '-delete')) {
    return true
  }
  if (program === 'git' && tokens.some(token => /^reset$/.test(token)) && tokens.some(token => token === '--hard')) {
    return true
  }
  if (program === 'git' && tokens.some(token => /^clean$/.test(token)) && tokens.some(token => /-[^-]*f/.test(token))) {
    return true
  }
  if (program === 'xargs' && tokens.some(token => DATA_DELETION_PROGRAMS.has(token.split('/').pop()))) {
    return true
  }
  return DATA_DELETION_TOKEN_RE.test(` ${tokens.join(' ')}`)
}

function isDataDeletionCommand (command = '') {
  const cleanCommand = stripPromptPrefix(command)
  if (!cleanCommand) {
    return false
  }
  // 2026-09-01 coder(lq): Only irreversible data deletion/overwrite operations require confirmation; ordinary server changes run without an extra prompt.
  return cleanCommand.split(/&&|\|\||[;|\n]/).some(isDataDeletionShellSegment)
}

function classifyCommandRisk (command = '') {
  const cleanCommand = stripPromptPrefix(command)
  if (!cleanCommand || isReadOnlyVerificationCommand(cleanCommand)) {
    return 'low'
  }
  if (isDataDeletionCommand(cleanCommand)) {
    return 'high'
  }
  // 2026-09-01 coder(lq): Medium-risk state changes are allowed to run directly; high risk is reserved for data deletion.
  return 'medium'
}

function getCommandRiskLabel (risk = 'medium') {
  return risk === 'high' ? '高风险' : risk === 'medium' ? '中风险' : '低风险'
}

function buildCommandConfirmationMessage (command, risk) {
  const label = getCommandRiskLabel(risk)
  if (risk === 'high') {
    return `${label}命令可能删除或覆盖数据，已暂停等待确认。确认后执行，并在完成后继续验证：${command}`
  }
  return `${label}命令会改变终端状态，将直接执行并在完成后继续验证：${command}`
}

function isSafeFallbackCommand (command = '') {
  return isLikelyShellCommand(command) && !isDestructiveShellCommand(command)
}

function isExecutableAgentCommand (command = '') {
  return isSafeFallbackCommand(command)
}

function isAllowedActionCommand (command = '') {
  // 2026-08-31 coder(lq): Mutation commands are valid agent actions when the task explicitly asks for a change; risk classification and confirmation remain the execution guard.
  return isLikelyShellCommand(command)
}

function isExplicitMutationTask (text = '') {
  return /(升级|更新|安装|卸载|删除|重启|启动|停止|部署|发布|修改|配置|迁移|upgrade|update|install|uninstall|remove|restart|start|stop|deploy|publish|configure|migrate)/i.test(String(text || ''))
}

function extractFallbackCommands (content = '', options = {}) {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(item => item?.text || item?.content || '').join('\n')
      : String(content || '')
  const codeBlocks = [...text.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)]
  const inlineCodes = [...text.matchAll(/`([^`\n]+)`/g)].map(match => match[1])
  const indentedCodeLines = text
    .split('\n')
    .filter(line => /^\s{2,}\S/.test(line))
    .map(line => line.trim())
  const explicitlyLabeledCommands = text
    .split('\n')
    .map(line => line.match(/^\s*(?:命令|执行命令|终端命令|command|run(?:\s+the)?\s+command)\s*[:：]\s*(.+)$/i)?.[1])
    .filter(Boolean)
  const candidates = [
    ...codeBlocks.flatMap(match => match[1].split('\n')),
    ...inlineCodes,
    ...indentedCodeLines,
    ...explicitlyLabeledCommands,
    // Preserve compatibility with providers that return a single bare command, but never scan ordinary prose line by line.
    ...(text.trim() && !text.includes('\n') ? [text.trim()] : [])
  ]
  const seen = new Set()
  const isAllowed = options.allowMutations ? isAllowedActionCommand : isExecutableAgentCommand
  return candidates
    .map(stripPromptPrefix)
    .filter(command => {
      if (!isAllowed(command) || seen.has(command)) {
        return false
      }
      seen.add(command)
      return true
    })
    .slice(0, MAX_FALLBACK_COMMANDS)
}

function isReadOnlyVerificationCommand (command = '') {
  // 2026-08-30 coder(lq): Only commands with generic inspection vocabulary are auto-approved; unknown actions stay confirmable without a product allowlist.
  const cleanCommand = stripPromptPrefix(command)
  return isExecutableAgentCommand(cleanCommand) &&
    !isDestructiveShellCommand(cleanCommand) &&
    READ_ONLY_TOKEN_RE.test(` ${cleanCommand}`)
}

function hasSuccessfulToolResult (result) {
  return normalizeToolResult(result).success
}

function stripAnsiText (value = '') {
  const ansiPattern = new RegExp(String.fromCharCode(27) + '\\[[0-?]*[ -/]*[@-~]', 'g')
  return String(value || '').replace(ansiPattern, '')
}

function shortenSummaryLine (line = '', maxLength = 180) {
  const text = String(line || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}…`
}

// 2026-08-31 coder(lq): Keep raw tool output for the agent, but show a concise evidence summary in the conversation so long version/config dumps do not bury the answer.
export function summarizeAgentOutput (output = '', exitCode) {
  const lines = stripAnsiText(output)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  if (!lines.length) {
    return exitCode === 0 ? '执行成功，无输出。' : '命令没有返回可用输出。'
  }

  const priority = /(version|版本|status|状态|active|running|failed|failure|error|warning|path|路径|port|端口|pid|process|进程|installed|安装|up to date|already|success|successful|成功|失败|not found|不存在|enabled|disabled|loaded|listening|config|配置|log|日志)/i
  const noisyDiagnosticLine = /^(?:configure arguments?:|--(?:prefix|sbin-path|modules-path|http-|pid-path|lock-path|user|group)=)/i
  const selected = []
  const seen = new Set()
  const addLine = line => {
    const shortened = shortenSummaryLine(line)
    if (!shortened || seen.has(shortened)) return
    seen.add(shortened)
    selected.push(shortened)
  }

  // Prefer diagnostic facts, then retain the beginning for commands such as pwd/ls/df.
  lines.filter(line => priority.test(line) && !noisyDiagnosticLine.test(line)).slice(0, 4).forEach(addLine)
  lines.slice(0, 3).forEach(addLine)
  const compact = selected.slice(0, 4)
  const omitted = lines.length - compact.length
  if (omitted > 0) {
    compact.push(`已省略 ${omitted} 行详细输出，可展开命令查看。`)
  }
  return compact.join('\n')
}

// 2026-08-31 coder(lq): Keep a local evidence summary so a provider that repeats planning text cannot hide the real command results from the user.
function buildToolEvidenceSummary (toolCalls = []) {
  const observed = toolCalls.filter(tool => (
    (tool.status === 'completed' || tool.status === 'error' || tool.status === 'skipped') && tool.result
  ))
  if (!observed.length) return ''
  return observed.map(tool => {
    let parsed
    try {
      parsed = typeof tool.result === 'string' ? JSON.parse(tool.result) : tool.result
    } catch {
      parsed = null
    }
    const command = shortenSummaryLine(tool.args?.command || tool.name, 260)
    const exitCode = parsed?.exitCode !== undefined && parsed?.exitCode !== null
      ? `退出码：${parsed.exitCode}`
      : ''
    const rawOutput = parsed?.output || [parsed?.stdout, parsed?.stderr].filter(Boolean).join('\n') || parsed?.message || (typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result))
    const output = summarizeAgentOutput(rawOutput, parsed?.exitCode)
    const status = tool.status === 'error' ? '\n状态：执行失败' : tool.status === 'skipped' ? '\n状态：已跳过' : ''
    return `命令：${command}${exitCode ? `\n${exitCode}` : ''}${status}\n摘要：${String(output || '（无输出）').trim()}`
  }).join('\n\n')
}

function isLowValueAssistantParagraph (paragraph = '') {
  const text = String(paragraph || '').trim()
  if (!text) return true
  if (isProgressOnlyContent(text)) return true
  if (/^(?:我(?:先|再|继续|直接|来|现在|补查)|下一步)/.test(text) && /(?:查|确认|检查|核对|执行|验证|读取|看|做一次)/.test(text)) {
    return true
  }
  if (/^(?:执行结果|工具结果|命令结果)\s*[：:]?$/i.test(text)) return true
  // 2026-09-01 coder(lq): Follow-up offers are useful in a live agent loop, but add noise after a task is already answered.
  return /^(?:如果你(?:要|希望|还想)|如需|需要我(?:继续|再))/.test(text)
}

export function extractConciseAgentAnswer (content = '') {
  let text = getAssistantText(content).replace(/\r/g, '').trim()
  if (!text) return ''

  // Providers sometimes echo the command evidence after their answer. Tool cards already own that detail.
  text = text.replace(/\n\s*(?:执行结果|工具结果|命令结果)\s*[：:]?[\s\S]*$/i, '').trim()
  const paragraphs = text.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const kept = []
  for (const paragraph of paragraphs) {
    const cleanedParagraph = paragraph
      .split('\n')
      .filter(line => !isLowValueAssistantParagraph(line))
      .join('\n')
      .trim()
    if (!cleanedParagraph || isLowValueAssistantParagraph(cleanedParagraph)) continue
    const withoutOffer = cleanedParagraph.split(/\n\s*(?:如果你(?:要|希望)|如需|需要我(?:继续|再))/)[0].trim()
    if (!withoutOffer || isLowValueAssistantParagraph(withoutOffer)) continue
    const normalized = withoutOffer.replace(/\s+/g, ' ').toLowerCase()
    const duplicateIndex = kept.findIndex(item => {
      const candidate = item.replace(/\s+/g, ' ').toLowerCase()
      return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate)
    })
    if (duplicateIndex === -1) {
      kept.push(withoutOffer)
    } else if (withoutOffer.length > kept[duplicateIndex].length) {
      kept[duplicateIndex] = withoutOffer
    }
  }
  return kept.join('\n\n').trim()
}

function buildFinalAgentResponse (content = '', toolCalls = [], fallback = 'AI 没有返回结果。') {
  const text = extractConciseAgentAnswer(content)
  const evidence = buildToolEvidenceSummary(toolCalls)
  if (!evidence) {
    return text || fallback
  }
  // 2026-09-01 coder(lq): Let the assistant answer own the transcript; command cards keep the raw evidence available on demand.
  if (!text || /^(?:已完成|完成|好的|收到)[。.!！]?$/i.test(text)) {
    return `结论\n\n${evidence}`
  }
  return text
}

export function appendUniqueAssistantContent (current, next) {
  const content = String(next || '').trim()
  if (!content) return current
  if (!current) return content
  // 2026-09-01 coder(lq): Merge at paragraph level so repeated plans are removed and a newer conclusion replaces its shorter draft.
  const normalizeParagraph = value => String(value || '').replace(/\s+/g, ' ').trim()
  const currentParagraphs = current.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const nextParagraphs = content.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean)
  const merged = [...currentParagraphs]
  for (const paragraph of nextParagraphs) {
    const normalized = normalizeParagraph(paragraph)
    const existingIndex = merged.findIndex(item => {
      const candidate = normalizeParagraph(item)
      return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate) || (
        /^(?:结论|最终结论|执行结果)\s*[：:]/i.test(candidate) &&
        /^(?:结论|最终结论|执行结果)\s*[：:]/i.test(normalized)
      )
    })
    if (existingIndex === -1) {
      merged.push(paragraph)
    } else if (paragraph.length > merged[existingIndex].length) {
      merged[existingIndex] = paragraph
    }
  }
  const hasConclusion = /(?:结论|最终|结果是|已完成|成功|失败|原因是)\s*[：:]/i.test(content)
  if (hasConclusion) {
    return merged.join('\n\n')
  }
  return merged.join('\n\n')
}

function getAssistantText (content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'string') return item
      return item?.text || item?.content || ''
    }).filter(Boolean).join('\n')
  }
  return content ? String(content) : ''
}

function normalizeAssistantMessage (message, iteration = 0) {
  if (!message || typeof message !== 'object') return message
  const normalized = { ...message }
  let toolCalls = normalized.tool_calls
  if (!toolCalls && normalized.function_call) {
    // 2026-08-31 coder(lq): Accept legacy OpenAI-compatible function_call responses so providers that predate tool_calls can still execute actions.
    toolCalls = [{
      id: `legacy-call-${Date.now()}-${iteration}`,
      type: 'function',
      function: normalized.function_call
    }]
    delete normalized.function_call
  }
  if (!toolCalls && typeof normalized.content === 'string') {
    // 2026-09-02 coder(lq): Some OpenAI-compatible gateways serialize a tool
    // call as JSON content instead of filling tool_calls. Accept only an
    // explicitly structured object; never scan ordinary prose for commands.
    const candidateText = normalized.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    if (candidateText.startsWith('{')) {
      try {
        const parsed = JSON.parse(candidateText)
        const structuredCalls = Array.isArray(parsed.tool_calls)
          ? parsed.tool_calls
          : parsed.name && parsed.arguments !== undefined
            ? [parsed]
            : []
        if (structuredCalls.length) {
          toolCalls = structuredCalls
          normalized.content = ''
        }
      } catch {
        // Keep normal assistant text unchanged when it is not valid tool JSON.
      }
    }
  }
  if (typeof toolCalls === 'string') {
    try {
      toolCalls = JSON.parse(toolCalls)
    } catch {
      toolCalls = []
    }
  }
  normalized.tool_calls = Array.isArray(toolCalls)
    ? toolCalls.map((toolCall, index) => {
      const rawFunction = toolCall?.function || toolCall
      const functionName = rawFunction?.name || toolCall?.name
      let args = rawFunction?.arguments ?? toolCall?.arguments ?? '{}'
      if (typeof args !== 'string') {
        args = JSON.stringify(args || {})
      }
      return {
        ...toolCall,
        id: toolCall?.id || `tool-call-${Date.now()}-${iteration}-${index}`,
        type: toolCall?.type || 'function',
        function: {
          ...rawFunction,
          name: functionName,
          arguments: args
        }
      }
    }).filter(toolCall => toolCall.function.name)
    : []
  return normalized
}

function isProgressOnlyContent (content = '') {
  const text = getAssistantText(content).trim()
  if (!text || !INCOMPLETE_AGENT_TEXT_RE.test(text)) return false
  // 2026-08-31 coder(lq): Keep repetitive planning narration out of the transcript while preserving conclusions and command evidence.
  return !/(结论|执行结果|退出码|输出|版本是|当前是|成功|失败|原因是|已完成|无法继续)/i.test(text)
}

export function classifyAgentTask (text = '') {
  const normalized = String(text || '')
  const requiresTransfer = TRANSFER_TASK_RE.test(normalized)
  if (requiresTransfer) {
    return {
      kind: 'transfer',
      phase: 'inspect',
      requiresTerminal: false,
      requiresMutation: false
    }
  }
  const requiresMutation = isExplicitMutationTask(normalized)
  const requiresTerminal = requiresMutation || TERMINAL_TASK_RE.test(normalized)
  return {
    kind: requiresTerminal ? (requiresMutation ? 'mutation' : 'terminal') : 'conversation',
    phase: requiresTerminal ? 'inspect' : 'answer',
    requiresTerminal,
    requiresMutation
  }
}

export function parseCommandPlan (text = '', options = {}) {
  const allowMutations = options.allowMutations === true
  const strict = options.strict === true
  const isAllowed = allowMutations
    ? command => isExecutableAgentCommand(command) || isAllowedActionCommand(command)
    : isExecutableAgentCommand
  const raw = String(text || '').trim()
  const candidates = [
    raw,
    raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim(),
    raw.match(/\[[\s\S]*\]/)?.[0] || ''
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const arr = Array.isArray(parsed) ? parsed : parsed.commands
      if (!Array.isArray(arr)) {
        continue
      }
      return arr
        .map(item => typeof item === 'string' ? item : item?.command)
        .filter(Boolean)
        .map(stripPromptPrefix)
        .filter(isAllowed)
        .slice(0, MAX_FALLBACK_COMMANDS)
    } catch {
      // try next candidate
    }
  }
  // Strict plans are used by the generic compatibility path. Never fall back to
  // scanning Markdown/prose there, because command-looking output may be evidence.
  if (strict) return []
  return allowMutations
    ? extractFallbackCommands(raw, { allowMutations: true }).slice(0, MAX_FALLBACK_COMMANDS)
    : extractFallbackCommands(raw)
}

function getDeterministicFallbackCommands () {
  // 2026-08-31 coder(lq): Do not inject product-specific probe commands; when a provider omits tools, rely on its explicit plan or report the evidence already collected.
  return []
}

function normalizeAgentCommand (command = '') {
  return stripPromptPrefix(command)
}

function shouldForceTerminalAction (chatEntry, accumulatedContent = '') {
  const text = `${chatEntry.prompt || ''}\n${chatEntry.requestPrompt || ''}\n${accumulatedContent || ''}`
  if (TRANSFER_TASK_RE.test(text)) {
    return false
  }
  if (TERMINAL_TASK_RE.test(text)) {
    return true
  }
  return !NON_TERMINAL_TASK_RE.test(text)
}

function buildNoActionRepairHint (taskProfile) {
  if (taskProfile.kind === 'transfer') {
    return '如果还需要拷贝、下载、上传或同步文件，请直接调用 sftp_upload 或 sftp_download，不要只输出命令文本。'
  }
  if (taskProfile.kind === 'terminal') {
    return '如果需要终端信息，必须调用 get_terminal_status 或 send_terminal_command；不要只输出命令文本或“如果你要我继续”。'
  }
  return '请继续并调用合适工具；如果已经完成，请给出最终结论，不要只列待执行命令。'
}

export { AGENT_CONFIRMATION_TIMEOUT, MAX_FALLBACK_COMMANDS, MAX_NO_ACTION_REPAIRS, MAX_AGENT_COMMAND_LENGTH, MAX_GENERIC_PLAN_ATTEMPTS, ENABLE_LEGACY_COMMAND_FALLBACK, ENABLE_GENERIC_COMMAND_PLANNER, DESTRUCTIVE_PROGRAMS, NON_TERMINAL_TASK_RE, TERMINAL_TASK_RE, TRANSFER_TASK_RE, INCOMPLETE_AGENT_TEXT_RE, MUTATION_TOKEN_RE, READ_ONLY_TOKEN_RE, DATA_DELETION_PROGRAMS, DATA_DELETION_TOKEN_RE, TERMINAL_OUTPUT_ONLY_RE, SAFE_BARE_READ_COMMANDS, buildAgentSystemPrompt, stripPromptPrefix, isLikelyShellCommand, getInvalidAgentCommandReason, tokenizeShellSegment, normalizeShellToken, stripShellWrappers, hasUnsafeShellRedirection, hasUnsafeShellPipeline, isDestructiveShellSegment, isDestructiveShellCommand, isDataDeletionShellSegment, isDataDeletionCommand, classifyCommandRisk, getCommandRiskLabel, buildCommandConfirmationMessage, isSafeFallbackCommand, isExecutableAgentCommand, isAllowedActionCommand, isExplicitMutationTask, extractFallbackCommands, isReadOnlyVerificationCommand, hasSuccessfulToolResult, stripAnsiText, shortenSummaryLine, buildToolEvidenceSummary, isLowValueAssistantParagraph, buildFinalAgentResponse, getAssistantText, normalizeAssistantMessage, isProgressOnlyContent, getDeterministicFallbackCommands, normalizeAgentCommand, shouldForceTerminalAction, buildNoActionRepairHint }
