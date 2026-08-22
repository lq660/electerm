/**
 * tab title create rule
 */

const e = window.translate

function normalizeTitle (title) {
  // 2026-07-04 coder(lq): Upstream local terminal titles may stay in English; show a clear Chinese tab label in our workbench chrome.
  if (title === 'New terminal' || title === 'new terminal' || title === e('newTerminal')) {
    return '本地终端'
  }
  return title
}

function maskHost (hostOrIp = '') {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostOrIp)) {
    const arr = hostOrIp.split('.')
    return arr.slice(0, arr.length - 2).join('.') + '.*.*'
  } else {
    return hostOrIp.replace(/^.{3}/, '***')
  }
}

export default function createTitle (res, hide = true) {
  if (!res) {
    return ''
  }
  const {
    host, port, username, title, type, url,
    path, connectionHoppings, sshTunnels
  } = res
  const h = hide && window.store.config.hideIP ? maskHost(host) : host
  const fixTitle = `${username || ''}@${h}:${port}`
  const extra = host || path ? (path || fixTitle) : (url || '')
  let f = title
    ? `${normalizeTitle(title)}` + (extra ? ` - ${extra}` : '')
    : extra
  if (connectionHoppings && connectionHoppings.length) {
    f = `[⋙]${f}`
  }
  if (
    sshTunnels &&
    sshTunnels.length &&
    sshTunnels[0].sshTunnel &&
    sshTunnels[0].sshTunnelRemoteHost
  ) {
    f = `[T]${f}`
  }
  if (type && type !== 'ssh') {
    f = `[${type}]${f}`
  }
  return f || '本地终端'
}

export function createHeaderTitle (res) {
  if (!res) {
    return ''
  }
  const { title, host, path, url } = res
  // 2026-07-29 coder(lq): Keep the top workbench tab focused on the user-defined resource name; full account/host details stay in the tooltip.
  return normalizeTitle(title) || path || host || url || '本地终端'
}

export function createTitleTag (obj) {
  const { color } = obj
  if (!color) {
    return null
  }
  const styleTag = color
    ? { color }
    : {}
  return (
    <span style={styleTag} className='tab-title-tag'>●</span>
  )
}

export function createTitleWithTag (obj) {
  return (
    <span className='tab-title'>
      {createTitleTag(obj)} {createTitle(obj)}
    </span>
  )
}
