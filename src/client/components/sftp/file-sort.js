const isMissingSortValue = value => {
  return value === null || value === undefined ||
    (typeof value === 'number' && !Number.isFinite(value))
}

export const getSftpSortValue = (file, sortProp) => {
  if (sortProp === 'size' && file?.isDirectory) {
    const bytes = Number(file.folderSizeBytes)
    return file.folderSizeStatus === 'done' && Number.isFinite(bytes)
      ? bytes
      : null
  }
  return file?.[sortProp]
}

export const hasSftpSortUpdate = updates => {
  return Object.keys(updates || {}).some(key => (
    key.startsWith('sortDirection.') || key.startsWith('sortProp.')
  ))
}

// 2026-10-01 coder(lq): Directory size is filled asynchronously, so sort by its raw byte count and keep unfinished rows after completed rows in either direction.
export const compareSftpFiles = (a, b, sortProp, sortDirection) => {
  if (!a.id && b.id) return -1
  if (a.id && !b.id) return 1
  if (!a.id && !b.id) return 0

  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1
  }

  let aValue = getSftpSortValue(a, sortProp)
  let bValue = getSftpSortValue(b, sortProp)
  const aMissing = isMissingSortValue(aValue)
  const bMissing = isMissingSortValue(bValue)
  if (aMissing !== bMissing) return aMissing ? 1 : -1
  if (aMissing) return 0

  const isDesc = sortDirection === 'desc'
  if (typeof aValue === 'string' && typeof bValue === 'string') {
    aValue = aValue.toLowerCase()
    bValue = bValue.toLowerCase()
    return isDesc
      ? bValue.localeCompare(aValue, undefined, { sensitivity: 'base' })
      : aValue.localeCompare(bValue, undefined, { sensitivity: 'base' })
  }

  if (aValue < bValue) return isDesc ? 1 : -1
  if (aValue > bValue) return isDesc ? -1 : 1
  return 0
}
