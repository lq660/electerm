import React, { useEffect } from 'react'
import { Button } from 'antd'
import { notification } from '../common/notification'
import * as ls from '../../common/safe-local-storage'
import {
  sshConfigKey,
  sshConfigLoadKey,
  newBookmarkIdPrefix
} from '../../common/constants'

const e = window.translate

function handleLoad () {
  window.store.showSshConfigModal = true
  notification.destroy('sshConfigNotify')
}

function handleIgnore () {
  ls.setItem(sshConfigKey, 'yes')
  notification.destroy('sshConfigNotify')
}

function showNotification () {
  notification.info({
    message: e('loadSshConfigs'),
    duration: 0,
    placement: 'bottom',
    key: 'sshConfigNotify',
    description: (
      <>
        <p>{e('sshConfigNotice')}</p>
        <Button type='primary' onClick={handleLoad} className='mg1r mg1b'>
          {e('import')}
        </Button>
        <Button onClick={handleIgnore} className='mg1r mg1b'>
          {e('ignore')}
        </Button>
      </>
    )
  })
}

export default function SshConfigLoadNotify (props) {
  const { settingTab, settingItem = {}, showModal, sshConfigs } = props

  useEffect(() => {
    const ignoreSshConfig = ls.getItem(sshConfigKey)
    const sshConfigLoaded = ls.getItem(sshConfigLoadKey)
    const isNewConnection = settingItem.id?.startsWith(newBookmarkIdPrefix)
    const shouldShow =
      sshConfigs.length &&
      ignoreSshConfig !== 'yes' &&
      settingTab === 'bookmarks' &&
      showModal &&
      !isNewConnection &&
      sshConfigLoaded !== 'yes' &&
      window.store.hasNodePty

    if (shouldShow) {
      showNotification()
    }
  }, [settingTab, settingItem.id, showModal, sshConfigs.length])

  return null
}
