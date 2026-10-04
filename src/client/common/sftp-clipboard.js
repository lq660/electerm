// 2026-09-04 coder(lq): Keep file-transfer clipboard metadata reusable so cross-window pastes can recover source terminal info.
export const sftpClipboardFormat = 'application/x-electerm-sftp-transfer'

export const resolveSftpClipboardTransfer = ({
  clipboardText,
  appClipboard,
  systemClipboard
}) => {
  const candidates = [
    appClipboard,
    systemClipboard
  ]
  return candidates.find(candidate => {
    return candidate?.text === clipboardText &&
      Array.isArray(candidate.files) &&
      candidate.files.length > 0
  }) || null
}
