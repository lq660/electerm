// 2026-09-06 coder(lq): Use stable numeric suffixes for duplicate transfer names so copy/paste conflicts stay predictable.
export function splitTransferName (fileName) {
  if (typeof fileName !== 'string' || !fileName) {
    return {
      base: '',
      ext: ''
    }
  }

  if (fileName.startsWith('.') && !fileName.slice(1).includes('.')) {
    return {
      base: fileName,
      ext: ''
    }
  }

  const parts = fileName.split('.')
  if (parts.length === 1) {
    return {
      base: fileName,
      ext: ''
    }
  }

  const ext = parts[parts.length - 1] || ''
  return {
    base: parts.slice(0, -1).join('.'),
    ext: ext ? `.${ext}` : ''
  }
}

export function buildDuplicateTransferName (fileName, index) {
  const { base, ext } = splitTransferName(fileName)
  return `${base}(${index})${ext}`
}

export async function findAvailableDuplicateTransferName ({
  dirPath,
  fileName,
  exists,
  resolvePath
}) {
  if (typeof exists !== 'function') {
    throw new TypeError('exists callback is required')
  }
  if (typeof resolvePath !== 'function') {
    throw new TypeError('resolvePath callback is required')
  }

  let index = 1
  while (true) {
    const newName = buildDuplicateTransferName(fileName, index)
    const newPath = resolvePath(dirPath, newName)
    const isTaken = await exists(newPath)
    if (!isTaken) {
      return {
        newName,
        newPath
      }
    }
    index += 1
  }
}
