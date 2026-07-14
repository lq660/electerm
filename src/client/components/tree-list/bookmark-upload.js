/**
 * Connection resource import and persistence.
 */

import copy from 'json-deep-copy'
import { action } from 'manate'
import uid from '../../common/uid'
import delay from '../../common/wait'
import { fixBookmarks } from '../../common/db-fix'
import {
  decodeConnectionImportContent,
  mergeConnectionImportResults,
  parseConnectionImport
} from '../../common/connection-import-parser.mjs'

export const preserveSourceGroupsValue = '__preserve_source_groups__'

function getFileName (file) {
  const path = file.fileName || file.name || file.filePath || file.path || ''
  return path.split(/[\\/]/).pop()
}

function decodeBase64 (value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return decodeConnectionImportContent(bytes)
}

export async function prepareConnectionImport (file) {
  let text
  if (file.fileContent !== undefined) {
    text = typeof file.fileContent === 'string'
      ? file.fileContent
      : decodeConnectionImportContent(file.fileContent)
  } else {
    const content = await window.fs.readFileAsBase64(file.filePath)
    text = decodeBase64(content)
  }
  const fileName = getFileName(file)
  return {
    fileName,
    result: parseConnectionImport(text, fileName)
  }
}

export async function prepareConnectionImports (files) {
  const fileList = (Array.isArray(files) ? files : [files]).filter(Boolean)
  if (!fileList.length) {
    throw new Error('请选择至少一个连接文件。')
  }
  const settled = await Promise.allSettled(
    fileList.map(file => prepareConnectionImport(file))
  )
  const preparedFiles = []
  const failures = []
  settled.forEach((item, index) => {
    if (item.status === 'fulfilled') {
      preparedFiles.push(item.value)
      return
    }
    failures.push({
      fileName: getFileName(fileList[index]),
      message: item.reason?.message || '无法解析文件'
    })
  })
  if (!preparedFiles.length) {
    throw new Error(failures.map(item => `${item.fileName}：${item.message}`).join('；'))
  }
  // 2026-07-14 coder(lq): Keep valid files in the same batch when another selected file is malformed.
  return {
    ...mergeConnectionImportResults(preparedFiles),
    failures
  }
}

export function getConnectionIdentity (connection) {
  const type = connection.type || 'ssh'
  const host = String(connection.host || '').trim().toLowerCase()
  const port = Number.parseInt(connection.port, 10) || (type === 'telnet' ? 23 : 22)
  const username = String(connection.username || '').trim().toLowerCase()
  return `${type}|${host}|${port}|${username}`
}

function makeUniqueTitle (title, bookmarks) {
  const used = new Set(bookmarks.map(item => String(item.title || '').toLowerCase()))
  if (!used.has(title.toLowerCase())) {
    return title
  }
  let sequence = 2
  let candidate = `${title}（导入）`
  while (used.has(candidate.toLowerCase())) {
    candidate = `${title}（导入 ${sequence}）`
    sequence++
  }
  return candidate
}

function toBookmark (connection) {
  const bookmark = connection.rawBookmark
    ? copy(connection.rawBookmark)
    : {}
  Object.assign(bookmark, {
    id: uid(),
    title: connection.title,
    host: connection.host,
    port: connection.port,
    type: connection.type || 'ssh',
    authType: connection.authType || 'password'
  })
  if (connection.username) {
    bookmark.username = connection.username
  }
  if (connection.password) {
    bookmark.password = connection.password
  } else if (!connection.rawBookmark) {
    delete bookmark.password
  }
  if (connection.privateKeyPath) {
    bookmark.privateKeyPath = connection.privateKeyPath
  }
  bookmark.term = bookmark.term || 'xterm-256color'
  bookmark.color = bookmark.color || '#1677ff'
  if (bookmark.type === 'ssh' && bookmark.enableSftp === undefined) {
    bookmark.enableSftp = true
  }
  return fixBookmarks([bookmark])[0]
}

function collectIncludedGroups (groups, bookmarkIdBySourceId) {
  const included = new Set(
    groups
      .filter(group => group.connectionSourceIds.some(id => bookmarkIdBySourceId.has(id)))
      .map(group => group.sourceId)
  )
  let changed = true
  while (changed) {
    changed = false
    groups.forEach(group => {
      if (included.has(group.sourceId) && group.parentSourceId && !included.has(group.parentSourceId)) {
        included.add(group.parentSourceId)
        changed = true
      }
    })
  }
  return included
}

