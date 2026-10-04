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
    // 2026-10-04 coder(lq): Isolate Electron's own profile as well as app data so a running production instance cannot consume the E2E single-instance lock.
    `--user-data-dir=${join(dataPath, 'electron-profile')}`,
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ]
}
