/**
 * db upgrade
 */

import Modal from '../components/common/modal'
import delay from '../common/wait'

export default (Store) => {
  Store.prototype.checkForDbUpgrade = async function () {
    const { store } = window
    const e = window.translate
    if (store.isSecondInstance) {
      return false
    }
    const shouldUpgrade = await window.pre.runGlobalAsync('checkDbUpgrade')
    const shouldMigrate = await window.pre.runGlobalAsync('checkMigrate')
    if (!shouldUpgrade && !shouldMigrate) {
      window.migrating = false
      return false
    }
    window.migrating = true
    let mod
    const commonProps = {
      keyboard: false,
      okButtonProps: {
        style: {
          display: 'none'
        }
      }
    }
    if (shouldMigrate) {
      mod = Modal.info({
        title: e('migratingDatabase'),
        content: e('migratingDatabaseWait'),
        ...commonProps
      })
      await window.pre.runGlobalAsync('migrate')
      mod.update({
        title: e('Done'),
        content: e('databaseMigrated'),
        okButtonProps: {}
      })
      await delay(2000)
      mod.destroy()
    }
    if (shouldUpgrade) {
      const {
        dbVersion,
        packVersion
      } = shouldUpgrade
      mod = Modal.info({
        title: e('upgradingDatabase'),
        content: `${e('upgradingDatabaseFrom')} v${dbVersion} ${e('to')} v${packVersion}，${e('pleaseWait')}`,
        ...commonProps
      })
      await window.pre.runGlobalAsync('doUpgrade')
      mod.update({
        title: e('Done'),
        content: e('databaseUpgraded'),
        okButtonProps: {}
      })
      await delay(2000)
      mod.destroy()
    }
    await store.restart()
    return true
  }
}
