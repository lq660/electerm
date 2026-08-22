/**
 * terminal/sftp/serial class
 */

const { resolve: pathResolve } = require('path')
const { TerminalBase } = require('./session-base')
const globalState = require('./global-state')
const { execFile, execFileSync } = require('child_process')
const fs = require('fs')
// const { MockBinding } = require('@serialport/binding-mock')
// MockBinding.createPort('/dev/ROBOT', { echo: true, record: true })

class TerminalLocal extends TerminalBase {
  init () {
    const {
      cols,
      rows,
      execWindows,
      execMac,
      execLinux,
      execWindowsArgs,
      execMacArgs,
      execLinuxArgs,
      termType,
      term
    } = this.initOptions
    this.isLocal = true
    const { platform } = process
    const isWin = platform.startsWith('win')
    const exec = isWin
      ? pathResolve(
        process.env.windir,
        execWindows
      )
      : platform === 'darwin' ? execMac : execLinux
    if ((exec || '').includes('..')) {
      return Promise.reject(new Error('execWindows should not contain ".."'))
    }
    const arg = isWin
      ? execWindowsArgs
      : platform === 'darwin' ? execMacArgs : execLinuxArgs
    const cwd = process.env[platform === 'win32' ? 'USERPROFILE' : 'HOME']
    const argv = platform.startsWith('darwin') ? ['--login', ...arg] : arg
    const pty = require('node-pty')
    const env = Object.assign({}, process.env)
    this.term = pty.spawn(exec, argv, {
      name: term,
      encoding: null,
      cols: cols || 80,
      rows: rows || 24,
      cwd,
      env
    })
    this.term.termType = termType
    globalState.setSession(this.pid, this)
    return Promise.resolve(this)
  }

  resize (cols, rows) {
    this.term.resize(cols, rows)
  }

  on (event, cb) {
    this.term.on(event, cb)
  }

  write (data) {
    this.term.write(data)
  }

  getCwd () {
    const pid = this.term?.pid
    if (!pid) {
      return ''
    }
    try {
      if (process.platform === 'darwin') {
        // 2026-07-06 coder(lq): node-pty exposes the shell pid; lsof gives its real cwd after interactive cd commands.
        const output = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
          encoding: 'utf8',
          timeout: 1000
        })
        const line = output.split(/\r?\n/).find(item => item.startsWith('n/'))
        return line ? line.slice(1) : ''
      }
      if (process.platform === 'linux') {
        return fs.readlinkSync(`/proc/${pid}/cwd`)
      }
    } catch (e) {
      return ''
    }
    return ''
  }

  runCmd (cmd) {
    const { platform } = process
    if (platform === 'win32') {
      return Promise.reject(new Error('Local command inspection is not supported on Windows yet'))
    }
    const shell = platform === 'darwin'
      ? this.initOptions.execMac
      : this.initOptions.execLinux
    const cwd = this.getCwd() || process.env.HOME
    // 2026-07-11 coder(lq): Run read-only environment probes outside the visible PTY so command-assistant discovery does not alter terminal history or output.
    return new Promise((resolve, reject) => {
      execFile(shell, ['-lc', cmd], {
        cwd,
        env: { ...process.env },
        timeout: 8000,
        maxBuffer: 1024 * 1024
      }, (error, stdout) => {
        if (error && !stdout) {
          reject(error)
          return
        }
        resolve(stdout || '')
      })
    })
  }

  kill () {
    if (this.sessionLogger) {
      this.sessionLogger.destroy()
    }
    this.term && this.term.kill()
    this.onEndConn()
  }
}

exports.session = function (initOptions, ws) {
  return (new TerminalLocal(initOptions, ws)).init()
}

/**
 * test ssh connection
 * @param {object} options
 */
exports.test = (initOptions) => {
  return Promise.resolve(true)
}
