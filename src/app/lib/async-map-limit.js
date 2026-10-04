// 2026-09-11 coder(lq): Bound concurrent async work while preserving source order.
async function asyncMapLimit (items, limit, mapper) {
  const source = Array.isArray(items) ? items : []
  const results = new Array(source.length)
  const workerCount = Math.min(Math.max(1, limit), source.length)
  let nextIndex = 0

  async function runWorker () {
    while (nextIndex < source.length) {
      const index = nextIndex++
      results[index] = await mapper(source[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, () => runWorker())
  )
  return results
}

module.exports = asyncMapLimit
