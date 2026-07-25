/**
 * Export/import portable user configuration packages.
 */

const fs = require('fs').promises
const {
  basename,
  dirname,
  extname,
  resolve
} = require('path')
const os = require('os')
const { dialog } = require('electron')
const crypto = require('crypto')
const { dbAction, tables } = require('./db')
const {
  appPath,
  defaultUserName,
  packInfo
} = require('../common/app-props')

const PACKAGE_TYPE = 'yunduo-config-migration'
const PACKAGE_VERSION = 2
const LEGACY_PACKAGE_VERSION = 1
const MIGRATION_CIPHER = 'aes-256-gcm'
const MIGRATION_KDF = 'scrypt'
const MIGRATION_KEY_LENGTH = 32
const MIGRATION_KEY_FILE_MAX_SIZE = 256 * 1024
const MIGRATION_KEY_DIR = 'migration-keys'

const EXCLUDED_TABLES = new Set([
  'log',
  'dbUpgradeLog',
  'lastStates'
])

const EXTERNAL_KEY_PATH_FIELDS = new Set([
  'privateKeyPath'
])

const EXTERNAL_KEY_AGENT_FIELDS = new Set([
  'sshAgent'
])

function getMigrationTables () {
  return tables.filter(table => !EXCLUDED_TABLES.has(table))
}

function formatDatePart (value) {
  return String(value).padStart(2, '0')
}

function getDefaultFileName () {
  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    formatDatePart(now.getMonth() + 1),
    formatDatePart(now.getDate())
  ].join('-') + '-' + [
    formatDatePart(now.getHours()),
    formatDatePart(now.getMinutes()),
    formatDatePart(now.getSeconds())
  ].join('-')
  return `${timestamp}-yunduo-config-migration.ydmig`
}

async function readTables (names = getMigrationTables()) {
  const result = {}
  for (const name of names) {
    result[name] = await dbAction(name, 'find', {})
  }
  return result
}

function createSummary (tableData) {
  return Object.keys(tableData).reduce((summary, name) => {
    summary[name] = Array.isArray(tableData[name]) ? tableData[name].length : 0
    return summary
  }, {})
}

function getUserDataPath () {
  const appDataPath = process.env.DATA_PATH || resolve(appPath, 'electerm')
  return resolve(appDataPath, 'users', defaultUserName)
}

function getMigrationKeysPath () {
  return resolve(getUserDataPath(), MIGRATION_KEY_DIR)
}

function resolveExternalKeyPath (filePath) {
  if (typeof filePath !== 'string') {
    return ''
  }
  if (filePath === '~') {
    return os.homedir()
  }
  if (filePath.startsWith('~/')) {
    return resolve(os.homedir(), filePath.slice(2))
  }
  return resolve(filePath)
}

function collectExternalKeyRefs (tableData) {
  const externalKeyPaths = new Map()
  let sshAgentRefs = 0
  const walk = (value) => {
    if (!value || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    for (const [key, item] of Object.entries(value)) {
      if (EXTERNAL_KEY_PATH_FIELDS.has(key) && item) {
        const sourcePath = String(item)
        const filePath = resolveExternalKeyPath(sourcePath)
        const ref = externalKeyPaths.get(filePath) || {
          filePath,
          sourcePaths: new Set()
        }
        ref.sourcePaths.add(sourcePath)
        externalKeyPaths.set(filePath, ref)
      } else if (EXTERNAL_KEY_AGENT_FIELDS.has(key) && item) {
        sshAgentRefs += 1
      }
      walk(item)
    }
  }
  walk(tableData)
  return {
    externalKeyPaths: Array.from(externalKeyPaths.values()).map(item => ({
      filePath: item.filePath,
      sourcePaths: Array.from(item.sourcePaths)
    })),
    sshAgentRefs
  }
}

function createMigrationWarnings (keyRefs, options, externalKeyFiles, skippedExternalKeyFiles) {
  const warnings = []
  const externalKeyRefCount = keyRefs.externalKeyPaths.length
  if (externalKeyRefCount && !options.includeExternalKeys) {
    warnings.push('检测到连接引用了本机外部密钥路径。迁移包未包含这些密钥文件；如需一键迁移，请重新导出并勾选“包含连接引用的本地密钥文件”。')
  }
  if (externalKeyFiles.length) {
    warnings.push(`已将 ${externalKeyFiles.length} 个连接引用的本地密钥文件放入加密迁移包。`)
  }
  if (skippedExternalKeyFiles) {
    warnings.push(`${skippedExternalKeyFiles} 个连接引用的本地密钥文件无法读取或超过大小限制，未放入迁移包。`)
  }
  if (keyRefs.sshAgentRefs) {
    warnings.push('检测到连接使用 SSH Agent。SSH Agent 状态无法写入迁移包，请在新机器上重新配置 SSH Agent。')
  }
  return warnings
}

function hashBuffer (buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function cleanFileName (fileName) {
  const cleaned = basename(fileName || 'ssh-key')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+$/, 'ssh-key')
  return cleaned || 'ssh-key'
}

async function readExternalKeyFiles (keyRefs) {
  const externalKeyFiles = []
  let skipped = 0
  for (const ref of keyRefs.externalKeyPaths) {
    try {
      const stat = await fs.stat(ref.filePath)
      if (!stat.isFile() || stat.size > MIGRATION_KEY_FILE_MAX_SIZE) {
        skipped += 1
        continue
      }
      const content = await fs.readFile(ref.filePath)
      externalKeyFiles.push({
        id: crypto
          .createHash('sha256')
          .update(ref.filePath)
          .update('\0')
          .update(content)
          .digest('hex')
          .slice(0, 16),
        fileName: cleanFileName(ref.filePath),
        sourcePaths: ref.sourcePaths,
        size: content.length,
        sha256: hashBuffer(content),
        content: content.toString('base64')
      })
    } catch (e) {
      skipped += 1
    }
  }
  return {
    externalKeyFiles,
    skipped
  }
}

async function writeJsonAtomic (filePath, data) {
  const tempPath = `${filePath}.tmp`
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2))
  await fs.rename(tempPath, filePath)
}

