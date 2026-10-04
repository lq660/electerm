const { test } = require('node:test')
const assert = require('node:assert/strict')

test('normalizes structured command output including stderr', async () => {
  const { normalizeToolResult } = await import('../../src/client/components/ai/agent-result-utils.js')

  const result = normalizeToolResult(JSON.stringify({
    command: 'nginx -v 2>&1',
    stdout: '',
    stderr: 'nginx version: nginx/1.27.5',
    exitCode: 0
  }))

  assert.equal(result.success, true)
  assert.equal(result.output, 'nginx version: nginx/1.27.5')
  assert.equal(result.exitCode, 0)
})

test('does not treat executable discovery as a version answer', async () => {
  const { hasAnswerEvidence } = await import('../../src/client/components/ai/agent-result-utils.js')
  const result = { success: true, exitCode: 0, output: '/usr/sbin/nginx' }

  assert.equal(hasAnswerEvidence('查一下 nginx 的版本', 'command -v nginx', result), false)
  assert.equal(hasAnswerEvidence('查一下 nginx 的路径', 'command -v nginx', result), true)
})

test('finishes a version query from one relevant read-only command', async () => {
  const { hasAnswerEvidence } = await import('../../src/client/components/ai/agent-result-utils.js')
  const result = { success: true, exitCode: 0, stderr: 'nginx version: nginx/1.27.5' }

  assert.equal(hasAnswerEvidence('查一下 nginx 的版本', 'nginx -v 2>&1', result), true)
})

test('requires an actual log-reading command for log requests', async () => {
  const { hasAnswerEvidence } = await import('../../src/client/components/ai/agent-result-utils.js')
  const result = { success: true, exitCode: 0, output: 'Active: active (running)' }

  assert.equal(hasAnswerEvidence('查一下 codexapi 的日志', 'systemctl status codexapi --no-pager', result), false)
  assert.equal(hasAnswerEvidence('查一下 codexapi 的日志', 'journalctl -u codexapi -n 50 --no-pager', result), true)
  assert.equal(hasAnswerEvidence('看一下今天 lechun-cms 系统有没有报错日志', "date '+%F %T'", { success: true, exitCode: 0, output: '2026-09-01 21:38:53' }), false)
})

test('does not finish a terminal task from an unrelated successful probe', async () => {
  const { hasRelevantAnswerEvidence } = await import('../../src/client/components/ai/agent-result-utils.js')
  const toolCalls = [{
    status: 'completed',
    args: { command: "date '+%F %T'" },
    result: { success: true, exitCode: 0, output: '2026-09-01 21:38:53' }
  }]

  assert.equal(hasRelevantAnswerEvidence('看一下今天 lechun-cms 系统有没有报错日志', toolCalls), false)
})

test('never treats a non-zero exit code as a successful command', async () => {
  const { normalizeToolResult } = await import('../../src/client/components/ai/agent-result-utils.js')
  const result = normalizeToolResult({
    command: 'nginx --version',
    stdout: 'nginx version: nginx/1.27.5',
    exitCode: 1,
    success: true
  })

  assert.equal(result.success, false)
})

test('never treats timeout or interactive input as completion', async () => {
  const { normalizeToolResult, hasAnswerEvidence } = await import('../../src/client/components/ai/agent-result-utils.js')
  const timeout = normalizeToolResult({ command: 'long-task', output: 'partial', exitCode: 0, timedOut: true })
  const waiting = normalizeToolResult({ command: 'sudo -k true', output: 'password:', exitCode: 0, waitingForInput: true })

  assert.equal(timeout.success, false)
  assert.equal(waiting.success, false)
  assert.equal(hasAnswerEvidence('查一下版本', 'long-task', timeout), false)
  assert.equal(hasAnswerEvidence('查一下版本', 'sudo -k true', waiting), false)
})

test('does not treat terminal status text as an executable command', async () => {
  const {
    isLikelyShellCommand,
    extractFallbackCommands
  } = await import('../../src/client/components/ai/agent.js')

  assert.equal(isLikelyShellCommand('Up 33 minutes'), false)
  assert.equal(isLikelyShellCommand('Up 5 days (healthy)'), false)
  assert.equal(isLikelyShellCommand('active (running)'), false)
  assert.deepEqual(extractFallbackCommands('容器状态：\nUp 33 minutes\nUp 5 days (healthy)'), [])
})

