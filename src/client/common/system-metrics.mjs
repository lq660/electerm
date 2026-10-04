const unitMultipliers = {
  '': 1,
  B: 1,
  K: 1024,
  KB: 1000,
  KI: 1024,
  KIB: 1024,
  M: 1024 ** 2,
  MB: 1000 ** 2,
  MI: 1024 ** 2,
  MIB: 1024 ** 2,
  G: 1024 ** 3,
  GB: 1000 ** 3,
  GI: 1024 ** 3,
  GIB: 1024 ** 3,
  T: 1024 ** 4,
  TB: 1000 ** 4,
  TI: 1024 ** 4,
  TIB: 1024 ** 4,
  P: 1024 ** 5,
  PB: 1000 ** 5,
  PI: 1024 ** 5,
  PIB: 1024 ** 5
}

export function sizeToBytes (value = '') {
  const match = String(value)
    .trim()
    .replace(/,/g, '')
    .match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([kmgtp]?i?b?)?$/i)
  if (!match) return 0

  const parsed = Number(match[1])
  const unit = (match[2] || '').toUpperCase()
  const multiplier = unitMultipliers[unit]
  if (!Number.isFinite(parsed) || multiplier === undefined) return 0

  // 2026-09-22 coder(lq): `free -h` can mix IEC units such as Gi and Mi in one row, so normalize each value before calculating a percentage.
  return parsed * multiplier
}

export function getUsagePercent (used, total) {
  const usedBytes = sizeToBytes(used)
  const totalBytes = sizeToBytes(total)
  if (usedBytes < 0 || totalBytes <= 0) return 0

  return Math.max(0, Math.min(100, Math.round(usedBytes * 100 / totalBytes)))
}
