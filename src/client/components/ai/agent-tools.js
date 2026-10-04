import { z } from '../../common/zod.js'
import { bookmarkSchemas } from '../../common/bookmark-schemas.js'
import { filterAiChatHistoryByTerminal } from '../../common/ai-chat-scope.js'
import { waitForAgentTask } from './agent-task-wait.js'

const TERMINAL_TAB_TOOLS = new Set([
  'send_terminal_command',
  'get_terminal_output',
  'get_terminal_status',
  'cancel_terminal_command',
  'run_background_command',
  'get_ai_chat_history'
])

const TERMINAL_EXECUTION_TOOLS = new Set([
  'send_terminal_command',
  'get_terminal_output',
  'get_terminal_status',
  'cancel_terminal_command',
  'run_background_command'
])
const TERMINAL_CAPABILITY_BLOCK_MESSAGE = '当前会话只有 SFTP 文件能力，不能执行终端命令。请切换到 SSH 终端后再试。'

const AI_HISTORY_MAX_ITEMS = 1000
const AI_HISTORY_MAX_CHARS = 120000
// 2026-09-02 coder(lq): Never silently fall back to the interactive PTY for agent work; prompt echoes and user keystrokes are not a reliable tool observation.
const ALLOW_LEGACY_PTY_AGENT_COMMANDS = false

export const TERMINAL_EXECUTION_CHANNELS = {
  isolated: 'isolated',
  current: 'current'
}

export function resolveTerminalExecutionChannel (context = {}) {
  return context.terminalExecutionChannelAI === TERMINAL_EXECUTION_CHANNELS.current
    ? TERMINAL_EXECUTION_CHANNELS.current
    : TERMINAL_EXECUTION_CHANNELS.isolated
}

function trimHistoryText (value, maxLength) {
  const text = String(value || '')
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '\n...[内容已截断]'
}

function getAiChatHistory (args = {}) {
  const store = window.store
  const terminalSessionId = args.tabId || args.terminalSessionId || store.activeTabId
  const limitValue = Number(args.limit)
  const limit = Number.isFinite(limitValue)
    ? Math.min(Math.max(Math.floor(limitValue), 1), AI_HISTORY_MAX_ITEMS)
    : 20
  const all = filterAiChatHistoryByTerminal(store.aiChatHistory || [], terminalSessionId)
    .filter(item => item.prompt || item.response)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  const selected = all.slice(-limit)
  let usedChars = 0
  const messages = selected.map(item => {
    const prompt = trimHistoryText(item.prompt, 8000)
    const response = trimHistoryText(item.response, 16000)
    const commands = (item.toolCalls || [])
      .filter(tool => tool.name === 'send_terminal_command' || tool.name === 'run_background_command')
      .map(tool => ({
        command: trimHistoryText(tool.args?.command, 2000),
        status: tool.status,
        result: trimHistoryText(tool.result, 6000)
      }))
    const message = {
      id: item.id,
      timestamp: item.timestamp,
      prompt,
      response,
      commands
    }
    usedChars += JSON.stringify(message).length
    return usedChars <= AI_HISTORY_MAX_CHARS ? message : null
  }).filter(Boolean)
  return JSON.stringify({
    terminalSessionId,
    total: all.length,
    returned: messages.length,
    hasMore: messages.length < all.length,
    messages
  })
}

const SFTP_TAB_TOOLS = new Set([
  'sftp_list',
  'sftp_stat',
  'sftp_read_file',
  'sftp_del',
  'sftp_upload',
  'sftp_download'
])

function withDefaultTabId (toolName, args = {}, context = {}) {
  if (
    args.tabId ||
    !context.defaultTabId ||
    (!TERMINAL_TAB_TOOLS.has(toolName) && !SFTP_TAB_TOOLS.has(toolName))
  ) {
    return args
  }
  return {
    ...args,
    tabId: context.defaultTabId
  }
}

