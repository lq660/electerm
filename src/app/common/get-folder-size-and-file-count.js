// 2026-10-01 coder(lq): Preserve the legacy GB value while also returning exact bytes for new file-list consumers.
const parseHumanSizeToBytes = function (value) {
  const match = String(value || '').trim().match(/^([\d.]+)\s*([KMGTPE]?)(?:i?B)?$/i)
  if (!match) {
    return 0
  }
  const amount = Number(match[1])
  const units = ['', 'K', 'M', 'G', 'T', 'P', 'E']
  const power = units.indexOf(match[2].toUpperCase())
  return Number.isFinite(amount) && power >= 0
    ? Math.round(amount * Math.pow(1024, power))
    : 0
}

// 2026-10-01 coder(lq): Virtual and actively changing filesystems such as /proc can lose entries mid-scan; return the readable subset instead of failing the whole directory.
const buildPosixFolderSizeCommand = function (escapedPath) {
  return `folder_size=$(du -sh ${escapedPath} 2>/dev/null | awk 'NR == 1 { print $1 }'); printf '%s\\n' "\${folder_size:-0}"; find ${escapedPath} -type f 2>/dev/null | wc -l`
}

exports.getSizeCount = function (str) {
  const [s1, s2] = str.split('\n').map(d => d.trim())
  const arr = s1.split(/\s+/)
  const d1 = arr[0]
  let size = parseFloat(d1)
  const unit = d1.slice(-1)
  if (unit === 'M') {
    size = size / 1024
  } else if (unit === 'K') {
    size = size / 1024 / 1024
  }
  const count = parseInt(s2, 10)
  return {
    count,
    size,
    sizeBytes: parseHumanSizeToBytes(d1)
  }
}

exports.getSizeCountWin = function (str) {
  const arr = str.trim().split('\n')
  let count = 0
  let size = 0
  let sizeBytes = 0
  let all = 0
  for (const s of arr) {
    const match = s.trim().match(/^(Count|Sum)\s*:?\s*(\d+)/i)
    if (!match) {
      continue
    }
    const [, rawKey, s2] = match
    const s1 = rawKey.toLowerCase()
    if (s1 === 'count') {
      count = parseInt(s2, 10)
      all = all + 1
      if (all > 1) {
        break
      }
    } else if (s1 === 'sum') {
      all = all + 1
      sizeBytes = parseInt(s2, 10)
      size = sizeBytes / 1024
      if (all > 1) {
        break
      }
    }
  }
  return {
    count,
    size,
    sizeBytes
  }
}

exports.parseHumanSizeToBytes = parseHumanSizeToBytes
exports.buildPosixFolderSizeCommand = buildPosixFolderSizeCommand
