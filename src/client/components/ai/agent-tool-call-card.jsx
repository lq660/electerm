import { useState } from 'react'
import { Tag } from 'antd'
import {
  CaretDownOutlined,
  CaretRightOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  DatabaseOutlined,
  PlayCircleOutlined
} from '@ant-design/icons'

const toolIcons = {
  send_terminal_command: CodeOutlined,
  get_terminal_output: CodeOutlined,
  open_local_terminal: CodeOutlined,
  list_tabs: CodeOutlined,
  get_active_tab: CodeOutlined,
  switch_tab: CodeOutlined,
  list_bookmarks: DatabaseOutlined,
  open_bookmark: DatabaseOutlined,
  add_bookmark: DatabaseOutlined
}

const toolLabels = {
  send_terminal_command: '执行终端命令',
  get_terminal_output: '读取终端输出',
  get_terminal_status: '检查终端状态',
  cancel_terminal_command: '中断终端命令',
  open_local_terminal: '打开本地终端',
  list_tabs: '查看已打开页签',
  get_active_tab: '读取当前页签',
  switch_tab: '切换页签',
  close_tab: '关闭页签',
  list_bookmarks: '查看服务器资源',
  open_bookmark: '打开服务器资源',
  add_bookmark: '添加服务器资源',
  open_tab: '打开连接',
  sftp_list: '查看远程目录',
  sftp_stat: '查看文件信息',
  sftp_read_file: '读取远程文件',
  sftp_del: '删除远程文件',
  sftp_upload: '上传文件',
  sftp_download: '下载文件',
  sftp_transfer_list: '查看传输任务',
  sftp_transfer_history: '查看传输历史',
  run_background_command: '后台执行命令',
  get_background_task_status: '查看后台任务状态',
  get_background_task_log: '查看后台任务日志',
  cancel_background_task: '取消后台任务'
}

function formatResult (result) {
  if (!result) return ''
  try {
    const parsed = JSON.parse(result)
    if (parsed.command || parsed.output || parsed.exitCode !== undefined || parsed.timedOut) {
      const lines = []
      if (parsed.command) lines.push(`命令：${parsed.command}`)
      if (parsed.exitCode !== undefined && parsed.exitCode !== null) lines.push(`退出码：${parsed.exitCode}`)
      if (parsed.timedOut) lines.push('状态：执行超时，已返回当前可见输出')
      if (parsed.waitingForInput) lines.push('状态：等待密码或交互输入')
      if (parsed.message) lines.push(`说明：${parsed.message}`)
      if (parsed.output) lines.push(`输出：\n${parsed.output}`)
      return lines.join('\n')
    }
    if (parsed.tabId && (parsed.isRunning !== undefined || parsed.isIdle !== undefined || parsed.hasPasswordPrompt !== undefined)) {
      const lines = []
      lines.push(`终端：${parsed.tabId}`)
      lines.push(`状态：${parsed.hasPasswordPrompt ? '等待输入' : parsed.isRunning ? '运行中' : '空闲'}`)
      if (parsed.lineCount !== undefined) lines.push(`最近输出行数：${parsed.lineCount}`)
      if (parsed.output) lines.push(`最近输出：\n${parsed.output}`)
      return lines.join('\n')
    }
    return JSON.stringify(parsed, null, 2)
  } catch {
    return result
  }
}

export default function AgentToolCallCard ({ toolCall }) {
  const [expanded, setExpanded] = useState(toolCall.status === 'running')
  const { name, args, status, result } = toolCall
  const Icon = toolIcons[name] || CodeOutlined
  const label = toolLabels[name] || name
  const needsConfirm = status === 'pending_confirm' && name === 'send_terminal_command' && args?.command

  function renderStatus () {
    if (status === 'running') {
      return <LoadingOutlined className='agent-tool-status-running' />
    }
    if (status === 'completed') {
      return <CheckCircleOutlined className='agent-tool-status-completed' />
    }
    if (status === 'pending_confirm') {
      return <ClockCircleOutlined className='agent-tool-status-pending' />
    }
    return <CloseCircleOutlined className='agent-tool-status-error' />
  }

  function renderTag () {
    const color = status === 'running' ? 'processing' : status === 'completed' ? 'success' : status === 'pending_confirm' ? 'warning' : 'error'
    const statusText = {
      running: '执行中',
      completed: '已完成',
      pending_confirm: '待确认',
      error: '失败'
    }[status] || status
    return (
      <Tag color={color} className='agent-tool-tag'>
        {statusText}
      </Tag>
    )
  }

  function handleConfirmRun (e) {
    e.stopPropagation()
    window.store.runCommandInTerminal(args.command)
  }

  return (
    <div className={`agent-tool-call-card agent-tool-${status}`}>
      <div
        className='agent-tool-header pointer'
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
        <Icon className='mg1l' />
        <span className='mg1l agent-tool-name'>{label}</span>
        {args?.command
          ? <code className='agent-tool-command-preview'>{args.command}</code>
          : null}
        {needsConfirm && (
          <button
            className='agent-tool-confirm-button'
            title='确认执行该命令'
            onClick={handleConfirmRun}
          >
            <PlayCircleOutlined />
            <span>执行</span>
          </button>
        )}
        {renderTag()}
        {renderStatus()}
      </div>
      {expanded && (
        <div className='agent-tool-detail'>
          {args && Object.keys(args).length > 0 && (
            <div className='agent-tool-args'>
              <div className='agent-tool-label'>参数：</div>
              <pre className='agent-tool-pre'>{JSON.stringify(args, null, 2)}</pre>
            </div>
          )}
          {result && (
            <div className='agent-tool-result'>
              <div className='agent-tool-label'>结果：</div>
              <pre className='agent-tool-pre'>{formatResult(result)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