function getAgentTargetTab (context = {}, args = {}) {
  const store = window.store
  const tabId = args.tabId || context.defaultTabId || context.sessionRootId || store.activeTabId
  if (!tabId || !Array.isArray(store.tabs)) {
    return null
  }
  return store.tabs.find(tab => tab.id === tabId) || null
}

function isTerminalExecutionBlocked (context = {}, args = {}) {
  if (context.terminalExecutionEnabled === false) {
    return true
  }
  const tab = getAgentTargetTab(context, args)
  return tab?.enableSsh === false
}

function buildTerminalCapabilityBlockedResult (toolName, args = {}, context = {}) {
  const tab = getAgentTargetTab(context, args)
  const tabId = tab?.id || args.tabId || context.defaultTabId || context.sessionRootId || ''
  return {
    success: false,
    ok: false,
    tool: toolName,
    command: args.command || '',
    exitCode: null,
    stdout: '',
    stderr: TERMINAL_CAPABILITY_BLOCK_MESSAGE,
    output: TERMINAL_CAPABILITY_BLOCK_MESSAGE,
    timedOut: false,
    waitingForInput: false,
    blockedByCapability: true,
    tabId
  }
}

export function getAgentTools (context = {}) {
  if (context.terminalExecutionEnabled === false) {
    return agentTools.filter(tool => !TERMINAL_EXECUTION_TOOLS.has(tool.function.name))
  }
  return agentTools
}

