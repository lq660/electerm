export function shouldReconnectOnEnter ({
  event,
  isSsh,
  isDisconnected,
  isLoading,
  isPending
}) {
  if (!event || event.type !== 'keydown' || event.key !== 'Enter') {
    return false
  }
  if (event.isComposing || event.repeat) {
    return false
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false
  }
  return isSsh && isDisconnected && !isLoading && !isPending
}
