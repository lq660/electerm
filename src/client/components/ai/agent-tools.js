import { z } from '../../common/zod'
import { bookmarkSchemas } from '../../common/bookmark-schemas'

const TERMINAL_TAB_TOOLS = new Set([
  'send_terminal_command',
  'get_terminal_output',
  'get_terminal_status',
  'cancel_terminal_command',
  'run_background_command'
])

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

function makeAgentRunId () {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildMarkedCommand (command, runId) {
  const startMarker = `__ELECTERM_AGENT_START_${runId}__`
  const endMarker = `__ELECTERM_AGENT_END_${runId}__`
  return {
    startMarker,
    endMarker,
    // 2026-07-24 coder(lq): Mark command boundaries so agent mode can reliably return the real command output and exit code.
    command: [
      `printf '\\n${startMarker}\\n'`,
      '{',
      command,
      '}',
      '__electerm_agent_exit=$?',
      `printf '\\n${endMarker}:%s\\n' "$__electerm_agent_exit"`
    ].join('\n')
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

async function runTerminalCommandAndCapture (args) {
  const store = window.store
  const runId = makeAgentRunId()
  const marked = buildMarkedCommand(args.command, runId)
  const start = Date.now()
  const timeout = Math.min(args.timeout || 45000, 120000)
  const pollInterval = 500
  const tabId = args.tabId || store.activeTabId

  store.mcpSendTerminalCommand({
    ...args,
    tabId,
    command: marked.command,
    inputOnly: false
  })

  while (Date.now() - start < timeout) {
    const status = store.mcpGetTerminalStatus({ tabId })
    const recent = store.mcpGetTerminalOutput({ tabId, lines: args.lines || 220 })
    const parsed = parseMarkedOutput(recent.output, marked.startMarker, marked.endMarker)
    if (parsed) {
      return {
        success: parsed.exitCode === 0,
        command: args.command,
        exitCode: parsed.exitCode,
        output: parsed.output,
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
    output: recent.output,
    timedOut: true,
    message: `Command did not finish within ${timeout}ms.`,
    elapsed: Date.now() - start,
    tabId: recent.tabId
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
      description: 'Send a command to a terminal tab and wait for it to finish. Returns the command output. For long-running commands (builds, deployments, installations), use run_background_command instead to avoid timeouts.',
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
      description: 'Run a command in the background using nohup. The terminal is freed immediately. Returns a taskId for monitoring. Use get_background_task_status and get_background_task_log to check progress.',
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
      description: 'Check if a background task is running, completed (with exit code), or unknown.',
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
  switch (toolName) {
    case 'send_terminal_command': {
      return JSON.stringify(await runTerminalCommandAndCapture(finalArgs))
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
    case 'cancel_terminal_command':
      return JSON.stringify(store.mcpCancelTerminalCommand(finalArgs))
    case 'run_background_command':
      return JSON.stringify(store.mcpRunBackgroundCommand(finalArgs))
    case 'get_background_task_status':
      return JSON.stringify(await store.mcpGetBackgroundTaskStatus(finalArgs))
    case 'get_background_task_log':
      return JSON.stringify(await store.mcpGetBackgroundTaskLog(finalArgs))
    case 'cancel_background_task':
      return JSON.stringify(await store.mcpCancelBackgroundTask(finalArgs))
    default:
      throw new Error(`Unknown agent tool: ${toolName}`)
  }
}
