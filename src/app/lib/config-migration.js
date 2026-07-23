/**
 * Export/import portable user configuration packages.
 */

const fs = require('fs').promises
const { dirname } = require('path')
const { dialog } = require('electron')
const { dbAction, tables } = require('./db')
const { packInfo } = require('../common/app-props')

const PACKAGE_TYPE = 'yunduo-config-migration'
const PACKAGE_VERSION = 1

const EXCLUDED_TABLES = new Set([
  'log',
  'dbUpgradeLog',
  'lastStates'
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
  return `${timestamp}-yunduo-config-migration.json`
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

async function writeJsonAtomic (filePath, data) {
  const tempPath = `${filePath}.tmp`
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2))
  await fs.rename(tempPath, filePath)
}

async function buildMigrationPackage () {
  const tableData = await readTables()
  return {
    type: PACKAGE_TYPE,
    version: PACKAGE_VERSION,
    app: {
      name: packInfo.productName || packInfo.name,
      version: packInfo.version
    },
    exportedAt: new Date().toISOString(),
    tables: tableData,
    summary: createSummary(tableData)
  }
}

async function exportConfigMigration (win) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出配置迁移包',
    defaultPath: getDefaultFileName(),
    filters: [
      { name: '云舵配置迁移包', extensions: ['json'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  })
  if (canceled || !filePath) {
    return {
      canceled: true
    }
  }
  const data = await buildMigrationPackage()
  await writeJsonAtomic(filePath, data)
  return {
    canceled: false,
    filePath,
    summary: data.summary
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

function parseMigrationPackage (text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error('迁移包不是有效的 JSON 文件')
  }
  if (!data || data.type !== PACKAGE_TYPE || data.version !== PACKAGE_VERSION) {
    throw new Error('请选择有效的云舵配置迁移包')
  }
  const allowed = new Set(getMigrationTables())
  const tableData = {}
  const inputTables = data.tables || {}
  for (const [name, records] of Object.entries(inputTables)) {
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
  return {
    ...data,
    tables: tableData,
    summary: createSummary(tableData)
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

async function importConfigMigration (filePath) {
  if (!filePath) {
    throw new Error('请选择要导入的迁移包')
  }
  const text = await fs.readFile(filePath, 'utf8')
  const data = parseMigrationPackage(text)
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
    summary: data.summary
  }
}

module.exports = {
  exportConfigMigration,
  importConfigMigration,
  buildMigrationPackage,
  parseMigrationPackage
}
