/**
 * run cmd with terminal
 */

const {
  terminals
} = require('./remote-common')
const { startSession } = require('./session')
const { startBackgroundCommand, getBackgroundCommand } = require('./agent-command-execution')

async function runCmd (body) {
  const { pid, cmd } = body
  const term = terminals(pid)
  let txt = ''
  if (term) {
    txt = await term.runCmd(cmd)
  }
  return txt
}

async function runCmdStructured (body) {
  const { pid, cmd, timeout, executionId, cancel, operation } = body
  const term = terminals(pid)
  if (cancel) return term?.cancelCmdStructured?.(executionId) || { cancelled: false }
  if (!term || typeof term.runCmdStructured !== 'function') {
    return { command: cmd, stdout: '', stderr: 'Structured command execution unavailable', exitCode: null }
  }
  if (operation === 'background-status') return getBackgroundCommand(term, executionId)
  if (operation === 'background-start') return startBackgroundCommand(term, executionId, () => term.runCmdStructured(cmd, undefined, timeout, executionId, true))
  return term.runCmdStructured(cmd, undefined, timeout, executionId)
}

async function getTerminalCwd (body) {
  const { pid } = body
  const term = terminals(pid)
  if (term && typeof term.getCwd === 'function') {
    return term.getCwd()
  }
  return ''
}

async function resize (body) {
  const { pid, cols, rows } = body
  const term = terminals(pid)
  if (term) {
    term.resize(cols, rows)
  }
  return 'ok'
}

async function toggleTerminalLog (body) {
  const { pid } = body
  const term = terminals(pid)
  if (term) {
    term.toggleTerminalLog()
  }
  return 'ok'
}

async function toggleTerminalLogTimestamp (body) {
  const { pid } = body
  const term = terminals(pid)
  if (term) {
    term.toggleTerminalLogTimestamp()
  }
  return 'ok'
}

async function createTerm (body, ws) {
  const t = await startSession(body, ws)
  return t.pid
}

async function testTerm (body, ws) {
  const r = await startSession(body, ws, 'test')
  if (r) {
    return r
  } else {
    throw new Error('test failed')
  }
}

async function setTerminalLogPath (body) {
  const { pid, logPath } = body
  const term = terminals(pid)
  if (term) {
    term.setTerminalLogPath(logPath)
  }
  return 'ok'
}

async function startTerminalLogFile (body) {
  const { pid, logFilePath, addTimeStampToTermLog } = body
  const term = terminals(pid)
  if (term) {
    term.startTerminalLogFile(logFilePath, addTimeStampToTermLog)
  }
  return 'ok'
}

exports.createTerm = createTerm
exports.testTerm = testTerm
exports.resize = resize
exports.runCmd = runCmd
exports.runCmdStructured = runCmdStructured
exports.getTerminalCwd = getTerminalCwd
exports.toggleTerminalLog = toggleTerminalLog
exports.toggleTerminalLogTimestamp = toggleTerminalLogTimestamp
exports.setTerminalLogPath = setTerminalLogPath
exports.startTerminalLogFile = startTerminalLogFile
