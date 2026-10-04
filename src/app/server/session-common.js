/**
 * terminal/sftp/serial class
 */

const { runRemoteCommand, cancelCommand } = require('./agent-command-execution')

exports.commonExtends = function (Cls) {
  Cls.prototype.customEnv = function (envs) {
    if (!envs) {
      return {}
    }
    return envs.split(' ').reduce((p, k) => {
      const [key, value] = k.split('=')
      if (key && value) {
        p[key] = value
      }
      return p
    }, {})
  }

  Cls.prototype.getEnv = function (initOptions = this.initOptions) {
    return {
      LANG: initOptions.envLang || 'en_US.UTF-8',
      ...this.customEnv(initOptions.setEnv)
    }
  }

  Cls.prototype.getExecOpts = function () {
    return {
      env: this.getEnv()
    }
  }

  Cls.prototype.runCmd = function (cmd, conn) {
    return this.runCmdStructured(cmd, conn).then(result => {
      if (result.success === false || result.timedOut || result.cancelled || result.exitCode === null) {
        throw new Error(result.stderr || 'Command did not finish successfully')
      }
      return result.stdout
    })
  }

  // 2026-09-01 coder(lq): Keep agent commands outside the interactive PTY and expose exit/error state for reliable decisions.
  Cls.prototype.runCmdStructured = function (cmd, conn, timeout = 45000, executionId, background = false) {
    return runRemoteCommand(this, { command: cmd, client: conn || this.conn || this.client, execOptions: this.getExecOpts(), timeout, executionId, background })
  }
  Cls.prototype.cancelCmdStructured = function (executionId) { return cancelCommand(this, executionId) }
  return Cls
}
