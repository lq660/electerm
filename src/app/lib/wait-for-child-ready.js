const DEFAULT_CHILD_READY_TIMEOUT = 15000

function describeExit (code, signal) {
  if (signal) {
    return `signal ${signal}`
  }
  if (code !== null && code !== undefined) {
    return `code ${code}`
  }
  return 'an unknown reason'
}

exports.waitForChildReady = function (child, options = {}) {
  const timeout = Number.isFinite(options.timeout)
    ? options.timeout
    : DEFAULT_CHILD_READY_TIMEOUT
  const isReady = options.isReady || (message => Boolean(message?.serverInited))

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (handler, value) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      child.removeListener('message', onMessage)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      handler(value)
    }
    const onMessage = (message) => {
      if (isReady(message)) {
        finish(resolve, child)
      }
    }
    const onError = (error) => {
      finish(reject, new Error(`Background service failed to start: ${error.message}`))
    }
    const onExit = (code, signal) => {
      finish(reject, new Error(`Background service exited before startup (${describeExit(code, signal)})`))
    }
    const timer = setTimeout(() => {
      finish(reject, new Error(`Background service startup timed out after ${timeout} ms`))
    }, timeout)

    child.on('message', onMessage)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

exports.DEFAULT_CHILD_READY_TIMEOUT = DEFAULT_CHILD_READY_TIMEOUT
