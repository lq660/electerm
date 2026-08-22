export const COMMAND_HISTORY_SIGNAL_DEDUP_MS = 1500

export function normalizeTerminalCommand (cmd) {
  return (cmd || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
}

export function normalizeTerminalCommandForHistory (cmd) {
  const normalized = normalizeTerminalCommand(cmd)
  if (!normalized) {
    return ''
  }
  // 2026-07-29 coder(lq): Shell integration can report alias-expanded `ls --color=auto`; history should keep the user's reusable command.
  if (/^ls(?:\s|$)/.test(normalized) && /(?:^|\s)--color=auto(?:\s|$)/.test(normalized)) {
    return normalized
      .replace(/(^|\s)--color=auto(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return normalized
}

export function isSameTerminalCommand (left, right) {
  return normalizeTerminalCommand(left) === normalizeTerminalCommand(right)
}

export function shouldMergeCommandSignal (existing, sessionId, signal, nowMs = Date.now()) {
  if (!existing || !sessionId || !signal || !existing.lastCommandSignal) {
    return false
  }
  if (existing.lastSessionId !== sessionId || existing.lastCommandSignal === signal) {
    return false
  }
  const lastMs = Date.parse(existing.lastUseTime || '')
  return Number.isFinite(lastMs) && nowMs - lastMs >= 0 && nowMs - lastMs < COMMAND_HISTORY_SIGNAL_DEDUP_MS
}
