/**
 * data import/export
 */

import {
  Button,
  Switch,
  Select,
  Space
} from 'antd'
import {
  ImportOutlined,
  ExportOutlined
} from '@ant-design/icons'
import Upload from '../common/upload'
import HelpIcon from '../common/help-icon'
import Modal from '../common/modal'

const e = window.translate

const intervalOptions = [
  { value: 0, label: e('autoSyncOnChange') },
  { value: 5, label: '5 ' + e('minutes') },
  { value: 10, label: '10 ' + e('minutes') },
  { value: 15, label: '15 ' + e('minutes') },
  { value: 30, label: '30 ' + e('minutes') },
  { value: 60, label: '1 ' + e('hours') },
  { value: 120, label: '2 ' + e('hours') },
  { value: 360, label: '6 ' + e('hours') },
  { value: 720, label: '12 ' + e('hours') },
  { value: 1440, label: '24 ' + e('hours') }
]

const directionOptions = [
  { value: 'upload', label: e('uploadSettings') },
  { value: 'download', label: e('downloadSettings') }
]

export default function DataTransport (props) {
  const txt = e('autoSync')
  const {
    store
  } = window

  const syncSetting = (props.config || {}).syncSetting || {}
  const autoSyncEnabled = syncSetting.autoSync || false
  const autoSyncInterval = syncSetting.autoSyncInterval || 0
  const autoSyncDirection = syncSetting.autoSyncDirection || 'upload'

  function handleAutoSync (checked) {
    store.updateSyncSetting({
      autoSync: checked
    })
  }

  function handleIntervalChange (value) {
    store.updateSyncSetting({
      autoSyncInterval: value
    })
  }

  function handleDirectionChange (value) {
    store.updateSyncSetting({
      autoSyncDirection: value
    })
  }

  function handleImport (file) {
    return Modal.confirm({
      title: '导入配置迁移包',
      content: (
        <div>
          导入会覆盖当前机器上的连接、分组、主题、快捷命令、工作区和个人设置。建议先导出当前配置作为备份。
        </div>
      ),
      okText: '导入并覆盖',
      cancelText: e('cancel'),
      onOk: async () => {
        try {
          const res = await store.importAll(file)
          if (!res) {
            return
          }
          Modal.info({
            title: '导入完成',
            content: '配置已写入本机，重启应用后会完整加载新的迁移配置。',
            okText: e('restartNow'),
            onOk: () => store.restart()
          })
        } catch (err) {
          store.onError(err)
        }
      }
    })
  }

  return (
    <div className='cn-sync-transport'>
      <div className='cn-sync-migration-actions'>
        <Button
          icon={<ExportOutlined />}
          onClick={store.handleExportAllData}
        >
          导出迁移包
        </Button>
        <Upload
          beforeUpload={handleImport}
          fileList={[]}
          className='inline'
        >
          <Button
            icon={<ImportOutlined />}
          >
            导入迁移包
          </Button>
        </Upload>
      </div>
      <div className='cn-sync-auto-controls'>
        <div className='cn-settings-toggle cn-sync-auto-toggle'>
          <Switch
            aria-label={txt}
            checked={autoSyncEnabled}
            onChange={handleAutoSync}
          />
          <span className='cn-settings-toggle-label'>{txt}</span>
        </div>
        {autoSyncEnabled && (
          <Space className='cn-sync-auto-options' size='small'>
            <Select
              value={autoSyncInterval}
              onChange={handleIntervalChange}
              options={intervalOptions}
              style={{ width: 148 }}
              popupMatchSelectWidth={false}
            />
            <Select
              value={autoSyncDirection}
              onChange={handleDirectionChange}
              options={directionOptions}
              style={{ width: 128 }}
              popupMatchSelectWidth={false}
            />
          </Space>
        )}
        <HelpIcon
          link='https://github.com/electerm/electerm/wiki/Auto-data-Sync'
        />
      </div>
    </div>
  )
}
