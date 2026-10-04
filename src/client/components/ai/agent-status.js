const TOOL_LABELS = {
  send_terminal_command: '终端命令',
  run_background_command: '后台命令',
  get_terminal_output: '读取终端输出',
  get_terminal_status: '检查终端状态',
  sftp_list: '查看远程目录',
  sftp_read_file: '读取远程文件',
  sftp_stat: '查看文件信息'
}

const FINISHED_TOOL_STATUSES = new Set(['completed', 'error', 'skipped'])

// 2026-10-01 coder(lq): Task completion comes from the verified runtime state; finished tool calls only describe execution progress.
export function deriveAgentStatus (entry = {}, agentRunning = false) {
  const toolCalls = entry.toolCalls || []
  const pendingConfirmation = toolCalls.find(tool => tool.status === 'pending_confirm')
  const latestTool = toolCalls[toolCalls.length - 1]
  const activeTool = [...toolCalls]
    .reverse()
    .find(tool => tool.status === 'running' || tool.status === 'pending_confirm')
  const activeToolLabel = TOOL_LABELS[activeTool?.name] || activeTool?.name || '下一步'
  const activeToolCommand = activeTool?.args?.command
  const runtimeState = entry.agentRuntime?.state
  const totalToolCount = toolCalls.length
  const finishedToolCount = toolCalls.filter(tool => FINISHED_TOOL_STATUSES.has(tool.status)).length
  const progressText = totalToolCount > 0 ? `执行步骤：${finishedToolCount}/${totalToolCount}` : ''

  if (entry.queued) {
    return { status: '排队中', detail: '前面还有任务，当前消息会按顺序自动执行', statusClass: 'queued', pendingConfirmation, progressText }
  }
  if (entry.pending) {
    return { status: '准备执行', detail: '正在准备终端上下文和执行计划', statusClass: 'running', pendingConfirmation, progressText }
  }
  if (pendingConfirmation) {
    return { status: '待确认', detail: '有一条会改变服务器状态的命令等待你的确认', statusClass: 'pending', pendingConfirmation, progressText }
  }
  if (runtimeState === 'blocked') {
    return { status: '未完成', detail: '任务未通过完成核验，请查看下方原因', statusClass: 'error', pendingConfirmation, progressText }
  }
  if (runtimeState === 'cancelled') {
    return { status: '已停止', detail: '任务已停止，已保留此前的执行结果', statusClass: 'error', pendingConfirmation, progressText }
  }
  if (runtimeState === 'final') {
    return { status: '已完成', detail: '已完成检查、执行与验证', statusClass: 'done', pendingConfirmation, progressText }
  }
  if (agentRunning) {
    const status = latestTool?.status === 'completed' ? '分析结果中' : '执行中'
    const detail = activeToolCommand
      ? `正在执行${activeToolLabel}：${activeToolCommand}`
      : `正在${activeToolLabel}，等待真实结果后继续`
    return { status, detail, statusClass: 'running', pendingConfirmation, progressText }
  }
  if (toolCalls.some(tool => tool.status === 'error')) {
    return { status: '需要关注', detail: '部分步骤失败，请查看下方命令结果', statusClass: 'error', pendingConfirmation, progressText }
  }
  return { status: '已完成', detail: '已完成检查、执行与验证', statusClass: 'done', pendingConfirmation, progressText }
}
