const SOURCE_LABELS = {
  electerm: '云舵 / electerm',
  xshell: 'Xshell',
  finalshell: 'FinalShell',
  openssh: 'OpenSSH'
}

const HOST_KEYS = ['host', 'hostname', 'host_name', 'server', 'server_host', 'address', 'ip']
const TITLE_KEYS = ['name', 'title', 'session_name', 'label', 'alias', 'description']
const USER_KEYS = ['user_name', 'username', 'user', 'login_name', 'login']
const GROUP_KEYS = ['group_name', 'groupName', 'group', 'folder_name', 'folderName', 'category']

function cleanText (value) {
  if (value === undefined || value === null) {
    return ''
  }
  return String(value).trim().replace(/^['"]|['"]$/g, '')
}

function getValue (object, keys) {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) {
      return object[key]
    }
    const foundKey = Object.keys(object).find(item => item.toLowerCase() === key.toLowerCase())
    if (foundKey) {
      return object[foundKey]
    }
  }
  return undefined
}

function normalizePort (value, fallback = 22) {
  const port = Number.parseInt(value, 10)
  return Number.isInteger(port) && port > 0 && port <= 65535
    ? port
    : fallback
}

function makeConnection (data) {
  const host = cleanText(data.host)
  const title = cleanText(data.title) || host
  return {
    sourceId: cleanText(data.sourceId) || `${title}:${host}:${data.port}:${data.username}`,
    title,
    host,
    port: normalizePort(data.port, data.type === 'telnet' ? 23 : 22),
    username: cleanText(data.username),
    password: cleanText(data.password),
    type: data.type || 'ssh',
    authType: data.authType || 'password',
    privateKeyPath: cleanText(data.privateKeyPath),
    groupName: cleanText(data.groupName),
    warnings: [...(data.warnings || [])],
    rawBookmark: data.rawBookmark
  }
}

function buildResult (source, connections, groups = [], warnings = []) {
  const validConnections = connections.filter(item => item.host)
  if (!validConnections.length) {
    throw new Error('未识别到可导入的连接，请确认文件格式和内容。')
  }
  return {
    source,
    sourceLabel: SOURCE_LABELS[source],
    connections: validConnections,
    groups,
    warnings
  }
}

function parseJson (text) {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new Error('文件不是有效的 JSON、Xshell 会话或 OpenSSH 配置。')
  }
}

function normalizeElectermGroup (group, allGroups) {
  const parent = allGroups.find(item => (item.bookmarkGroupIds || []).includes(group.id))
  return {
    sourceId: cleanText(group.id),
    title: cleanText(group.title) || '导入分组',
    color: cleanText(group.color) || '#1677ff',
    parentSourceId: cleanText(parent?.id),
    connectionSourceIds: [...(group.bookmarkIds || [])].map(cleanText)
  }
}

function parseElecterm (content, fileName) {
  const isElectermArray = Array.isArray(content) && content.every(bookmark =>
    !bookmark || typeof bookmark !== 'object' ||
    ['type', 'term', 'authType', 'enableSftp', 'sshTunnels', 'runScripts']
      .some(key => bookmark[key] !== undefined)
  )
  const bookmarks = isElectermArray
    ? content
    : (content && typeof content === 'object' ? content.bookmarks : undefined)
  if (!Array.isArray(bookmarks)) {
    return null
  }
  const sourceGroups = content && !Array.isArray(content) && Array.isArray(content.bookmarkGroups)
    ? content.bookmarkGroups
    : []
  const fallbackGroup = {
    sourceId: 'electerm-import',
    title: cleanText(fileName).replace(/\.[^.]+$/, '') || '导入连接',
    color: '#1677ff',
    parentSourceId: '',
    connectionSourceIds: bookmarks.map((item, index) => cleanText(item?.id) || `bookmark-${index}`)
  }
  const groups = sourceGroups.length
    ? sourceGroups.map(group => normalizeElectermGroup(group, sourceGroups))
    : [fallbackGroup]
  const connections = bookmarks.map((bookmark, index) => {
    if (!bookmark || typeof bookmark !== 'object') {
      return makeConnection({})
    }
    const sourceId = cleanText(bookmark.id) || `bookmark-${index}`
    const assignedGroup = groups.find(group => group.connectionSourceIds.includes(sourceId))
    return makeConnection({
      sourceId,
      title: bookmark.title,
      host: bookmark.host,
      port: bookmark.port,
      username: bookmark.username,
      password: bookmark.password,
      type: bookmark.type,
      authType: bookmark.authType,
      privateKeyPath: bookmark.privateKeyPath,
      groupName: assignedGroup?.title,
      rawBookmark: { ...bookmark }
    })
  })
  return buildResult('electerm', connections, groups)
}

