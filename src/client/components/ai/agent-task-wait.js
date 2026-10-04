// 2026-09-08 coder(lq): Wait between background observations without blocking manual stop or spending model turns on tight polling.
export async function waitForAgentTask (readStatus, { signal, waitSeconds = 10 } = {}) {
  const deadline = Date.now() + Math.min(30, Math.max(0, Number(waitSeconds) || 0)) * 1000
  const check = () => { if (signal?.aborted) throw new Error('任务已停止') }
  while (true) {
    check()
    const result = await readStatus()
    check()
    const remaining = deadline - Date.now()
    if (result.status !== 'running' || remaining <= 0) return result
    await new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); resolve() }
      const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new Error('任务已停止')) }
      const timer = setTimeout(finish, Math.min(1000, remaining))
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) cancel()
    })
  }
}