function assertPassword (password) {
  if (!password || typeof password !== 'string') {
    throw new Error('请设置迁移包密码')
  }
}

function deriveMigrationKey (password, salt) {
  return crypto.scryptSync(password, salt, MIGRATION_KEY_LENGTH)
}

function encryptMigrationPayload (payload, password) {
  assertPassword(password)
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = deriveMigrationKey(password, salt)
  const cipher = crypto.createCipheriv(MIGRATION_CIPHER, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final()
  ])
  return {
    crypto: {
      name: MIGRATION_CIPHER,
      kdf: MIGRATION_KDF,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64')
    },
    payload: encrypted.toString('base64')
  }
}

function decryptMigrationPayload (data, password) {
  assertPassword(password)
  const info = data.crypto || {}
  if (info.name !== MIGRATION_CIPHER || info.kdf !== MIGRATION_KDF) {
    throw new Error('迁移包加密格式不受支持')
  }
  try {
    const salt = Buffer.from(info.salt, 'base64')
    const iv = Buffer.from(info.iv, 'base64')
    const tag = Buffer.from(info.tag, 'base64')
    const encrypted = Buffer.from(data.payload, 'base64')
    const key = deriveMigrationKey(password, salt)
    const decipher = crypto.createDecipheriv(MIGRATION_CIPHER, key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])
    return JSON.parse(decrypted.toString('utf8'))
  } catch (e) {
    throw new Error('迁移包密码不正确或文件已损坏')
  }
}

async function buildMigrationPackage (password, options = {}) {
  const tableData = await readTables()
  const keyRefs = collectExternalKeyRefs(tableData)
  const {
    externalKeyFiles,
    skipped
  } = options.includeExternalKeys
    ? await readExternalKeyFiles(keyRefs)
    : {
        externalKeyFiles: [],
        skipped: 0
      }
  const summary = createSummary(tableData)
  const warnings = createMigrationWarnings(
    keyRefs,
    options,
    externalKeyFiles,
    skipped
  )
  const payload = {
    tables: tableData
  }
  if (externalKeyFiles.length) {
    payload.externalKeyFiles = externalKeyFiles
  }
  const encrypted = encryptMigrationPayload({
    ...payload
  }, password)
  return {
    type: PACKAGE_TYPE,
    version: PACKAGE_VERSION,
    encrypted: true,
    app: {
      name: packInfo.productName || packInfo.name,
      version: packInfo.version
    },
    exportedAt: new Date().toISOString(),
    summary,
    warnings,
    ...encrypted
  }
}

async function exportConfigMigration (win, password, options = {}) {
  assertPassword(password)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出配置迁移包',
    defaultPath: getDefaultFileName(),
    filters: [
      { name: '云舵配置迁移包', extensions: ['ydmig'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  })
  if (canceled || !filePath) {
    return {
      canceled: true
    }
  }
  const data = await buildMigrationPackage(password, options)
  await writeJsonAtomic(filePath, data)
  return {
    canceled: false,
    filePath,
    summary: data.summary,
    warnings: data.warnings
  }
}

function normalizeDoc (doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('迁移包包含无效记录')
  }
  const id = doc._id || doc.id
  if (!id) {
    throw new Error('迁移包包含缺少 ID 的记录')
  }
  return {
    ...doc,
    _id: String(id)
  }
}

function normalizeTables (inputTables) {
  const allowed = new Set(getMigrationTables())
  const tableData = {}
  for (const [name, records] of Object.entries(inputTables || {})) {
    if (!allowed.has(name)) {
      continue
    }
    if (!Array.isArray(records)) {
      throw new Error(`迁移包中的 ${name} 数据格式不正确`)
    }
    tableData[name] = records.map(normalizeDoc)
  }
  if (!Object.keys(tableData).length) {
    throw new Error('迁移包没有可导入的配置数据')
  }
  return tableData
}

