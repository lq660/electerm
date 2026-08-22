const fs = require('fs')
const os = require('os')
const { join, resolve } = require('path')
const cwd = process.cwd()
const dataPath = process.env.DATA_PATH || fs.mkdtempSync(join(os.tmpdir(), 'electerm-e2e-data-'))

process.env.DATA_PATH = dataPath

module.exports = {
  env: {
    ...process.env,
    NODE_TEST: 'yes',
    DATA_PATH: dataPath
  },
  args: [
    resolve(cwd, 'work/app'),
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ]
}
