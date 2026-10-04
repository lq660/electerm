/**
 * user-controll.json controll
 */

const { dbAction } = require('./db')
const { userConfigId, userNoEncryptConfigId } = require('../common/constants')
const { getDbConfig } = require('./get-config')
const globalState = require('./glob-state')

const configNoEncryptFields = ['allowMultiInstance']
let saveUserConfigQueue = Promise.resolve()

function hasNoEncryptFields (userConfig) {
  for (const f of configNoEncryptFields) {
    if (f in userConfig) {
      return true
    }
  }
  return false
}

async function saveUserConfigBase (userConfig, options = {}) {
  const configPatch = {
    ...userConfig
  }
  const q = {
    _id: userConfigId
  }
  delete configPatch.host
  delete configPatch.terminalTypes
  delete configPatch.tokenElecterm
  delete configPatch.server
  delete configPatch.port
  globalState.update('config', configPatch)
  const conf = await getDbConfig()
  if (hasNoEncryptFields(configPatch)) {
    const q1 = {
      _id: userNoEncryptConfigId
    }
    const noEncryptConfig = {}
    for (const f of configNoEncryptFields) {
      if (f in configPatch) {
        noEncryptConfig[f] = configPatch[f]
      }
    }
    await dbAction('data', 'update', q1, noEncryptConfig, {
      upsert: true
    })
  }
  return dbAction('data', 'update', q, {
    ...q,
    ...conf,
    ...configPatch
  }, {
    upsert: true,
    ...options
  })
}

function enqueueUserConfigSave (userConfig, options) {
  const configPatch = {
    ...userConfig
  }
  // 2026-09-22 coder(lq): Serialize all renderer-window writes so an earlier, slower save cannot land after a newer AI configuration.
  const saveOperation = saveUserConfigQueue.then(
    () => saveUserConfigBase(configPatch, options)
  )
  saveUserConfigQueue = saveOperation.catch(() => {})
  return saveOperation
}

exports.saveUserConfig = async (userConfig) => {
  return enqueueUserConfigSave(userConfig)
}

exports.rebuildUserConfig = async (userConfig) => {
  return enqueueUserConfigSave(userConfig, { force: true })
}
