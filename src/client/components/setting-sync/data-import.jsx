/**
 * data import/export
 */

import { useState } from 'react'
import {
  Button,
  Switch,
  Select,
  Space,
  Input,
  Alert,
  Checkbox
} from 'antd'
import {
  ImportOutlined,
  ExportOutlined
} from '@ant-design/icons'
import {
  syncDataMaps
} from '../../common/constants'
import Upload from '../common/upload'
import HelpIcon from '../common/help-icon'
import Modal from '../common/modal'

const e = window.translate

const migrationExtraDataMaps = {
  history: ['history', 'terminalCommandHistory'],
  aiChatHistory: ['aiChatHistory'],
  autoRunWidgets: ['autoRunWidgets']
}

const migrationExportDataMaps = {
  ...Object.keys(syncDataMaps).reduce((prev, key) => {
    return {
      ...prev,
      [key]: syncDataMaps[key].map(name => name === 'config' ? 'data' : name)
    }
  }, {}),
  ...migrationExtraDataMaps
}

const migrationExportLabels = {
  history: '历史记录',
  aiChatHistory: 'AI 对话历史',
  autoRunWidgets: '自动运行组件'
}

const migrationExportKeys = Object.keys(migrationExportDataMaps)

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

function getMigrationExportTables (keys) {
  return Array.from(new Set(
    keys
      .map(key => migrationExportDataMaps[key] || [])
      .flat()
  ))
}

function MigrationExportScope (props) {
  const {
    defaultSelectedKeys,
    onChange
  } = props
  const [selectedKeys, setSelectedKeys] = useState(defaultSelectedKeys)
  const selectedCount = selectedKeys.length
  const checkedAll = selectedCount === migrationExportKeys.length
  function updateSelectedKeys (keys) {
    setSelectedKeys(keys)
    onChange(keys)
  }
  function toggleAll (event) {
    updateSelectedKeys(event.target.checked ? migrationExportKeys : [])
  }
  return (
    <div className='cn-sync-migration-scope'>
      <div className='cn-sync-migration-scope-head'>
        <strong>导出范围</strong>
        <Checkbox
          checked={checkedAll}
          indeterminate={selectedCount > 0 && !checkedAll}
          onChange={toggleAll}
        >
          全选
        </Checkbox>
      </div>
      <Checkbox.Group
        className='cn-sync-data-select cn-sync-migration-scope-list'
        value={selectedKeys}
        onChange={updateSelectedKeys}
      >
        {
          migrationExportKeys.map(key => (
            <Checkbox
              className='cn-sync-data-option'
              key={key}
              value={key}
            >
              {migrationExportLabels[key] || e(key)}
            </Checkbox>
          ))
        }
      </Checkbox.Group>
    </div>
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
    let includeExternalKeys = false
    let selectedExportKeys = migrationExportKeys
    function updateSelectedExportKeys (keys) {
      selectedExportKeys = keys
    }
    return Modal.confirm({
      title: '导出配置迁移包',
      content: (
        <Space direction='vertical' size='middle' className='width-100'>
          <Alert
            type='warning'
            showIcon
            message='迁移包会使用你设置的迁移密码加密'
            description='迁移包包含连接密码、同步令牌，以及已保存到连接里的私钥内容。仅引用本机路径的密钥文件默认不会包含；SSH Agent 状态无法迁移。'
          />
          <MigrationExportScope
            defaultSelectedKeys={selectedExportKeys}
            onChange={updateSelectedExportKeys}
          />
          <Checkbox
            onChange={event => {
              includeExternalKeys = event.target.checked
            }}
          >
            包含连接引用的本地密钥文件
          </Checkbox>
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
        if (!selectedExportKeys.length) {
          store.onError(new Error('请选择至少一种导出内容'))
          return false
        }
        try {
          const res = await store.handleExportAllData(password, {
            includeExternalKeys,
            tables: getMigrationExportTables(selectedExportKeys)
          })
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
