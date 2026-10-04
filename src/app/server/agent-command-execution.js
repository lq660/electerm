const { spawn } = require('child_process')
const { StringDecoder } = require('string_decoder')

const executions = new WeakMap()
const backgroundJobs = new WeakMap()
const OUTPUT_LIMIT = 1024 * 1024

// 2026-09-08 coder(lq): Ownership is the live session object plus an opaque execution id, never the visible PTY or a shared SSH connection.
exports.cancelCommand = (owner, executionId) => {
  const execution = executions.get(owner)?.get(executionId)
  if (!execution) return { cancelled: false }
  execution.cancel()
  return { cancelled: true, terminationConfirmed: false }
}

// 2026-09-08 coder(lq): Background work stays on an owned execution channel; no nohup/PID-file polling or visible-terminal fallback.
exports.startBackgroundCommand = (owner, executionId, start) => {
  if (!executionId) throw new Error('Background execution id is required')
  let jobs = backgroundJobs.get(owner)
  if (!jobs) backgroundJobs.set(owner, (jobs = new Map()))
  if (jobs.has(executionId)) throw new Error('Background execution id already exists')
  for (const [id, job] of jobs) {
    if (jobs.size < 32) break
    if (job.status !== 'running') jobs.delete(id)
  }
  if (jobs.size >= 32) throw new Error('Too many active background commands')
  const job = { taskId: executionId, status: 'running' }
  jobs.set(executionId, job)
  try {
    Promise.resolve(start()).then(result => {
      Object.assign(job, result, { status: result.cancelled ? 'cancelled' : result.timedOut || result.exitCode === null ? 'failed' : 'completed' })
    }, error => Object.assign(job, { status: 'failed', stderr: error.message, exitCode: null }))
  } catch (error) { Object.assign(job, { status: 'failed', stderr: error.message, exitCode: null }) }
  return { ...job }
}

exports.getBackgroundCommand = (owner, executionId) => {
  const job = backgroundJobs.get(owner)?.get(executionId)
  if (!job) return { taskId: executionId, status: 'unknown', message: '后台任务不存在或所属连接已关闭。' }
  return { ...job, ...executions.get(owner)?.get(executionId)?.snapshot() }
}

function execute (owner, { command, executionId, timeout, background }, start) {
  let registry = executions.get(owner)
  if (!registry) executions.set(owner, (registry = new Map()))
  const key = executionId || Symbol('inspection')
  if (registry.has(key)) return Promise.reject(new Error('Execution id is already running'))
  return new Promise(resolve => {
    const startedAt = Date.now()
    const timeoutMs = background ? 12 * 60 * 60 * 1000 : Math.min(Math.max(Number(timeout) || 45000, 1000), 120000)
    let settled = false
    let interrupt
    let stopped = false
    let stdout = ''
    let stderr = ''
    let truncated = false
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }
    const snapshot = () => ({ command, stdout, stderr, outputTruncated: truncated, exitCode: null, durationMs: Date.now() - startedAt })
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      registry.delete(key)
      resolve({ ...snapshot(), ...result })
    }
    const stop = timedOut => {
      if (settled) return
      stopped = true
      // Capture cancellation before close events: an SSH close without status is not a successful exit.
      finish({ cancelled: !timedOut, timedOut, terminationConfirmed: false })
      interrupt?.()
    }
    const timer = setTimeout(() => stop(true), timeoutMs)
    registry.set(key, { cancel: () => stop(false), snapshot })
    try {
      start({
        finish,
        setInterrupt (fn) { interrupt = fn; if (stopped) fn() },
        get stopped () { return stopped },
        append (channel, data) {
          if (settled) return
          const text = decoders[channel].write(Buffer.isBuffer(data) ? data : Buffer.from(data))
          if (channel === 'stdout') { stdout += text; if (stdout.length > OUTPUT_LIMIT) { stdout = stdout.slice(0, OUTPUT_LIMIT); truncated = true } } else { stderr += text; if (stderr.length > OUTPUT_LIMIT) { stderr = stderr.slice(0, OUTPUT_LIMIT); truncated = true } }
        }
      })
    } catch (error) { finish({ stderr: error.message, success: false }) }
  })
}

exports.runRemoteCommand = (owner, options) => execute(owner, options, state => {
  options.client.exec(options.command, options.execOptions || {}, (error, stream) => {
    if (error || !stream) return state.finish({ stderr: error?.message || 'SSH did not return an execution channel', success: false })
    // 2026-09-08 coder(lq): A channel may arrive after cancellation; its close/error events still need handlers.
    stream.on('error', error => state.finish({ stderr: error.message, success: false }))
    stream.on('close', (code, signal) => state.finish({ exitCode: typeof code === 'number' ? code : null, signal: signal || null, timedOut: false }))
    state.setInterrupt(() => {
      try { stream.signal('TERM') } catch {}
      try { stream.close() } catch {}
    })
    if (state.stopped) return
    stream.on('data', data => state.append('stdout', data))
    stream.stderr?.on('data', data => state.append('stderr', data))
  })
})

exports.runLocalCommand = (owner, options) => execute(owner, options, state => {
  const child = spawn(options.shell, ['-lc', options.command], { cwd: options.cwd, env: options.env || process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  state.setInterrupt(() => {
    // 2026-09-08 coder(lq): The isolated process group includes foreground descendants; never signal the user's terminal process.
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    }
  })
  child.stdout.on('data', data => state.append('stdout', data))
  child.stderr.on('data', data => state.append('stderr', data))
  child.on('error', error => state.finish({ stderr: error.message, success: false }))
  child.on('close', (code, signal) => state.finish({ exitCode: code, signal, timedOut: false }))
})
