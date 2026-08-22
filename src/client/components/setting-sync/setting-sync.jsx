/**
 * sync setting module entry
 */

import { Tabs, Spin } from 'antd'
import { useEffect } from 'react'
import SyncForm from './setting-sync-form'
import { syncTypes, syncDataMaps } from '../../common/constants'
import DataTransport from './data-import'
import DataSelect from './data-select'
import { pick } from 'lodash-es'
import { auto } from 'manate/react'
import deepCopy from 'json-deep-copy'

export default auto(function SyncSettingEntry (props) {
  const handleChange = (key) => {
    window.store.syncType = key
  }
  const {
    config
  } = props
  const {
    syncSetting = {}
  } = config || {}
  const {
    store
  } = window
  useEffect(() => {
    if (store.syncType === syncTypes.cloud) {
      store.syncType = syncTypes.webdav
    }
  }, [store])
  function renderForm () {
    const syncProps = {
      ...syncSetting,
      ...pick(props, [
        'isSyncingSetting',
        'isSyncDownload',
        'isSyncUpload',
        'syncType',
        'serverStatus'
      ]),
      serverStatus: deepCopy((store.syncServerStatus || {})[props.syncType])
    }
    const type = props.syncType
    const formData = {
      gistId: syncSetting[type + 'GistId'],
      token: syncSetting[type + 'AccessToken'],
      url: syncSetting[type + 'Url'],
      apiUrl: syncSetting[type + 'ApiUrl'],
      lastSyncTime: syncSetting[type + 'LastSyncTime'],
      syncPassword: syncSetting[type + 'SyncPassword'],
      proxy: syncSetting[type + 'Proxy'],
      // WebDAV specific fields
      serverUrl: syncSetting[type + 'ServerUrl'],
      username: syncSetting[type + 'Username'],
      password: syncSetting[type + 'Password'],
      skipVerify: syncSetting[type + 'SkipVerify'] || false
    }
    return (
      <SyncForm
        {...syncProps}
        encrypt={syncSetting.syncEncrypt}
        formData={formData}
      />
    )
  }

  const syncItems = Object.keys(syncTypes).filter(type => type !== syncTypes.cloud).map(type => {
    const syncTypeLabels = {
      github: 'GitHub',
      gitee: 'Gitee',
      custom: '自建服务',
      cloud: '云端服务',
      webdav: 'WebDAV'
    }
    return {
      key: type,
      label: syncTypeLabels[type] || type,
      children: null
    }
  })
  const {
    dataSyncSelected
  } = config || {}
  const arr = dataSyncSelected && dataSyncSelected !== 'all'
    ? dataSyncSelected.split(',')
    : Object.keys(syncDataMaps)
  const dataSelectProps = {
    dataSyncSelected: arr
  }
  const dataImportProps = {
    config: config || {}
  }
  return (
    <div className='form-wrap pd1y pd2x cn-setting-detail-form cn-sync-setting-form'>
      <div className='cn-setting-card-title'>
        <strong>配置同步</strong>
        <span>备份和恢复连接、主题、命令等个人配置</span>
      </div>
      <section className='cn-settings-section cn-sync-import-section'>
        <div className='cn-settings-section-title'>
          <strong>一键迁移</strong>
          <span>导出迁移包，在另一台机器导入后即可恢复同一套配置</span>
        </div>
        <DataTransport {...dataImportProps} />
      </section>
      <Spin spinning={store.isSyncingSetting}>
        <section className='cn-settings-section cn-sync-provider-section'>
          <div className='cn-settings-section-title'>
            <strong>同步方式</strong>
            <span>选择一个远端存储，并填写对应认证信息</span>
          </div>
          <Tabs
            activeKey={store.syncType}
            onChange={handleChange}
            items={syncItems}
          />
          {
            renderForm()
          }
        </section>
        <section className='cn-settings-section cn-sync-data-section'>
          <div className='cn-settings-section-title'>
            <strong>同步范围</strong>
            <span>按需选择要参与同步的数据类型</span>
          </div>
          <DataSelect {...dataSelectProps} />
        </section>
      </Spin>
    </div>
  )
})