function parseIni (text) {
  const sections = { root: {} }
  let current = sections.root
  text.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) {
      return
    }
    const sectionMatch = line.match(/^\[([^\]]+)]$/)
    if (sectionMatch) {
      const sectionName = sectionMatch[1].toLowerCase()
      sections[sectionName] = sections[sectionName] || {}
      current = sections[sectionName]
      return
    }
    const separator = line.indexOf('=')
    if (separator < 1) {
      return
    }
    current[line.slice(0, separator).trim().toLowerCase()] = cleanText(line.slice(separator + 1))
  })
  return sections
}

function findIniValue (sections, key) {
  const normalizedKey = key.toLowerCase()
  for (const section of Object.values(sections)) {
    if (section[normalizedKey] !== undefined) {
      return section[normalizedKey]
    }
  }
  return ''
}

function parseXshell (text, fileName) {
  if (!/^\s*\[(?:CONNECTION|SessionInfo)/im.test(text)) {
    return null
  }
  const sections = parseIni(text)
  const host = findIniValue(sections, 'Host')
  if (!host) {
    return null
  }
  const protocol = findIniValue(sections, 'Protocol').toLowerCase()
  const isTelnet = protocol === 'telnet'
  const encryptedPassword = findIniValue(sections, 'Password')
  const title = cleanText(fileName).replace(/\.xsh$/i, '') || host
  const warnings = encryptedPassword ? ['原软件的加密密码无法安全迁移，请重新填写密码。'] : []
  const connection = makeConnection({
    sourceId: title,
    title,
    host,
    port: findIniValue(sections, 'Port'),
    username: findIniValue(sections, 'UserName'),
    type: isTelnet ? 'telnet' : 'ssh',
    groupName: 'Xshell 导入',
    warnings
  })
  return buildResult('xshell', [connection], [{
    sourceId: 'xshell-import',
    title: 'Xshell 导入',
    color: '#1677ff',
    parentSourceId: '',
    connectionSourceIds: [connection.sourceId]
  }])
}

function isFinalShellConnection (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const host = cleanText(getValue(value, HOST_KEYS))
  if (!host) {
    return false
  }
  return getValue(value, ['port', ...USER_KEYS, ...TITLE_KEYS, 'authentication_type', 'connect_type']) !== undefined
}

function collectFinalShellConnections (value, result, inheritedGroup = '', visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return
  }
  visited.add(value)
  if (isFinalShellConnection(value)) {
    result.push({ value, inheritedGroup })
    return
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectFinalShellConnections(item, result, inheritedGroup, visited))
    return
  }
  const nextGroup = cleanText(getValue(value, GROUP_KEYS)) ||
    (Array.isArray(value.children) ? cleanText(getValue(value, TITLE_KEYS)) : '') ||
    inheritedGroup
  Object.values(value).forEach(item => collectFinalShellConnections(item, result, nextGroup, visited))
}

function parseFinalShell (content) {
  const found = []
  collectFinalShellConnections(content, found)
  if (!found.length) {
    return null
  }
  const connections = found.map(({ value, inheritedGroup }, index) => {
    const host = cleanText(getValue(value, HOST_KEYS))
    const title = cleanText(getValue(value, TITLE_KEYS)) || host
    const groupName = cleanText(getValue(value, GROUP_KEYS)) || inheritedGroup || 'FinalShell 导入'
    const storedPassword = cleanText(getValue(value, ['password', 'passwd', 'pwd']))
    const privateKeyPath = cleanText(getValue(value, ['private_key_path', 'privateKeyPath', 'key_path']))
    const warnings = []
    if (storedPassword) {
      // 2026-07-12 coder(lq): FinalShell credentials are treated as opaque encrypted data; importing them as plaintext would silently break login.
      warnings.push('原软件的加密密码无法安全迁移，请重新填写密码。')
    }
    return makeConnection({
      sourceId: getValue(value, ['id', 'uuid']) || `finalshell-${index}`,
      title,
      host,
      port: getValue(value, ['port', 'server_port']),
      username: getValue(value, USER_KEYS),
      privateKeyPath,
      authType: privateKeyPath ? 'privateKey' : 'password',
      groupName,
      warnings
    })
  })
  const groups = [...new Set(connections.map(item => item.groupName).filter(Boolean))].map((title, index) => ({
    sourceId: `finalshell-group-${index}`,
    title,
    color: '#1677ff',
    parentSourceId: '',
    connectionSourceIds: connections.filter(item => item.groupName === title).map(item => item.sourceId)
  }))
  return buildResult('finalshell', connections, groups)
}