function mergeImportedGroups (store, groups, bookmarkIdBySourceId) {
  const included = collectIncludedGroups(groups, bookmarkIdBySourceId)
  const groupIdBySourceId = new Map()

  groups.filter(group => included.has(group.sourceId)).forEach(group => {
    const existing = store.bookmarkGroups.find(item =>
      String(item.title || '').trim() === group.title &&
      !groupIdBySourceId.has(group.sourceId)
    )
    const target = existing || {
      id: uid(),
      title: group.title,
      color: group.color || '#1677ff',
      bookmarkIds: [],
      bookmarkGroupIds: []
    }
    if (!existing) {
      store.bookmarkGroups.push(target)
    }
    const importedBookmarkIds = group.connectionSourceIds
      .map(sourceId => bookmarkIdBySourceId.get(sourceId))
      .filter(Boolean)
    target.bookmarkIds = [...new Set([...(target.bookmarkIds || []), ...importedBookmarkIds])]
    groupIdBySourceId.set(group.sourceId, target.id)
  })

  groups.filter(group => included.has(group.sourceId) && group.parentSourceId).forEach(group => {
    const parentId = groupIdBySourceId.get(group.parentSourceId)
    const childId = groupIdBySourceId.get(group.sourceId)
    const parent = store.bookmarkGroups.find(item => item.id === parentId)
    const child = store.bookmarkGroups.find(item => item.id === childId)
    if (!parent || !child || parent.id === child.id) {
      return
    }
    parent.bookmarkGroupIds = [...new Set([...(parent.bookmarkGroupIds || []), child.id])]
    child.level = 2
  })
}

export const applyConnectionImport = action(function ({
  result,
  selectedIndexes,
  conflictStrategy = 'skip',
  targetGroupId = preserveSourceGroupsValue
}) {
  const { store } = window
  const selected = new Set(selectedIndexes)
  const bookmarkIdBySourceId = new Map()
  const importedBookmarkIds = new Set()
  const useSourceGroups = targetGroupId === preserveSourceGroupsValue
  const targetGroup = useSourceGroups
    ? null
    : store.bookmarkGroups.find(group => group.id === targetGroupId)
  if (!useSourceGroups && !targetGroup) {
    throw new Error('选择的目标分组不存在，请重新选择。')
  }
  let added = 0
  let updated = 0
  let skipped = 0

  result.connections.forEach((connection, index) => {
    if (!selected.has(index)) {
      return
    }
    const bookmark = toBookmark(connection)
    const identity = getConnectionIdentity(bookmark)
    const conflict = store.bookmarks.find(item => getConnectionIdentity(item) === identity)
    if (conflict && conflictStrategy === 'skip') {
      skipped++
      return
    }
    if (conflict && conflictStrategy === 'overwrite') {
      const preservedId = conflict.id
      Object.assign(conflict, bookmark, { id: preservedId })
      bookmarkIdBySourceId.set(connection.sourceId, preservedId)
      importedBookmarkIds.add(preservedId)
      updated++
      return
    }
    if (conflict && conflictStrategy === 'rename') {
      bookmark.title = makeUniqueTitle(bookmark.title, store.bookmarks)
    }
    store.bookmarks.push(bookmark)
    bookmarkIdBySourceId.set(connection.sourceId, bookmark.id)
    importedBookmarkIds.add(bookmark.id)
    added++
  })

  if (targetGroup) {
    // 2026-07-14 coder(lq): A chosen target group overrides source grouping only for connections actually added or overwritten in this batch.
    store.bookmarkGroups.forEach(group => {
      group.bookmarkIds = (group.bookmarkIds || [])
        .filter(id => !importedBookmarkIds.has(id))
    })
    targetGroup.bookmarkIds = [
      ...(targetGroup.bookmarkIds || []),
      ...importedBookmarkIds
    ]
  } else {
    // 2026-07-12 coder(lq): Rebuild group references only after conflict resolution so skipped rows never leave dangling resource IDs.
    mergeImportedGroups(store, result.groups || [], bookmarkIdBySourceId)
  }
  store.fixBookmarkGroups()
  return { added, updated, skipped }
})

export async function importSelectedConnections (options) {
  const watcherNames = ['bookmarks', 'bookmarkGroups']
  watcherNames.forEach(name => window[`watch${name}`]?.stop())
  try {
    const summary = applyConnectionImport(options)
    await delay(100)
    return summary
  } finally {
    watcherNames.forEach(name => window[`watch${name}`]?.start())
  }
}

// Kept for callers that import a native electerm backup without showing their own preview.
export async function bookmarkUpload (file) {
  const prepared = await prepareConnectionImport(file)
  return importSelectedConnections({
    result: prepared.result,
    selectedIndexes: prepared.result.connections.map((item, index) => index),
    conflictStrategy: 'skip'
  })
}

export async function beforeBookmarkUpload (file) {
  return bookmarkUpload(file)
}
