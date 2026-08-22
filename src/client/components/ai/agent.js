import { agentTools, executeToolCall } from './agent-tools'

const MAX_ITERATIONS = 30
const MAX_FALLBACK_COMMANDS = 5
const FALLBACK_COMMAND_PREFIX = /^(sudo\s+)?(apt|apt-get|yum|dnf|brew|systemctl|service|command|which|docker|docker-compose|kubectl|helm|du|df|ls|pwd|cat|tail|head|grep|find|ps|top|free|uname|sw_vers|netstat|ss|lsof|nginx|openresty|apache2|httpd|mysql|redis-server|postgres|node|npm|pnpm|yarn|pm2|java|python|python3|pip|php|git|tomcat|jenkins|mongod|elasticsearch|kafka|zookeeper|clickhouse|rabbitmq|rocketmq|prometheus|grafana|clash|mihomo|v2ray|xray|sing-box|tar|zip|unzip|curl|wget|chmod|chown|mkdir|rm|cp|mv|sed|awk)\b/
const UNSAFE_FALLBACK_COMMAND = /\b(sudo|su|rm|mv|cp|chmod|chown|kill|pkill|reboot|shutdown|systemctl\s+(restart|stop|disable|enable)|service\s+\S+\s+(restart|stop)|docker\s+(rm|stop|restart|kill|prune)|kubectl\s+(delete|apply|replace|scale))\b/
const AGENT_CONFIRM_COMMAND_MESSAGE = '该命令会改变服务器状态，已停止自动执行。请确认后点击播放按钮手动执行。'
const DESTRUCTIVE_PROGRAMS = new Set([
  'rm',
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
const SERVICE_MUTATION_ACTIONS = new Set([
  'start',
  'stop',
  'restart',
  'reload',
  'enable',
  'disable',
  'mask',
  'unmask',
  'daemon-reload'
])
const PACKAGE_MUTATION_ACTIONS = new Set([
  'install',
  'remove',
  'purge',
  'autoremove',
  'upgrade',
  'dist-upgrade',
  'update',
  'add',
  'uninstall'
])
const DOCKER_MUTATION_ACTIONS = new Set([
  'rm',
  'stop',
  'restart',
  'kill',
  'prune',
  'run',
  'exec',
  'build',
  'pull',
  'push'
])
const DOCKER_COMPOSE_MUTATION_ACTIONS = new Set([
  'up',
  'down',
  'restart',
  'stop',
  'rm',
  'build',
  'pull',
  'push',
  'exec',
  'run'
])
const KUBECTL_MUTATION_ACTIONS = new Set([
  'apply',
  'delete',
  'replace',
  'scale',
  'patch',
  'edit',
  'create',
  'set',
  'rollout',
  'drain',
  'cordon',
  'uncordon'
])
const GIT_MUTATION_ACTIONS = new Set([
  'add',
  'commit',
  'push',
  'pull',
  'merge',
  'rebase',
  'reset',
  'clean',
  'checkout',
  'switch',
  'restore'
])
const NON_TERMINAL_TASK_RE = /(写一封|写邮件|翻译|润色|解释一下概念|什么是|介绍一下|帮我写文案|总结这段|起个名字|生成图片|讲个笑话)/i
const TERMINAL_TASK_RE = /(当前|服务器|终端|ssh|目录|文件|日志|报错|错误|端口|进程|服务|安装|路径|配置|磁盘|空间|大小|系统|机器|环境|命令|执行|运行|查看|检查|定位|统计|nginx|openresty|apache|httpd|mysql|mariadb|redis|postgres|postgresql|node|npm|pm2|java|docker|kubectl|python|php|git|tomcat|jenkins|mongodb|mongo|elasticsearch|kafka|zookeeper|clickhouse|rabbitmq|rocketmq|prometheus|grafana|clash|mihomo|v2ray|xray|sing-box)/i
const SOFTWARE_ALIASES = {
  nginx: 'nginx',
  openresty: 'openresty',
  apache: 'apache2',
  httpd: 'httpd',
  mysql: 'mysql',
  mariadb: 'mysql',
  redis: 'redis-server',
  postgres: 'postgres',
  postgresql: 'postgres',
  node: 'node',
  npm: 'npm',
  pm2: 'pm2',
  java: 'java',
  docker: 'docker',
  kubectl: 'kubectl',
  python: 'python',
  python3: 'python3',
  php: 'php',
  git: 'git',
  tomcat: 'tomcat',
  jenkins: 'jenkins',
  mongodb: 'mongod',
  mongo: 'mongod',
  elasticsearch: 'elasticsearch',
  kafka: 'kafka',
  zookeeper: 'zookeeper',
  clickhouse: 'clickhouse',
  rabbitmq: 'rabbitmq',
  rocketmq: 'rocketmq',
  prometheus: 'prometheus',
  grafana: 'grafana',
  clash: 'clash',
  mihomo: 'mihomo',
  v2ray: 'v2ray',
  xray: 'xray',
  'sing-box': 'sing-box'
}
const DIAGNOSTIC_PROGRAMS = new Set(Object.values(SOFTWARE_ALIASES))

function buildAgentSystemPrompt (config) {
  const lang = config.languageAI || window.store.getLangName()
  const baseRole = config.roleAI || 'You are a helpful assistant.'
  return `${baseRole}

You are operating inside 云舵工作台, a terminal/SSH client based on the electerm open-source core. You have access to tools that let you:
- Run commands in terminal tabs and read their output
- Open new terminal tabs (local or SSH)
- Manage bookmarks (create, list, open connections)
- Switch between tabs
- Transfer files via SFTP (upload, download, list, read, delete remote files)

When the user asks you to perform terminal operations, use the available tools.
Agent mode must be action oriented:
- If the task requires checking or changing terminal state, call tools. Do not only print shell commands in Markdown.
- For server/terminal questions about files, logs, errors, ports, processes, installed software, service status, disk usage, network, environment variables, scripts, or the current machine, use tools or commands unless the user clearly asks a conceptual question unrelated to the current terminal.
- Before running commands, call get_terminal_status once when useful, then call send_terminal_command for each clear command.
- After every command, read the returned exitCode/output and decide the next step from the real result.
- Use read-only diagnostic commands first. Do not run destructive commands unless the user explicitly asked for that operation.
- Do not run a bare program name as a diagnostic command, such as "nginx", "mysql", "redis-server", or "docker". Understand the user's goal first, then use explicit read-only checks that match the goal, such as checking the executable path, version/config output, service status, process, port, log, or file path.
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
  if (!command || command.length > 500) {
    return false
  }
  if (/[\u4e00-\u9fa5]/.test(command)) {
    return false
  }
  if (/^(http|https):\/\//.test(command)) {
    return false
  }
  return FALLBACK_COMMAND_PREFIX.test(command) || (command.includes('|') && /^[\w./~$'"-]/.test(command))
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
  if (command === 'systemctl') {
    const action = tokens.slice(1).find(token => !token.startsWith('-'))
    return SERVICE_MUTATION_ACTIONS.has(action)
  }
  if (command === 'service') {
    const action = tokens.slice(2).find(token => !token.startsWith('-'))
    return SERVICE_MUTATION_ACTIONS.has(action)
  }
  if (['apt', 'apt-get', 'yum', 'dnf', 'brew'].includes(command)) {
    const action = tokens.slice(1).find(token => !token.startsWith('-'))
    return PACKAGE_MUTATION_ACTIONS.has(action)
  }
  if (['npm', 'pnpm', 'yarn'].includes(command)) {
    const action = tokens.slice(1).find(token => !token.startsWith('-'))
    return PACKAGE_MUTATION_ACTIONS.has(action)
  }
  if (command === 'docker' || command === 'docker-compose') {
    const action = tokens.slice(1).find(token => !token.startsWith('-'))
    if (command === 'docker' && action === 'compose') {
      const composeAction = tokens.slice(2).find(token => !token.startsWith('-'))
      return DOCKER_COMPOSE_MUTATION_ACTIONS.has(composeAction)
    }
    if (command === 'docker-compose') {
      return DOCKER_COMPOSE_MUTATION_ACTIONS.has(action)
    }
    return DOCKER_MUTATION_ACTIONS.has(action)
  }
  if (command === 'kubectl') {
    const action = tokens.slice(1).find(token => !token.startsWith('-'))
    return KUBECTL_MUTATION_ACTIONS.has(action)
  }
  if (command === 'git') {
    const action = tokens.slice(1).find(token => !token.startsWith('-'))
    return GIT_MUTATION_ACTIONS.has(action)
  }
  return false
}

function isDestructiveShellCommand (command = '') {
  const cleanCommand = stripPromptPrefix(command)
  if (!cleanCommand) {
    return false
  }
  // 2026-07-24 coder(lq): Agent mode may propose risky commands, but execution must stop here until the user explicitly confirms.
  return hasUnsafeShellRedirection(cleanCommand) ||
    cleanCommand.split(/&&|\|\||[;|\n]/).some(isDestructiveShellSegment)
}

function isSafeFallbackCommand (command = '') {
  if (!isLikelyShellCommand(command)) {
    return false
  }
  // 2026-07-24 coder(lq): Fallback execution is only for clear diagnostic commands; destructive actions must come through explicit tool calls.
  return !UNSAFE_FALLBACK_COMMAND.test(command) && !isDestructiveShellCommand(command)
}

function isBareDiagnosticProgramCommand (command = '') {
  const cleanCommand = stripPromptPrefix(command)
  if (!/^[./\w-]+$/.test(cleanCommand)) {
    return false
  }
  const program = cleanCommand.split('/').pop()
  return DIAGNOSTIC_PROGRAMS.has(program)
}

function isExecutableAgentCommand (command = '') {
  return isSafeFallbackCommand(command) && !isBareDiagnosticProgramCommand(command)
}

function extractFallbackCommands (content = '') {
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
  const candidates = [
    ...codeBlocks.flatMap(match => match[1].split('\n')),
    ...inlineCodes,
    ...indentedCodeLines,
    ...text.split('\n')
  ]
  const seen = new Set()
  return candidates
    .map(stripPromptPrefix)
    .filter(command => {
      if (!isExecutableAgentCommand(command) || seen.has(command)) {
        return false
      }
      seen.add(command)
      return true
    })
    .slice(0, MAX_FALLBACK_COMMANDS)
}

function parseCommandPlan (text = '') {
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
        .filter(isExecutableAgentCommand)
        .slice(0, MAX_FALLBACK_COMMANDS)
    } catch {
      // try next candidate
    }
  }
  return extractFallbackCommands(raw)
}

function addCommand (commands, command) {
  if (isExecutableAgentCommand(command) && !commands.includes(command)) {
    commands.push(command)
  }
}

function findMentionedSoftware (text = '') {
  const lower = String(text || '').toLowerCase()
  return Object.keys(SOFTWARE_ALIASES).find(name => lower.includes(name))
}

function grepPatternForProcess (name = '') {
  if (!name) {
    return ''
  }
  return `[${name[0]}]${name.slice(1)}`
}

function getDeterministicFallbackCommands (text = '') {
  const commands = []
  const lower = String(text || '').toLowerCase()
  const software = findMentionedSoftware(lower)
  const executable = software ? SOFTWARE_ALIASES[software] : ''

  if (/(目录.*大小|大小.*目录|统计.*大小|磁盘|空间|占用|du|df)/i.test(lower)) {
    addCommand(commands, 'pwd')
    addCommand(commands, 'df -h')
    addCommand(commands, 'du -sh ./* 2>/dev/null | sort -h')
  }

  if (/(端口|监听|listen|port)/i.test(lower)) {
    addCommand(commands, 'ss -tunlp 2>/dev/null || netstat -tunlp 2>/dev/null || true')
  }

  if (executable) {
    const processPattern = grepPatternForProcess(executable)
    addCommand(commands, `command -v ${executable} || which ${executable} || true`)
    addCommand(commands, `${executable} --version 2>&1 || ${executable} -v 2>&1 || ${executable} -V 2>&1 || true`)
    if (/(目录|位置|安装|路径|配置|在哪|where|find|installed|日志|log|报错|错误|error)/i.test(lower)) {
      addCommand(commands, `find /etc /usr/local /opt /var/log /var/www -maxdepth 4 -iname '*${software}*' 2>/dev/null | head -80`)
    }
    addCommand(commands, `ps -ef | grep -i '${processPattern}' || true`)
    if (/(服务|状态|运行|启动|service|status)/i.test(lower)) {
      addCommand(commands, `systemctl status ${executable} --no-pager 2>/dev/null || service ${executable} status 2>/dev/null || true`)
    }
  }

  if (!commands.length && /(系统|机器|环境|版本|信息|当前)/i.test(lower)) {
    addCommand(commands, 'uname -a')
    addCommand(commands, 'cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null || true')
    addCommand(commands, 'pwd')
  }

  if (!commands.length && shouldForceTerminalAction({ prompt: text })) {
    // 2026-07-24 coder(lq): If the provider does not produce tool calls or JSON plans, still make agent mode visibly useful with harmless context probes.
    addCommand(commands, 'pwd')
    addCommand(commands, 'ls -la | head -80')
  }

  return commands.slice(0, MAX_FALLBACK_COMMANDS)
}

function normalizeAgentCommand (command = '') {
  return stripPromptPrefix(command)
}

function shouldForceTerminalAction (chatEntry, accumulatedContent = '') {
  const text = `${chatEntry.prompt || ''}\n${chatEntry.requestPrompt || ''}\n${accumulatedContent || ''}`
  if (TERMINAL_TASK_RE.test(text)) {
    return true
  }
  return !NON_TERMINAL_TASK_RE.test(text)
}

function updateChatEntry (chatEntry, updates) {
  const index = window.store.aiChatHistory.findIndex(i => i.id === chatEntry.id)
  if (index !== -1) {
    Object.assign(window.store.aiChatHistory[index], updates)
    window.store.aiChatHistory = [...window.store.aiChatHistory]
  }
}

async function callBackendAIchatWithTools (messages, config) {
  return window.pre.runGlobalAsync(
    'AIchatWithTools',
    messages,
    config.modelAI,
    config.baseURLAI,
    config.apiPathAI,
    config.apiKeyAI,
    config.proxyAI,
    agentTools,
    config.authHeaderNameAI
  )
}

async function callBackendAIchatText (prompt, config) {
  return window.pre.runGlobalAsync(
    'AIchat',
    prompt,
    config.modelAI,
    '你是终端任务命令规划器，只输出严格 JSON，不输出 Markdown。',
    config.baseURLAI,
    config.apiPathAI,
    config.apiKeyAI,
    config.proxyAI,
    false,
    config.authHeaderNameAI
  )
}

export async function runAgentLoop (chatEntry, config, abortRef, setIsStreaming) {
  window.store.agentRunning = true
  try {
    const context = {
      defaultTabId: chatEntry.terminalSessionId
    }
    const messages = [
      { role: 'system', content: buildAgentSystemPrompt(config) },
      {
        role: 'user',
        content: `${chatEntry.requestPrompt || chatEntry.prompt}

当前处于代理实验模式。若需要执行命令，请直接调用工具，不要只返回命令文本。`
      }
    ]
    const toolCallsLog = []
    const fallbackCommandsRun = new Set()
    let accumulatedContent = ''
    let noActionRepairCount = 0
    let commandPlanTried = false

    async function readInitialTerminalContext () {
      if (!shouldForceTerminalAction(chatEntry)) {
        return
      }
      try {
        // 2026-07-24 coder(lq): Preflight context helps the agent reason, but it is intentionally hidden to avoid confusing users with a non-action card.
        const toolResult = await executeToolCall('get_terminal_status', {}, context)
        messages.push({
          role: 'user',
          content: `Application preflight terminal context from get_terminal_status:
${toolResult}

Use this real terminal context. If the user task is terminal/server related and still needs evidence, call tools or execute read-only diagnostic commands.`
        })
      } catch (err) {
        messages.push({
          role: 'user',
          content: `Application tried to read terminal context first, but failed: ${err.message}. If the task needs a terminal, explain the problem clearly and ask the user to open/select a terminal tab.`
        })
      }
    }

    async function executeFallbackCommandList (commands, reason) {
      const fallbackResults = []
      for (const rawFallbackCommand of commands) {
        const fallbackCommand = normalizeAgentCommand(rawFallbackCommand, chatEntry.prompt)
        if (!isExecutableAgentCommand(fallbackCommand) || fallbackCommandsRun.has(fallbackCommand)) {
          continue
        }
        fallbackCommandsRun.add(fallbackCommand)
        const toolEntry = {
          id: `fallback-${Date.now()}-${toolCallsLog.length}`,
          name: 'send_terminal_command',
          args: {
            command: fallbackCommand
          },
          status: 'running',
          result: null,
          fallback: true
        }
        toolCallsLog.push(toolEntry)
        updateChatEntry(chatEntry, {
          toolCalls: [...toolCallsLog],
          response: `${accumulatedContent}\n\n${reason}：\`${fallbackCommand}\``
        })
        try {
          const toolResult = await executeToolCall('send_terminal_command', {
            command: fallbackCommand
          }, context)
          toolEntry.status = 'completed'
          toolEntry.result = toolResult
          fallbackResults.push({
            command: fallbackCommand,
            result: toolResult
          })
          updateChatEntry(chatEntry, {
            toolCalls: [...toolCallsLog]
          })
        } catch (err) {
          toolEntry.status = 'error'
          toolEntry.result = err.message
          setIsStreaming(false)
          updateChatEntry(chatEntry, {
            toolCalls: [...toolCallsLog],
            response: `${accumulatedContent}\n\n执行命令失败：${err.message}`
          })
          return null
        }
      }
      return fallbackResults
    }

    async function buildGenericCommandPlan () {
      if (commandPlanTried || !shouldForceTerminalAction(chatEntry, accumulatedContent)) {
        return []
      }
      commandPlanTried = true
      updateChatEntry(chatEntry, {
        response: `${accumulatedContent || '代理模式没有收到工具调用。'}\n\n正在生成可执行的只读排查命令...`
      })
      const planPrompt = `用户希望在当前终端/服务器上处理这个任务：
${chatEntry.prompt}

当前终端最近上下文和 AI 已有回复：
${chatEntry.requestPrompt || ''}

${accumulatedContent || ''}

请只返回 JSON 数组，每项是一个可以在 Linux/macOS shell 中执行的只读诊断命令字符串，最多 ${MAX_FALLBACK_COMMANDS} 条。
规则：
- 只生成读取、查询、定位、查看状态类命令。
- 用户问文件、日志、错误、端口、进程、服务、已安装软件、命令路径、磁盘、网络、当前机器环境时，应生成对应的只读命令。
- 不要返回裸程序名，例如 nginx、mysql、docker、python；必须根据用户问题生成明确的检查命令。
- 不要生成 sudo、删除、重启、停止、写文件、修改权限、安装软件、改配置等会改变系统状态的命令。
- 如果任务明显不需要终端命令，返回 []。
- 只输出 JSON，不要解释。`
      const result = await callBackendAIchatText(planPrompt, config)
      if (result?.error) {
        updateChatEntry(chatEntry, {
          response: `${accumulatedContent}\n\n生成命令计划失败：${result.error}`
        })
        return []
      }
      return parseCommandPlan(result?.response || '')
        .map(normalizeAgentCommand)
        .filter(isExecutableAgentCommand)
        .filter(command => !fallbackCommandsRun.has(command))
    }

    setIsStreaming(true)
    updateChatEntry(chatEntry, {
      toolCalls: [],
      response: ''
    })
    await readInitialTerminalContext()

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (abortRef && abortRef.current) {
        setIsStreaming(false)
        updateChatEntry(chatEntry, {
          response: accumulatedContent + '\n\n*(Agent stopped by user)*'
        })
        return
      }

      const result = await callBackendAIchatWithTools(messages, config)

      if (result.error) {
        setIsStreaming(false)
        updateChatEntry(chatEntry, {
          response: accumulatedContent + `\n\n**Error:** ${result.error}`
        })
        return
      }

      const assistantMessage = result.message
      if (!assistantMessage) {
        setIsStreaming(false)
        updateChatEntry(chatEntry, {
          response: accumulatedContent || 'No response from AI.'
        })
        return
      }

      messages.push(assistantMessage)

      if (assistantMessage.content) {
        accumulatedContent += (accumulatedContent ? '\n\n' : '') + assistantMessage.content
        updateChatEntry(chatEntry, {
          response: accumulatedContent
        })
      }

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const fallbackCommands = extractFallbackCommands(assistantMessage.content || '')
          .filter(command => !fallbackCommandsRun.has(command))
        if (fallbackCommands.length) {
          const fallbackResults = await executeFallbackCommandList(
            fallbackCommands,
            '模型未返回工具调用，正在执行识别到的诊断命令'
          )
          if (!fallbackResults) {
            return
          }
          messages.push({
            role: 'user',
            content: `The application executed these fallback terminal commands because the previous assistant message did not return tool_calls:

${fallbackResults.map(item => `Command:
${item.command}

Result:
${item.result}`).join('\n\n---\n\n')}

Continue the task based on these real terminal results. If enough information is available, give the conclusion. If one more command is needed, use a tool call.`
          })
          continue
        }
        const genericPlanCommands = await buildGenericCommandPlan()
        if (genericPlanCommands.length) {
          const fallbackResults = await executeFallbackCommandList(
            genericPlanCommands,
            '模型未调用工具，已生成并执行只读排查命令'
          )
          if (!fallbackResults) {
            return
          }
          messages.push({
            role: 'user',
            content: `The application generated and executed read-only diagnostic commands because the assistant did not call tools:

${fallbackResults.map(item => `Command:
${item.command}

Result:
${item.result}`).join('\n\n---\n\n')}

Continue the task based on these real terminal results. Give a clear conclusion and only call another tool if more evidence is necessary.`
          })
          continue
        }
        const deterministicCommands = getDeterministicFallbackCommands(`${chatEntry.prompt}\n${accumulatedContent}`)
          .filter(command => !fallbackCommandsRun.has(command))
        if (deterministicCommands.length) {
          const fallbackResults = await executeFallbackCommandList(
            deterministicCommands,
            '模型未调用工具，已按任务自动执行只读检查命令'
          )
          if (!fallbackResults) {
            return
          }
          messages.push({
            role: 'user',
            content: `The application executed deterministic read-only terminal checks because the assistant did not call tools and did not produce a command plan:

${fallbackResults.map(item => `Command:
${item.command}

Result:
${item.result}`).join('\n\n---\n\n')}

Continue the task based on these real terminal results. Give a clear conclusion and only call another tool if more evidence is necessary.`
          })
          continue
        }
        if (!accumulatedContent.trim() && noActionRepairCount < 1) {
          noActionRepairCount += 1
          updateChatEntry(chatEntry, {
            response: '代理模式没有收到可执行命令，正在要求模型改用工具调用继续处理...'
          })
          messages.push({
            role: 'user',
            content: '你刚才没有返回内容，也没有调用工具。请继续处理当前任务：如果需要终端信息，必须调用 get_terminal_status 或 send_terminal_command；如果不需要执行，请直接给出明确结论。'
          })
          continue
        }
        if (accumulatedContent.trim() && noActionRepairCount < 1) {
          noActionRepairCount += 1
          updateChatEntry(chatEntry, {
            response: `${accumulatedContent}\n\n代理模式没有收到工具调用，正在要求模型改用工具继续...`
          })
          messages.push({
            role: 'user',
            content: '你现在处于代理模式。上一条回复没有调用工具。如果任务还没有完成，请继续并调用合适工具；如果已经完成，请给出最终结论，不要只列待执行命令。'
          })
          continue
        }
        setIsStreaming(false)
        updateChatEntry(chatEntry, {
          response: accumulatedContent || '代理模式没有生成可执行步骤。请换一种说法描述任务，或切到问答模式先让 AI 分析。'
        })
        return
      }

      noActionRepairCount = 0

      for (const toolCall of assistantMessage.tool_calls) {
        if (abortRef && abortRef.current) {
          setIsStreaming(false)
          updateChatEntry(chatEntry, {
            response: accumulatedContent + '\n\n*(Agent stopped by user)*'
          })
          return
        }

        let args
        try {
          args = JSON.parse(toolCall.function.arguments)
        } catch {
          args = {}
        }
        if (toolCall.function.name === 'send_terminal_command' && args.command) {
          args = {
            ...args,
            command: normalizeAgentCommand(args.command, chatEntry.prompt)
          }
        }

        const toolEntry = {
          id: toolCall.id,
          name: toolCall.function.name,
          args,
          status: 'running',
          result: null
        }
        toolCallsLog.push(toolEntry)
        updateChatEntry(chatEntry, {
          toolCalls: [...toolCallsLog]
        })

        if (toolCall.function.name === 'send_terminal_command' && isBareDiagnosticProgramCommand(args.command)) {
          // 2026-07-24 coder(lq): Let the model rethink ambiguous bare program calls instead of replacing one product with a hard-coded probe.
          toolEntry.status = 'error'
          toolEntry.result = `未执行：命令 "${args.command}" 只是程序名，不能说明要检查什么。请根据用户问题重新生成明确、只读、可执行的检查命令。`
          updateChatEntry(chatEntry, {
            toolCalls: [...toolCallsLog]
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolEntry.result
          })
          continue
        }

        if (toolCall.function.name === 'send_terminal_command' && isDestructiveShellCommand(args.command)) {
          toolEntry.status = 'pending_confirm'
          toolEntry.result = JSON.stringify({
            command: args.command,
            blocked: true,
            message: AGENT_CONFIRM_COMMAND_MESSAGE
          })
          updateChatEntry(chatEntry, {
            toolCalls: [...toolCallsLog]
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `${AGENT_CONFIRM_COMMAND_MESSAGE}\n命令：${args.command}\n不要再次自动调用该命令。请向用户说明风险和下一步，等待用户点击播放按钮执行。`
          })
          continue
        }

        let toolResult
        try {
          toolResult = await executeToolCall(toolCall.function.name, args, context)
          toolEntry.status = 'completed'
          toolEntry.result = toolResult
        } catch (err) {
          toolEntry.status = 'error'
          toolEntry.result = err.message
        }

        updateChatEntry(chatEntry, {
          toolCalls: [...toolCallsLog]
        })

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolEntry.result
        })
      }
    }

    setIsStreaming(false)
    updateChatEntry(chatEntry, {
      response: accumulatedContent + '\n\n*(Agent reached maximum iterations)*'
    })
  } finally {
    window.store.agentRunning = false
  }
}
