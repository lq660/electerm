import { agentTools, executeToolCall } from './agent-tools'

const MAX_ITERATIONS = 150
const FALLBACK_COMMAND_PREFIX = /^(sudo\s+)?(apt|apt-get|yum|dnf|brew|systemctl|service|docker|docker-compose|kubectl|helm|du|df|ls|pwd|cat|tail|head|grep|find|ps|top|free|netstat|ss|lsof|nginx|npm|pnpm|yarn|node|python|python3|pip|git|tar|zip|unzip|curl|wget|chmod|chown|mkdir|rm|cp|mv|sed|awk)\b/

function buildAgentSystemPrompt (config) {
  const lang = config.languageAI || window.store.getLangName()
  const baseRole = config.roleAI || 'You are a helpful assistant.'
  return `${baseRole}

You are operating inside electerm, a terminal/SSH client. You have access to tools that let you:
- Run commands in terminal tabs and read their output
- Open new terminal tabs (local or SSH)
- Manage bookmarks (create, list, open connections)
- Switch between tabs
- Transfer files via SFTP (upload, download, list, read, delete remote files)

When the user asks you to perform terminal operations, use the available tools.
Always explain what you are doing before executing commands.
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

function extractFallbackCommand (content = '') {
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
  return candidates
    .map(stripPromptPrefix)
    .filter(isLikelyShellCommand)[0] || ''
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

export async function runAgentLoop (chatEntry, config, abortRef, setIsStreaming) {
  window.store.agentRunning = true
  try {
    const messages = [
      { role: 'system', content: buildAgentSystemPrompt(config) },
      { role: 'user', content: chatEntry.requestPrompt || chatEntry.prompt }
    ]
    const toolCallsLog = []
    const fallbackCommandsRun = new Set()
    let accumulatedContent = ''

    setIsStreaming(true)
    updateChatEntry(chatEntry, {
      toolCalls: [],
      response: ''
    })

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
        const fallbackCommand = extractFallbackCommand(assistantMessage.content || '')
        if (fallbackCommand && !fallbackCommandsRun.has(fallbackCommand)) {
          fallbackCommandsRun.add(fallbackCommand)
          const toolEntry = {
            id: `fallback-${Date.now()}`,
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
            // 2026-07-20 coder(lq): Some compatible models describe commands instead of returning tool_calls; execute clear shell commands so agent mode matches user expectations.
            response: `${accumulatedContent}\n\n模型未返回工具调用，已按回复中的命令执行：\`${fallbackCommand}\``
          })
          try {
            const toolResult = await executeToolCall('send_terminal_command', {
              command: fallbackCommand
            })
            toolEntry.status = 'completed'
            toolEntry.result = toolResult
            updateChatEntry(chatEntry, {
              toolCalls: [...toolCallsLog]
            })
            messages.push({
              role: 'user',
              content: `The application executed this fallback terminal command because the previous assistant message did not return tool_calls:

${fallbackCommand}

Terminal result:
${toolResult}

Continue the task based on this terminal result.`
            })
            continue
          } catch (err) {
            toolEntry.status = 'error'
            toolEntry.result = err.message
            setIsStreaming(false)
            updateChatEntry(chatEntry, {
              toolCalls: [...toolCallsLog],
              response: `${accumulatedContent}\n\n执行命令失败：${err.message}`
            })
            return
          }
        }
        setIsStreaming(false)
        updateChatEntry(chatEntry, {
          response: accumulatedContent
        })
        return
      }

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

        let toolResult
        try {
          toolResult = await executeToolCall(toolCall.function.name, args)
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
