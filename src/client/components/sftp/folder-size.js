import { filesize } from 'filesize'
import resolve from '../../common/resolve'
import { typeMap } from '../../common/constants'

const folderSizeCache = new Map()
const folderSizeRequests = new Map()
const folderSizeCacheLimit = 300
export const folderSizeConcurrency = 5
let activeFolderSizeRequests = 0
const pendingFolderSizeRequests = []

const drainFolderSizeRequests = () => {
  while (
    activeFolderSizeRequests < folderSizeConcurrency &&
    pendingFolderSizeRequests.length
  ) {
    const { task, resolve, reject } = pendingFolderSizeRequests.shift()
    activeFolderSizeRequests++
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        activeFolderSizeRequests--
        drainFolderSizeRequests()
      })
  }
}

// 2026-10-01 coder(lq): Enforce one global scan ceiling so local, remote and symbolic-link queues cannot exceed five active recursive scans together.
const runFolderSizeTask = task => {
  return new Promise((resolve, reject) => {
    pendingFolderSizeRequests.push({ task, resolve, reject })
    drainFolderSizeRequests()
  })
}

export const getFolderSizeCacheKey = ({ file, type, tab }) => {
  const connection = type === typeMap.local
    ? 'local'
    : (tab?.id || tab?.host || 'remote')
  return [connection, type, file.path, file.name, file.modifyTime || ''].join('|')
}

const setFolderSizeCache = (key, value) => {
  folderSizeCache.delete(key)
  folderSizeCache.set(key, value)
  if (folderSizeCache.size > folderSizeCacheLimit) {
    folderSizeCache.delete(folderSizeCache.keys().next().value)
  }
}

export const getCachedFolderSize = props => {
  return folderSizeCache.get(getFolderSizeCacheKey(props))
}

export const formatFolderSizeResult = (result, isFtp) => {
  const reportedBytes = Number(result?.sizeBytes)
  const legacySize = Number(result?.size)
  const bytes = Number.isFinite(reportedBytes)
    ? reportedBytes
    : (isFtp ? legacySize : legacySize * Math.pow(1024, 3))
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error('Invalid folder size result')
  }
  return {
    bytes,
    count: Number(result?.count) || 0,
    value: filesize(bytes)
  }
}

// 2026-10-01 coder(lq): Share scans between the automatic directory queue and manual refreshes so the same folder is never scanned twice concurrently.
export const loadFolderSize = async (props, force = false) => {
  const { file, type, isFtp, sftp } = props
  const cacheKey = getFolderSizeCacheKey(props)
  if (!force) {
    const cached = folderSizeCache.get(cacheKey)
    if (cached) return cached
  }

  let request = folderSizeRequests.get(cacheKey)
  if (!request) {
    // 2026-10-01 coder(lq): Directory symlinks must be measured through their resolved target; `du` on the link itself reports zero bytes.
    const folderPath = file.folderSizePath || resolve(file.path, file.name)
    request = runFolderSizeTask(() => (
      type === typeMap.local
        ? window.fs.getFolderSize(folderPath)
        : sftp.getFolderSize(folderPath)
    ))
      .then(result => formatFolderSizeResult(result, isFtp))
      .then(formatted => {
        setFolderSizeCache(cacheKey, formatted)
        return formatted
      })
      .finally(() => {
        folderSizeRequests.delete(cacheKey)
      })
    folderSizeRequests.set(cacheKey, request)
  }
  return request
}
