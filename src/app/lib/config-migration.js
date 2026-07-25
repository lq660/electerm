/**
 * Export/import portable user configuration packages.
 */

const fs = require('fs').promises
const { dirname } = require('path')
const { dialog } = require('electron')
const crypto = require('crypto')
const { dbAction, tables } = require('./db')
const { packInfo } = require('../common/app-props')

const PACKAGE_TYPE = 'yunduo-config-migration'
const PACKAGE_VERSION = 2
const LEGACY_PACKAGE_VERSION = 1
const MIGRATION_CIPHER = 'aes-256-gcm'
const MIGRATION_KDF = 'scrypt'
const MIGRATION_KEY_LENGTH = 32

const EXCLUDED_TABLES = new Set([
  'log',
  'dbUpgradeLog',
  'lastStates'
])

const EXTERNAL_KEY_FIELDS = new Set([
  'privateKeyPath',
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

function createMigrationWarnings (tableData) {
  let externalKeyRefs = 0
  const walk = (value) => {
    if (!value || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    for (const [key, item] of Object.entries(value)) {
      if (EXTERNAL_KEY_FIELDS.has(key) && item) {
        externalKeyRefs += 1
      }
      walk(item)
    }
  }
  walk(tableData)
  const warnings = []
  if (externalKeyRefs) {
    warnings.push('检测到连接引用了本机外部密钥路径或 SSH Agent。迁移包不会自动包含这些外部密钥文件，请在新机器上放置同路径密钥、重新上传私钥到连接，或重新配置 SSH Agent。')
  }
  return warnings
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

async function buildMigrationPackage (password) {
  const tableData = await readTables()
  const summary = createSummary(tableData)
  const warnings = createMigrationWarnings(tableData)
  const encrypted = encryptMigrationPayload({
    tables: tableData
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

async function exportConfigMigration (win, password) {
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
  const data = await buildMigrationPackage(password)
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
    summary: createSummary(tableData),
    warnings: Array.isArray(data.warnings) ? data.warnings : []
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
    warnings: data.warnings
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