test('accepts localized and realistically sized diagnostic commands', async () => {
  const {
    isLikelyShellCommand,
    getInvalidAgentCommandReason,
    MAX_AGENT_COMMAND_LENGTH
  } = await import('../../src/client/components/ai/agent.js')
  const localizedLogQuery = "journalctl -u codex2api.service --since '2026-09-11 00:00:00' --no-pager | grep -E 'ERROR|失败|超时' | tail -80"
  const unicodePathQuery = "find '/deploy/中文日志' -type f -maxdepth 2"
  const compoundLogQuery = "echo '=== server_error.log ==='; cat /deploy/codex2api/shared/logs/server_error.log; echo; echo '=== journal 5xx/error last 50 ==='; journalctl -u codex2api.service --since '2026-09-11 11:40:00' --no-pager | grep -E ' 5[0-9][0-9] |ERROR|error|unavailable|失败' | tail -50"
  const longDiagnostic = `printf '%s\\n' ${Array.from({ length: 80 }, (_, index) => `'diagnostic-field-${index}'`).join(' ')} | tail -20`

  assert.equal(isLikelyShellCommand(localizedLogQuery), true)
  assert.equal(isLikelyShellCommand(unicodePathQuery), true)
  assert.equal(getInvalidAgentCommandReason(compoundLogQuery), '')
  assert.ok(longDiagnostic.length > 500)
  assert.equal(isLikelyShellCommand(longDiagnostic), true)
  assert.equal(isLikelyShellCommand('这是终端输出，不是命令'), false)
  assert.equal(isLikelyShellCommand(`printf '%s' '${'x'.repeat(MAX_AGENT_COMMAND_LENGTH)}'`), false)
  assert.equal(isLikelyShellCommand('printf ok\0rm -rf /tmp/example'), false)
})

test('classifies remote-to-local copy requests as transfer tasks', async () => {
  const { classifyAgentTask } = await import('../../src/client/components/ai/agent.js')

  const task = classifyAgentTask('把远程文件拷贝到本地')

  assert.equal(task.kind, 'transfer')
  assert.equal(task.requiresTerminal, false)
  assert.equal(task.phase, 'inspect')
})

test('blocks terminal execution tools when the current tab only has SFTP capability', async () => {
  const originalWindow = global.window
  global.window = {
    store: {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          enableSsh: false
        }
      ]
    }
  }

  try {
    const {
      executeToolCall,
      getAgentTools
    } = await import('../../src/client/components/ai/agent-tools.js')

    assert.equal(
      getAgentTools({ terminalExecutionEnabled: false }).some(tool => tool.function.name === 'send_terminal_command'),
      false
    )

    const result = JSON.parse(await executeToolCall(
      'send_terminal_command',
      { command: 'uname -a' },
      {
        defaultTabId: 'tab-1',
        sessionRootId: 'tab-1',
        terminalExecutionEnabled: false
      }
    ))

    assert.equal(result.blockedByCapability, true)
    assert.match(result.output, /SFTP 文件能力/)
  } finally {
    global.window = originalWindow
  }
})

test('keeps sftp download available in SFTP-only sessions', async () => {
  const originalWindow = global.window
  const downloadCalls = []
  global.window = {
    store: {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          enableSsh: false
        }
      ],
      mcpSftpDownload: async args => {
        downloadCalls.push(args)
        return {
          success: true,
          remotePath: args.remotePath,
          localPath: args.localPath
        }
      }
    }
  }

  try {
    const {
      executeToolCall,
      getAgentTools
    } = await import('../../src/client/components/ai/agent-tools.js')

    assert.equal(
      getAgentTools({ terminalExecutionEnabled: false }).some(tool => tool.function.name === 'sftp_download'),
      true
    )

    const result = JSON.parse(await executeToolCall(
      'sftp_download',
      { remotePath: '/remote/file.txt', localPath: '/tmp/file.txt' },
      {
        defaultTabId: 'tab-1',
        sessionRootId: 'tab-1',
        terminalExecutionEnabled: false
      }
    ))

    assert.equal(result.success, true)
    assert.equal(result.remotePath, '/remote/file.txt')
    assert.equal(result.localPath, '/tmp/file.txt')
    assert.equal(result.blockedByCapability, undefined)
    assert.equal(downloadCalls.length, 1)
  } finally {
    global.window = originalWindow
  }
})

test('uses isolated SSH as the safe default execution channel', async () => {
  const originalWindow = global.window
  let structuredCalls = 0
  let visibleCalls = 0
  global.window = {
    store: {
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', enableSsh: true }],
      mcpRunTerminalCommandStructured: async args => {
        structuredCalls += 1
        return {
          success: true,
          exitCode: 0,
          stdout: 'isolated output',
          stderr: '',
          output: 'isolated output',
          tabId: args.tabId
        }
      },
      mcpCancelStructuredCommand: async () => ({ success: true }),
      mcpSendTerminalCommand: () => {
        visibleCalls += 1
      }
    }
  }

  try {
    const {
      executeToolCall,
      resolveTerminalExecutionChannel
    } = await import('../../src/client/components/ai/agent-tools.js')

    assert.equal(resolveTerminalExecutionChannel({}), 'isolated')
    assert.equal(resolveTerminalExecutionChannel({ terminalExecutionChannelAI: 'invalid' }), 'isolated')
    assert.equal(resolveTerminalExecutionChannel({ terminalExecutionChannelAI: 'current' }), 'current')

    const result = JSON.parse(await executeToolCall(
      'send_terminal_command',
      { command: 'pwd', tabId: 'tab-1' },
      { defaultTabId: 'tab-1', executionId: 'isolated-test' }
    ))

    assert.equal(result.success, true)
    assert.equal(result.output, 'isolated output')
    assert.equal(result.executionChannel, 'isolated')
    assert.equal(structuredCalls, 1)
    assert.equal(visibleCalls, 0)
  } finally {
    global.window = originalWindow
  }
})