function makeAgentRunId () {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildMarkedCommand (command, runId) {
  const startMarker = `__ELECTERM_AGENT_START_${runId}__`
  const endMarker = `__ELECTERM_AGENT_END_${runId}__`
  return {
    startMarker,
    endMarker,
    // 2026-08-31 coder(lq): Keep the wrapper on one physical line; multiline parentheses trigger continuation prompts in interactive SSH shells and can leak wrapper text into captured output.
    command: `printf '\\n${startMarker}\\n'; ( ${command} ); __electerm_agent_exit=$?; printf '\\n${endMarker}:%s\\n' "$__electerm_agent_exit"`
  }
}

function parseMarkedOutput (output = '', startMarker, endMarker) {
  const endPattern = new RegExp(`${endMarker}:(\\d+)`)
  const endMatch = output.match(endPattern)
  if (!endMatch) {
    return null
  }
  const endIndex = output.indexOf(endMatch[0])
  const beforeEnd = output.slice(0, endIndex)
  const startIndex = beforeEnd.lastIndexOf(startMarker)
  const body = startIndex >= 0
    ? beforeEnd.slice(startIndex + startMarker.length)
    : beforeEnd
  return {
    exitCode: Number(endMatch[1]),
    output: body.replace(/^\s*\n?/, '').replace(/\n?\s*$/, '')
  }
}

function stripAgentCommandMarkers (output = '') {
  return String(output || '')
    .replace(/\n?__ELECTERM_AGENT_START_[A-Za-z0-9_]+__[\s\S]*?__ELECTERM_AGENT_END_[A-Za-z0-9_]+__:\d+\n?/g, '\n')
    .replace(/\n?__ELECTERM_AGENT_START_[A-Za-z0-9_]+__[\s\S]*$/g, '')
    .split('\n')
    .filter(line => (
      !/__ELECTERM_AGENT_(START|END)_[A-Za-z0-9_]+__/.test(line) &&
      !/__electerm_agent_exit/.test(line)
    ))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sanitizeTerminalReadResult (result) {
  if (!result || typeof result !== 'object' || typeof result.output !== 'string') {
    return result
  }
  return {
    ...result,
    // 2026-07-24 coder(lq): Internal agent command markers are implementation details; keep AI context and tool cards focused on user-visible terminal output.
    output: stripAgentCommandMarkers(result.output)
  }
}

function stripTerminalEcho (output = '', command = '') {
  const commandText = String(command || '').trim().replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')
  const ansiPattern = new RegExp(String.fromCharCode(27) + '\\[[0-?]*[ -/]*[@-~]', 'g')
  return String(output || '')
    .replace(ansiPattern, '')
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed === '(' || trimmed === ')') return false
      // 2026-08-30 coder(lq): Interactive shells echo the wrapper with both the primary prompt and the continuation prompt; neither belongs in tool output.
      if (/__ELECTERM_AGENT_|__electerm_agent_exit=/.test(trimmed)) return false
      if (trimmed.startsWith('>')) {
        const continuation = trimmed.replace(/^>\s*/, '')
        if (continuation === '(' || continuation === ')' || continuation === commandText || /__ELECTERM_AGENT_|__electerm_agent_exit=/.test(continuation)) return false
      }
      const promptMatch = trimmed.match(/^(?:\[[^]\n]+\]|[^\s[\]#%$>]+(?:@[^\s[\]#%$>]+)?)[#$%>]\s*(.*)$/)
      // Keep plain output intact; only prompt-prefixed lines above are shell echoes.
      if (!promptMatch) return true
      const echoed = promptMatch[1].trim()
      return echoed !== '(' && echoed !== ')' && echoed !== commandText && !/^__electerm_agent_exit=/.test(echoed)
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function runTerminalCommandAndCapture (args, context = {}) {
  const store = window.store
  const executionChannel = resolveTerminalExecutionChannel(context)
  // 2026-09-11 coder(lq): Use the visible PTY only after an explicit user choice; isolated execution remains the safe default and never falls back silently.
  if (
    executionChannel === TERMINAL_EXECUTION_CHANNELS.isolated &&
    typeof store.mcpRunTerminalCommandStructured === 'function'
  ) {
    const executionArgs = { ...args, executionId: context.executionId || crypto.randomUUID() }
    const cancel = () => { store.mcpCancelStructuredCommand?.(executionArgs)?.catch(() => {}) }
    if (context.signal?.aborted) throw new Error('任务已停止')
    context.signal?.addEventListener('abort', cancel, { once: true })
    try {
      const timeout = Math.min(args.timeout || 45000, 120000)
      // 2026-09-01 coder(lq): Clear the client-side guard as soon as the session responds; otherwise every completed command leaves a live timer behind.
      let timeoutId
      const timeoutResult = new Promise(resolve => {
        timeoutId = setTimeout(() => {
          cancel(); resolve({
            ok: false,
            success: false,
            command: args.command,
            exitCode: null,
            stdout: '',
            stderr: `命令在 ${timeout}ms 内未完成`,
            output: `命令在 ${timeout}ms 内未完成`,
            timedOut: true,
            waitingForInput: false,
            durationMs: timeout,
            tabId: args.tabId
          })
        }, timeout + 1000)
      })
      try {
        const result = await Promise.race([
          store.mcpRunTerminalCommandStructured(executionArgs),
          timeoutResult
        ])
        return {
          ...result,
          executionChannel
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      if (!/unavailable|not found|No active terminal/i.test(String(error?.message || error))) throw error
      if (!ALLOW_LEGACY_PTY_AGENT_COMMANDS) {
        return {
          success: false,
          ok: false,
          command: args.command,
          exitCode: null,
          stdout: '',
          stderr: '结构化终端执行通道不可用，已阻止回退到交互终端。请重新连接终端后重试。',
          output: '',
          structuredUnavailable: true,
          executionChannel,
          timedOut: false,
          waitingForInput: false,
          tabId: args.tabId
        }
      }
    } finally {
      context.signal?.removeEventListener('abort', cancel)
    }
  } else if (
    executionChannel === TERMINAL_EXECUTION_CHANNELS.isolated &&
    !ALLOW_LEGACY_PTY_AGENT_COMMANDS
  ) {
    return {
      success: false,
      ok: false,
      command: args.command,
      exitCode: null,
      stdout: '',
      stderr: '结构化终端执行通道不可用，已阻止回退到交互终端。请重新连接终端后重试。',
      output: '',
      structuredUnavailable: true,
      executionChannel,
      timedOut: false,
      waitingForInput: false,
      tabId: args.tabId
    }
  }
  const runId = makeAgentRunId()
  const marked = buildMarkedCommand(args.command, runId)
  const start = Date.now()
  const timeout = Math.min(args.timeout || 45000, 120000)
  const pollInterval = 500
  const tabId = args.tabId || store.activeTabId

  const cancel = () => {
    const result = store.mcpCancelTerminalCommand?.({ tabId })
    result?.catch?.(() => {})
  }
  if (context.signal?.aborted) throw new Error('任务已停止')
  context.signal?.addEventListener('abort', cancel, { once: true })

  try {
    store.mcpSendTerminalCommand({
      ...args,
      tabId,
      command: marked.command,
      inputOnly: false
    })

    while (Date.now() - start < timeout) {
      if (context.signal?.aborted) throw new Error('任务已停止')
      const status = store.mcpGetTerminalStatus({ tabId })
      const recent = store.mcpGetTerminalOutput({ tabId, lines: args.lines || 220 })
      const parsed = parseMarkedOutput(recent.output, marked.startMarker, marked.endMarker)
      if (parsed) {
        return {
          success: parsed.exitCode === 0,
          command: args.command,
          exitCode: parsed.exitCode,
          output: stripTerminalEcho(parsed.output, args.command),
          executionChannel,
          timedOut: false,
          elapsed: Date.now() - start,
          tabId: recent.tabId || status.tabId
        }
      }
      if (status.hasPasswordPrompt) {
        return {
          success: false,
          command: args.command,
          exitCode: null,
          output: status.output,
          executionChannel,
          timedOut: false,
          waitingForInput: true,
          message: 'Terminal is waiting for password or interactive input.',
          elapsed: Date.now() - start,
          tabId: status.tabId
        }
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    const recent = store.mcpGetTerminalOutput({ tabId, lines: args.lines || 220 })
    return {
      success: false,
      command: args.command,
      exitCode: null,
      output: stripTerminalEcho(recent.output, args.command),
      executionChannel,
      timedOut: true,
      message: `Command did not finish within ${timeout}ms.`,
      elapsed: Date.now() - start,
      tabId: recent.tabId
    }
  } finally {
    context.signal?.removeEventListener('abort', cancel)
  }
}

function buildAddBookmarkParameters () {
  const typeProperties = {}
  for (const [type, schema] of Object.entries(bookmarkSchemas)) {
    typeProperties[type] = z.toJSONSchema(z.object(schema))
  }

  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: Object.keys(bookmarkSchemas),
        description: 'Bookmark type'
      },
      ...Object.fromEntries(
        Object.entries(typeProperties).map(([type, schema]) => [
          type,
          { type: 'object', description: `Fields for ${type} bookmark`, ...schema }
        ])
      )
    },
    required: ['type']
  }
}

export const agentTools = [
  {
    type: 'function',
    function: {
      name: 'send_terminal_command',
      description: 'Send one explicit shell command to a terminal tab and wait for it to finish. Returns a separate command, exitCode, and output. Never pass terminal output, version strings, process names, or error text as the command. For long-running commands (builds, deployments, installations), use run_background_command instead to avoid timeouts.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute'
          },
          tabId: {
            type: 'string',
            description: 'Terminal tab ID. Omit to use the active terminal.'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_terminal_output',
      description: 'Read the current visible output from a terminal.',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'Terminal tab ID. Omit for active terminal.'
          },
          lines: {
            type: 'number',
            description: 'Number of recent lines to read (default 50).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_local_terminal',
      description: 'Open a new local terminal tab. Returns the new tab ID.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tabs',
      description: 'List all open terminal tabs with their IDs, titles, hosts, and types.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_active_tab',
      description: 'Get the currently active terminal tab.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'switch_tab',
      description: 'Switch to a different terminal tab.',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'The tab ID to switch to.'
          }
        },
        required: ['tabId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'close_tab',
      description: 'Close a terminal tab by its ID. Use this to clean up tabs after a task is finished.',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'The tab ID to close.'
          }
        },
        required: ['tabId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_bookmarks',
      description: 'List all saved bookmarks (SSH, Telnet, VNC, etc.).',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_bookmark',
      description: 'Open a saved bookmark as a new terminal tab.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The bookmark ID to open.'
          }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_bookmark',
      description: 'Create a new bookmark. Specify the type and provide type-specific fields. Supported types: ' + Object.keys(bookmarkSchemas).join(', ') + '.',
      parameters: buildAddBookmarkParameters()
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_tab',
      description: 'Open a terminal tab directly with connection parameters without creating a bookmark. Supported types: ' + Object.keys(bookmarkSchemas).join(', ') + '.',
      parameters: buildAddBookmarkParameters()
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_list',
      description: 'List files and directories at a remote path via SFTP. Requires an SSH/FTP tab.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote directory path to list.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_stat',
      description: 'Get file/directory stats (size, permissions, etc.) at a remote path via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote path to stat.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_read_file',
      description: 'Read the contents of a remote file via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote file path to read.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_del',
      description: 'Delete a remote file or directory via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote file or directory path to delete.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_upload',
      description: 'Upload a local file to a remote server via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          localPath: {
            type: 'string',
            description: 'Local file path to upload.'
          },
          remotePath: {
            type: 'string',
            description: 'Remote destination path.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['localPath', 'remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_download',
      description: 'Download a remote file to a local path via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote file path to download.'
          },
          localPath: {
            type: 'string',
            description: 'Local destination path.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath', 'localPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_transfer_list',
      description: 'List current active SFTP file transfers.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_transfer_history',
      description: 'List past SFTP file transfer history.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_terminal_status',
      description: 'Check terminal status: running (actively receiving data), idle, or password prompt. Returns last 20 lines of output. Lightweight, non-blocking.',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'Tab ID. Omit for active terminal.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_ai_chat_history',
      description: 'Read previous AI conversations for the current terminal. Use this only when older context is relevant, and choose the limit yourself instead of reading everything by default. Results are oldest-first within the selected range.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'How many recent conversations to read. Choose based on the task; default 20, maximum 1000.'
          },
          tabId: {
            type: 'string',
            description: 'Terminal session ID. Omit to use the active terminal.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_terminal_command',
      description: 'Cancel the running command in a terminal by sending Ctrl+C.',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'Tab ID. Omit for active terminal.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_background_command',
      description: 'Run a long command on an isolated managed channel. Returns a taskId immediately. Monitor status and logs until completed; started/running is not completion. Run stop or exhausted execution budget cancels owned commands, not the visible terminal; the channel also has a 12-hour safety timeout.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to run in the background.'
          },
          tabId: {
            type: 'string',
            description: 'Tab ID. Omit for active terminal.'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_background_task_status',
      description: 'Wait briefly for a background task, then return running, completed (with exit code), or unknown. Prefer this over repeatedly reading logs while waiting.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task ID from run_background_command.'
          },
          waitSeconds: {
            type: 'number',
            description: 'Wait up to 0–30 seconds (default 10); returns early on completion. Use 30 for slow work.'
          }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_background_task_log',
      description: 'Read the output log of a background task. Returns the last N lines.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task ID from run_background_command.'
          },
          lines: {
            type: 'number',
            description: 'Number of recent lines to read (default 100).'
          }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_background_task',
      description: 'Cancel a running background task by killing its process.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task ID from run_background_command.'
          }
        },
        required: ['taskId']
      }
    }
  }
]

