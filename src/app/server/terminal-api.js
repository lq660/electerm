/**
 * run cmd with terminal
 */

const { testConnection, terminal, terminals } = require('./session-process')

async function runCmd (ws, msg) {
  const { id, pid, cmd } = msg
  const term = terminals(pid)
  let txt = ''
  if (term) {
    txt = await term.runCmd(cmd, id)
  }
  ws.s({
    id,
    data: txt
  })
}

async function runCmdStructured (ws, msg) {
  const { id, pid, cmd, timeout, executionId, cancel, operation } = msg
  const term = terminals(pid)
  const result = term && typeof term.runCmdStructured === 'function'
    ? await term.runCmdStructured(cmd, id, timeout, executionId, cancel, operation)
    : { command: cmd, stdout: '', stderr: 'Structured command execution unavailable', exitCode: null }
  ws.s({ id, data: result })
}

async function getTerminalCwd (ws, msg) {
  const { id, pid } = msg
  const term = terminals(pid)
  let cwd = ''
  if (term && typeof term.getCwd === 'function') {
    cwd = await term.getCwd(id)
  }
  ws.s({
    id,
    data: cwd
  })
}

function resize (ws, msg) {
  const { id, pid, cols, rows } = msg
  const term = terminals(pid)
  if (term) {
    term.resize(cols, rows, id)
  }
  ws.s({
    id,
    data: 'ok'
  })
}

function toggleTerminalLog (ws, msg) {
  const { id, pid } = msg
  const term = terminals(pid)
  if (term) {
    term.toggleTerminalLog(id)
  }
  ws.s({
    id,
    data: 'ok'
  })
}

function toggleTerminalLogTimestamp (ws, msg) {
  const { id, pid } = msg
  const term = terminals(pid)
  if (term) {
    term.toggleTerminalLogTimestamp(id)
  }
  ws.s({
    id,
    data: 'ok'
  })
}

function createTerm (ws, msg) {
  const { id, body } = msg
  terminal(body, ws, id)
    .then(data => {
      ws.s({
        id,
        data
      })
    })
    .catch(err => {
      ws.s({
        id,
        error: {
          message: err.message,
          stack: err.stack
        }
      })
    })
}

function testTerm (ws, msg) {
  const { id, body } = msg
  testConnection(body, ws, id)
    .then(data => {
      if (data) {
        ws.s({
          id,
          data
        })
      } else {
        ws.s({
          id,
          error: {
            message: 'test failed',
            stack: 'test failed'
          }
        })
      }
    })
    .catch(err => {
      ws.s({
        id,
        error: {
          message: err.message || 'test failed',
          stack: err.stack || 'test failed'
        }
      })
    })
}

function setTerminalLogPath (ws, msg) {
  const { id, pid, logPath } = msg
  const term = terminals(pid)
  if (term) {
    term.setTerminalLogPath(id, logPath)
  }
  ws.s({
    id,
    data: 'ok'
  })
}

function startTerminalLogFile (ws, msg) {
  const { id, pid, logFilePath, addTimeStampToTermLog } = msg
  const term = terminals(pid)
  if (term) {
    term.startTerminalLogFile(id, logFilePath, addTimeStampToTermLog)
  }
  ws.s({
    id,
    data: 'ok'
  })
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