test('uses and captures the visible terminal when current terminal is selected', async () => {
  const originalWindow = global.window
  let structuredCalls = 0
  let visibleCalls = 0
  let terminalOutput = ''
  global.window = {
    store: {
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', enableSsh: true }],
      mcpRunTerminalCommandStructured: async () => {
        structuredCalls += 1
        throw new Error('structured execution should not be used')
      },
      mcpSendTerminalCommand: args => {
        visibleCalls += 1
        const startMarker = args.command.match(/__ELECTERM_AGENT_START_[A-Za-z0-9_]+__/)[0]
        const endMarker = args.command.match(/__ELECTERM_AGENT_END_[A-Za-z0-9_]+__/)[0]
        terminalOutput = `${startMarker}\ncurrent output\n${endMarker}:0`
      },
      mcpGetTerminalStatus: () => ({ tabId: 'tab-1', hasPasswordPrompt: false, output: terminalOutput }),
      mcpGetTerminalOutput: () => ({ tabId: 'tab-1', output: terminalOutput }),
      mcpCancelTerminalCommand: async () => ({ success: true })
    }
  }

  try {
    const { executeToolCall } = await import('../../src/client/components/ai/agent-tools.js')
    const result = JSON.parse(await executeToolCall(
      'send_terminal_command',
      { command: 'pwd', tabId: 'tab-1' },
      {
        defaultTabId: 'tab-1',
        terminalExecutionChannelAI: 'current'
      }
    ))

    assert.equal(result.success, true)
    assert.equal(result.output, 'current output')
    assert.equal(result.executionChannel, 'current')
    assert.equal(visibleCalls, 1)
    assert.equal(structuredCalls, 0)
  } finally {
    global.window = originalWindow
  }
})

test('extracts only explicitly marked commands from ordinary assistant text', async () => {
  const { extractFallbackCommands } = await import('../../src/client/components/ai/agent.js')

  assert.deepEqual(
    extractFallbackCommands('我发现服务正在运行。\n命令：docker ps -a\nUp 33 minutes'),
    ['docker ps -a']
  )
  assert.deepEqual(
    extractFallbackCommands('```sh\nnginx -v 2>&1\n```'),
    ['nginx -v 2>&1']
  )
})

test('accepts structured tool JSON returned in assistant content', async () => {
  const { normalizeAssistantMessage } = await import('../../src/client/components/ai/agent.js')
  const normalized = normalizeAssistantMessage({
    content: '{"name":"send_terminal_command","arguments":{"command":"nginx -v 2>&1"}}'
  })

  assert.equal(normalized.content, '')
  assert.equal(normalized.tool_calls.length, 1)
  assert.equal(normalized.tool_calls[0].function.name, 'send_terminal_command')
  assert.equal(normalized.tool_calls[0].function.arguments, '{"command":"nginx -v 2>&1"}')
})

test('keeps ordinary JSON answers as assistant text', async () => {
  const { normalizeAssistantMessage } = await import('../../src/client/components/ai/agent.js')
  const normalized = normalizeAssistantMessage({ content: '{"version":"1.27.5"}' })

  assert.equal(normalized.tool_calls.length, 0)
  assert.equal(normalized.content, '{"version":"1.27.5"}')
})

test('accepts only strict JSON command plans in the generic compatibility path', async () => {
  const { parseCommandPlan } = await import('../../src/client/components/ai/agent.js')

  assert.deepEqual(
    parseCommandPlan('{"commands":["nginx -v 2>&1"]}', { strict: true }),
    ['nginx -v 2>&1']
  )
  assert.deepEqual(
    parseCommandPlan('我先执行 `nginx -v 2>&1` 看看。', { strict: true }),
    []
  )
  assert.deepEqual(
    parseCommandPlan('```sh\nnginx -v 2>&1\n```', { strict: true }),
    []
  )
})

test('deduplicates repeated planning paragraphs while preserving the latest conclusion', async () => {
  const { appendUniqueAssistantContent } = await import('../../src/client/components/ai/agent.js')

  const merged = appendUniqueAssistantContent(
    '我先检查服务状态。\n\n结论：服务已启动。',
    '我先检查服务状态。\n\n结论：服务已启动并正常运行。'
  )

  assert.equal(merged, '我先检查服务状态。\n\n结论：服务已启动并正常运行。')
})

test('summarizes command output with real line breaks', async () => {
  const { summarizeAgentOutput } = await import('../../src/client/components/ai/agent.js')

  assert.equal(summarizeAgentOutput('line one\nline two', 0), 'line one\nline two')
})

test('extracts a concise conclusion from repeated agent narration', async () => {
  const { extractConciseAgentAnswer } = await import('../../src/client/components/ai/agent.js')
  const answer = extractConciseAgentAnswer(`我先查一下 nginx 的配置文件路径。

我再做一次最终验证，确认结果。

结论：Nginx 主配置文件是：
/etc/nginx/nginx.conf

如果你要我继续，我可以查看完整配置。

执行结果

命令：nginx -V`)

  assert.equal(answer, '结论：Nginx 主配置文件是：\n/etc/nginx/nginx.conf')
})