function parseOpenSsh (text) {
  if (!/^\s*Host\s+\S+/im.test(text)) {
    return null
  }
  const blocks = []
  let current = null
  text.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) {
      return
    }
    const match = line.match(/^(\S+)\s*[=\s]\s*(.+)$/)
    if (!match) {
      return
    }
    const key = match[1].toLowerCase()
    const value = cleanText(match[2])
    if (key === 'host') {
      current = { aliases: value.split(/\s+/), values: {} }
      blocks.push(current)
    } else if (current) {
      current.values[key] = value
    }
  })
  const connections = []
  blocks.forEach(block => {
    block.aliases.filter(alias => !/[*!?]/.test(alias)).forEach(alias => {
      const privateKeyPath = block.values.identityfile || ''
      connections.push(makeConnection({
        sourceId: alias,
        title: alias,
        host: block.values.hostname || alias,
        port: block.values.port,
        username: block.values.user,
        privateKeyPath,
        authType: privateKeyPath ? 'privateKey' : 'password',
        groupName: 'OpenSSH 导入'
      }))
    })
  })
  if (!connections.length) {
    return null
  }
  return buildResult('openssh', connections, [{
    sourceId: 'openssh-import',
    title: 'OpenSSH 导入',
    color: '#1677ff',
    parentSourceId: '',
    connectionSourceIds: connections.map(item => item.sourceId)
  }], blocks.some(block => block.aliases.some(alias => /[*!?]/.test(alias)))
    ? ['已忽略包含通配符的 Host 配置。']
    : [])
}

export function mergeConnectionImportResults (preparedFiles) {
  if (!Array.isArray(preparedFiles) || !preparedFiles.length) {
    throw new Error('没有可合并的连接文件。')
  }
  const fileNames = []
  const sources = []
  const sourceLabels = []
  const connections = []
  const groups = []
  const warnings = []

  preparedFiles.forEach((prepared, fileIndex) => {
    const fileName = cleanText(prepared.fileName) || `file-${fileIndex + 1}`
    const result = prepared.result
    fileNames.push(fileName)
    sources.push(result.source)
    sourceLabels.push(result.sourceLabel)

    const connectionIds = new Map()
    result.connections.forEach((connection, connectionIndex) => {
      const originalId = cleanText(connection.sourceId) || `connection-${connectionIndex}`
      const sourceId = `batch-${fileIndex}:connection-${connectionIndex}:${originalId}`
      const mappedIds = connectionIds.get(originalId) || []
      mappedIds.push(sourceId)
      connectionIds.set(originalId, mappedIds)
      connections.push({
        ...connection,
        sourceId,
        sourceFileName: fileName,
        sourceLabel: result.sourceLabel
      })
    })

    const groupIds = new Map()
    ;(result.groups || []).forEach((group, groupIndex) => {
      const originalId = cleanText(group.sourceId) || `group-${groupIndex}`
      groupIds.set(originalId, `batch-${fileIndex}:group-${groupIndex}:${originalId}`)
    })
    ;(result.groups || []).forEach((group, groupIndex) => {
      const originalId = cleanText(group.sourceId) || `group-${groupIndex}`
      groups.push({
        ...group,
        sourceId: groupIds.get(originalId),
        parentSourceId: group.parentSourceId
          ? groupIds.get(cleanText(group.parentSourceId)) || ''
          : '',
        connectionSourceIds: (group.connectionSourceIds || [])
          .flatMap(sourceId => connectionIds.get(cleanText(sourceId)) || [])
      })
    })
    warnings.push(...(result.warnings || []).map(warning => `${fileName}：${warning}`))
  })

  const uniqueSources = [...new Set(sources)]
  const uniqueSourceLabels = [...new Set(sourceLabels)]
  // 2026-07-14 coder(lq): Namespace imported IDs per file so multi-file exports cannot corrupt each other's group references.
  return {
    fileName: fileNames.join(', '),
    fileNames,
    result: {
      source: uniqueSources.length === 1 ? uniqueSources[0] : 'multiple',
      sourceLabel: uniqueSourceLabels.join(' / '),
      connections,
      groups,
      warnings
    }
  }
}

export function decodeConnectionImportContent (bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (data[0] === 0xFF && data[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(data.subarray(2))
  }
  if (data[0] === 0xFE && data[1] === 0xFF) {
    const swapped = new Uint8Array(data.length - 2)
    for (let index = 2; index + 1 < data.length; index += 2) {
      swapped[index - 2] = data[index + 1]
      swapped[index - 1] = data[index]
    }
    return new TextDecoder('utf-16le').decode(swapped)
  }
  return new TextDecoder('utf-8').decode(data).replace(/^\uFEFF/, '')
}

export function parseConnectionImport (text, fileName = '') {
  const normalizedText = cleanText(text).replace(/\0/g, '')
  if (!normalizedText) {
    throw new Error('文件内容为空。')
  }
  const xShellResult = parseXshell(normalizedText, fileName)
  if (xShellResult) {
    return xShellResult
  }
  const openSshResult = parseOpenSsh(normalizedText)
  if (openSshResult) {
    return openSshResult
  }
  const content = parseJson(normalizedText)
  const electermResult = parseElecterm(content, fileName)
  if (electermResult) {
    return electermResult
  }
  const finalShellResult = parseFinalShell(content)
  if (finalShellResult) {
    return finalShellResult
  }
  throw new Error('暂不支持此文件格式，或文件中没有有效连接。')
}

export const connectionImportSourceLabels = SOURCE_LABELS
