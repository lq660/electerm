const remoteType = 'remote'

// 2026-09-02 coder(lq): Keep clipboard endpoint routing pure so cross-terminal transfers can be regression-tested without mounting the SFTP UI.
export function isCrossTerminalRemoteTransfer (transfer, targetTab) {
  return transfer?.typeFrom === remoteType &&
    transfer?.typeTo === remoteType &&
    transfer?.fromFile?.tabId &&
    targetTab?.id &&
    transfer.fromFile.tabId !== targetTab.id
}

export function partitionClipboardTransfers (transfers = [], targetTab) {
  const remote = []
  const direct = []
  for (const transfer of transfers) {
    if (isCrossTerminalRemoteTransfer(transfer, targetTab)) {
      remote.push(transfer)
    } else {
      direct.push(transfer)
    }
  }
  return { remote, direct }
}