function parseMigrationPackage (text, password) {
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error('迁移包不是有效的 JSON 文件')
  }
  if (!data || data.type !== PACKAGE_TYPE) {
    throw new Error('请选择有效的云舵配置迁移包')
  }
  if (data.version === LEGACY_PACKAGE_VERSION) {
    const tableData = normalizeTables(data.tables)
    return {
      ...data,
      tables: tableData,
      summary: createSummary(tableData),
      warnings: [
        '这是旧版明文迁移包，文件中可能包含密码、令牌和私钥内容。导入后建议删除或转存为新版加密迁移包。'
      ]
    }
  }
  if (data.version !== PACKAGE_VERSION || data.encrypted !== true) {
    throw new Error('请选择有效的云舵配置迁移包')
  }
  const payload = decryptMigrationPayload(data, password)
  const tableData = normalizeTables(payload.tables)
  return {
    ...data,
    tables: tableData,
    externalKeyFiles: Array.isArray(payload.externalKeyFiles)
      ? payload.externalKeyFiles
      : [],
    summary: createSummary(tableData),
    warnings: Array.isArray(data.warnings) ? data.warnings : []
  }
}

function getRestoredKeyFileName (file) {
  const sourceName = cleanFileName(file.fileName)
  const ext = extname(sourceName)
  const base = ext
    ? sourceName.slice(0, -ext.length)
    : sourceName
  const id = String(file.id || file.sha256 || hashBuffer(Buffer.from(sourceName))).slice(0, 16)
  return `${base}-${id}${ext}`
}

function assertInsideDir (dir, filePath) {
  const rel = resolve(filePath).slice(resolve(dir).length)
  if (!rel || (rel[0] !== '/' && rel[0] !== '\\')) {
    throw new Error('迁移包密钥文件路径不安全')
  }
}

async function restoreExternalKeyFiles (externalKeyFiles = []) {
  if (!Array.isArray(externalKeyFiles) || !externalKeyFiles.length) {
    return {
      pathMap: new Map(),
      warnings: []
    }
  }
  const dir = getMigrationKeysPath()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const pathMap = new Map()
  let restored = 0
  for (const file of externalKeyFiles) {
    if (!file || typeof file.content !== 'string') {
      throw new Error('迁移包包含无效密钥文件')
    }
    const content = Buffer.from(file.content, 'base64')
    if (content.length > MIGRATION_KEY_FILE_MAX_SIZE) {
      throw new Error('迁移包中的密钥文件超过大小限制')
    }
    if (file.sha256 && hashBuffer(content) !== file.sha256) {
      throw new Error('迁移包中的密钥文件校验失败')
    }
    const targetPath = resolve(dir, getRestoredKeyFileName(file))
    assertInsideDir(dir, targetPath)
    await fs.writeFile(targetPath, content, { mode: 0o600 })
    await fs.chmod(targetPath, 0o600).catch(() => {})
    for (const sourcePath of file.sourcePaths || []) {
      pathMap.set(sourcePath, targetPath)
    }
    restored += 1
  }
  return {
    pathMap,
    warnings: restored
      ? [`已恢复 ${restored} 个迁移包内的本地密钥文件，并更新对应连接引用。`]
      : []
  }
}

function rewriteExternalKeyPaths (value, pathMap) {
  if (!value || typeof value !== 'object') {
    return
  }
  if (Array.isArray(value)) {
    value.forEach(item => rewriteExternalKeyPaths(item, pathMap))
    return
  }
  for (const [key, item] of Object.entries(value)) {
    if (EXTERNAL_KEY_PATH_FIELDS.has(key) && pathMap.has(item)) {
      value[key] = pathMap.get(item)
      continue
    }
    rewriteExternalKeyPaths(item, pathMap)
  }
}

async function removeTableRows (name) {
  const rows = await dbAction(name, 'find', {})
  for (const row of rows) {
    await dbAction(name, 'remove', { _id: row._id }, { force: true })
  }
}

async function upsertTableRows (name, records) {
  for (const record of records) {
    await dbAction(name, 'update', { _id: record._id }, record, {
      upsert: true,
      force: true
    })
  }
}

async function restoreTables (backup) {
  for (const [name, records] of Object.entries(backup)) {
    await removeTableRows(name)
    await upsertTableRows(name, records)
  }
}

async function importConfigMigration (filePath, password) {
  if (!filePath) {
    throw new Error('请选择要导入的迁移包')
  }
  const text = await fs.readFile(filePath, 'utf8')
  const data = parseMigrationPackage(text, password)
  const restoredKeys = await restoreExternalKeyFiles(data.externalKeyFiles)
  rewriteExternalKeyPaths(data.tables, restoredKeys.pathMap)
  const names = Object.keys(data.tables)
  const backup = await readTables(names)
  try {
    for (const name of names) {
      await removeTableRows(name)
      await upsertTableRows(name, data.tables[name])
    }
  } catch (e) {
    await restoreTables(backup).catch(err => {
      console.error('Failed to restore config after import error:', err)
    })
    throw e
  }
  return {
    filePath,
    app: data.app,
    exportedAt: data.exportedAt,
    summary: data.summary,
    warnings: [
      ...data.warnings,
      ...restoredKeys.warnings
    ]
  }
}

module.exports = {
  exportConfigMigration,
  importConfigMigration,
  buildMigrationPackage,
  parseMigrationPackage,
  encryptMigrationPayload,
  decryptMigrationPayload
}