export async function executeToolCall (toolName, args, context = {}) {
  const store = window.store
  const finalArgs = withDefaultTabId(toolName, args, context)
  if (TERMINAL_EXECUTION_TOOLS.has(toolName) && isTerminalExecutionBlocked(context, finalArgs)) {
    return JSON.stringify(buildTerminalCapabilityBlockedResult(toolName, finalArgs, context))
  }
  switch (toolName) {
    case 'send_terminal_command': {
      return JSON.stringify(await runTerminalCommandAndCapture(finalArgs, context))
    }
    case 'get_terminal_output':
      return JSON.stringify(sanitizeTerminalReadResult(store.mcpGetTerminalOutput(finalArgs)))
    case 'open_local_terminal':
      return JSON.stringify(store.mcpOpenLocalTerminal())
    case 'list_tabs':
      return JSON.stringify(store.mcpListTabs())
    case 'get_active_tab':
      return JSON.stringify(store.mcpGetActiveTab())
    case 'switch_tab':
      return JSON.stringify(store.mcpSwitchTab(finalArgs))
    case 'close_tab':
      return JSON.stringify(store.mcpCloseTab(finalArgs))
    case 'list_bookmarks':
      return JSON.stringify(store.mcpListBookmarks())
    case 'open_bookmark':
      return JSON.stringify(store.mcpOpenBookmark(finalArgs))
    case 'add_bookmark': {
      const { type } = finalArgs
      const typeFields = finalArgs[type] || {}
      return JSON.stringify(await store.mcpAddBookmark({ type, ...typeFields }))
    }
    case 'open_tab': {
      const { type } = finalArgs
      const typeFields = finalArgs[type] || {}
      return JSON.stringify(store.mcpOpenTab({ type, ...typeFields }))
    }
    case 'sftp_list':
      return JSON.stringify(await store.mcpSftpList(finalArgs))
    case 'sftp_stat':
      return JSON.stringify(await store.mcpSftpStat(finalArgs))
    case 'sftp_read_file':
      return JSON.stringify(await store.mcpSftpReadFile(finalArgs))
    case 'sftp_del':
      return JSON.stringify(await store.mcpSftpDel(finalArgs))
    case 'sftp_upload':
      return JSON.stringify(await store.mcpSftpUpload(finalArgs))
    case 'sftp_download':
      return JSON.stringify(await store.mcpSftpDownload(finalArgs))
    case 'sftp_transfer_list':
      return JSON.stringify(store.mcpSftpTransferList())
    case 'sftp_transfer_history':
      return JSON.stringify(store.mcpSftpTransferHistory())
    case 'get_terminal_status':
      return JSON.stringify(sanitizeTerminalReadResult(store.mcpGetTerminalStatus(finalArgs)))
    case 'get_ai_chat_history':
      return getAiChatHistory(finalArgs)
    case 'cancel_terminal_command':
      return JSON.stringify(store.mcpCancelTerminalCommand(finalArgs))
    case 'run_background_command': {
      const executionId = context.executionId || crypto.randomUUID()
      const executionArgs = { ...finalArgs, executionId }
      const cancel = () => { store.mcpCancelBackgroundTask({ taskId: executionId }).catch(() => {}) }
      if (context.signal?.aborted) throw new Error('任务已停止')
      context.signal?.addEventListener('abort', cancel, { once: true })
      context.onCleanup?.(() => context.signal?.removeEventListener('abort', cancel))
      const result = await store.mcpRunBackgroundCommand(executionArgs)
      if (context.signal?.aborted) cancel()
      return JSON.stringify(result)
    }
    case 'get_background_task_status':
      return JSON.stringify(await waitForAgentTask(() => store.mcpGetBackgroundTaskStatus(finalArgs), { signal: context.signal, waitSeconds: finalArgs.waitSeconds }))
    case 'get_background_task_log':
      return JSON.stringify(await store.mcpGetBackgroundTaskLog(finalArgs))
    case 'cancel_background_task':
      return JSON.stringify(await store.mcpCancelBackgroundTask(finalArgs))
    default:
      throw new Error(`Unknown agent tool: ${toolName}`)
  }
}
