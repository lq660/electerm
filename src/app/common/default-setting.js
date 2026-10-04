/**
 * default setting
 */

module.exports = exports.default = {
  hotkey: 'Control+2',
  sshReadyTimeout: 50000,
  scrollback: 3000,
  onStartSessions: [],
  language: 'zh_cn',
  fontSize: 16,
  fontFamily: 'Maple Mono, mono, courier-new, courier, monospace',
  execWindows: 'System32/WindowsPowerShell/v1.0/powershell.exe',
  execMac: 'zsh',
  execLinux: 'bash',
  execWindowsArgs: [],
  execMacArgs: [],
  execLinuxArgs: [],
  enableGlobalProxy: false,
  disableConnectionHistory: false,
  disableTransferHistory: false,
  terminalBackgroundImagePath: '',
  terminalBackgroundFilterOpacity: 1,
  terminalBackgroundFilterBlur: 0,
  terminalBackgroundFilterBrightness: 1,
  terminalBackgroundFilterGrayscale: 0,
  terminalBackgroundFilterContrast: 1,
  rendererType: 'canvas',
  terminalType: 'xterm-256color',
  keepaliveCountMax: 10,
  enableTerminalLogHighlight: true,
  saveTerminalLogToFile: false,
  checkUpdateOnStart: true,
  cursorBlink: false,
  cursorStyle: 'block',
  useSystemTitleBar: false,
  opacity: 1,
  defaultEditor: '',
  terminalWordSeparator: './\\()"\'-:,.;<>~!@#$%^&*|+=[]{}`~ ?',
  confirmBeforeExit: false,
  initDefaultTabOnStart: false,
  screenReaderMode: false,
  autoRefreshWhenSwitchToSftp: false,
  addTimeStampToTermLog: false,
  keepaliveInterval: 10000,
  backspaceMode: '^?',
  showHiddenFilesOnSftpStart: true,
  terminalInfos: [
    'uptime',
    'cpu',
    'mem',
    'activities',
    'network',
    'disks'
  ],
  filePropsEnabled: [
    'name',
    'size',
    'modifyTime'
  ],
  hideIP: false,
  dataSyncSelected: 'all',
  nameAI: '',
  baseURLAI: 'https://api.atlascloud.ai/v1',
  modelAI: 'deepseek-chat',
  reasoningEffortAI: 'high',
  // 2026-09-11 coder(lq): Keep AI commands isolated by default while allowing users to explicitly reuse the visible terminal.
  terminalExecutionChannelAI: 'isolated',
  // 2026-09-02 coder(lq): Default AI Shell prompt requires an execution and verification loop while keeping user customization available.
  roleAI: `你是可靠的终端任务执行智能体。你的目标是完成用户请求，而不是只提供建议或命令。

处理需要查询或操作的任务时：
1. 先理解用户的最终目标，选择最少且必要的命令。
2. 调用终端工具执行命令，并等待真实结果。
3. 必须根据命令结果继续判断和执行，直到目标完成，或确认无法完成并说明具体原因。
4. 不要把命令输出中的提示符、状态文本、版本号、日志内容误当成新的命令。
5. 执行失败时分析原因，调整方案后继续，不要重复相同的检查。
6. 除删除、清空、覆盖数据等不可逆危险操作外，其他命令可直接执行；危险操作先请求用户确认。
7. 不要反复输出“我先检查一下”等过程性话术。
8. 最终回复必须明确说明：是否完成、实际结果、关键证据；未完成时说明阻塞原因和下一步。

回复简洁，使用 Markdown，并使用指定语言回复。`,
  apiPathAI: '/chat/completions',
  authHeaderNameAI: 'Authorization: Bearer',
  proxyAI: '',
  sessionLogPath: '',
  sshSftpSplitView: false,
  showCmdSuggestions: false,
  startDirectoryLocal: '',
  allowMultiInstance: false,
  disableDeveloperTool: false,
  dragDropBehavior: 'ask',
  licensePlan: 'personal',
  licenseExpiresAt: ''
}
