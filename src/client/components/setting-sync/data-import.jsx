/**
 * data import/export
 */

import {
  Button,
  Switch,
  Select,
  Space,
  Input,
  Alert
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

function renderWarnings (warnings = []) {
  if (!warnings.length) {
    return null
  }
  return (
    <ul className='pd1l'>
      {warnings.map((warning, index) => (
        <li key={index}>{warning}</li>
      ))}
    </ul>
  )
}

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

  function handleExport () {
    let password = ''
    return Modal.confirm({
      title: '导出配置迁移包',
      content: (
        <Space direction='vertical' size='middle' className='width-100'>
          <Alert
            type='warning'
            showIcon
            message='迁移包会使用你设置的迁移密码加密'
            description='迁移包包含连接密码、同步令牌，以及已保存到连接里的私钥内容。仅引用本机路径或 SSH Agent 的外部密钥文件不会自动包含。'
          />
          <Input.Password
            autoFocus
            placeholder='设置迁移包密码'
            onChange={event => {
              password = event.target.value
            }}
          />
        </Space>
      ),
      okText: '加密导出',
      cancelText: e('cancel'),
      onOk: async () => {
        if (!password) {
          store.onError(new Error('请设置迁移包密码'))
          return false
        }
        try {
          const res = await store.handleExportAllData(password)
          if (res && res.warnings && res.warnings.length) {
            Modal.info({
              title: '导出完成',
              content: (
                <div>
                  <div>配置迁移包已加密导出。</div>
                  {renderWarnings(res.warnings)}
                </div>
              )
            })
          }
        } catch (err) {
          store.onError(err)
          return false
        }
      }
    })
  }

  function handleImport (file) {
    let password = ''
    return Modal.confirm({
      title: '导入配置迁移包',
      content: (
        <Space direction='vertical' size='middle' className='width-100'>
          <Alert
            type='warning'
            showIcon
            message='导入会覆盖当前机器配置'
            description='连接、分组、主题、快捷命令、工作区和个人设置都会被迁移包内容替换。建议先导出当前配置作为备份。'
          />
          <Input.Password
            autoFocus
            placeholder='输入迁移包密码，旧版明文包可留空'
            onChange={event => {
              password = event.target.value
            }}
          />
        </Space>
      ),
      okText: '导入并覆盖',
      cancelText: e('cancel'),
      onOk: async () => {
        try {
          const res = await store.importAll(file, password)
          if (!res) {
            return
          }
          Modal.info({
            title: '导入完成',
            content: (
              <div>
                <div>配置已写入本机，重启应用后会完整加载新的迁移配置。</div>
                {renderWarnings(res.warnings)}
              </div>
            ),
            okText: e('restartNow'),
            onOk: () => store.restart()
          })
        } catch (err) {
          store.onError(err)
          return false
        }
      }
    })
  }

  return (
    <div className='cn-sync-transport'>
      <div className='cn-sync-migration-actions'>
        <Button
          icon={<ExportOutlined />}
          onClick={handleExport}
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
