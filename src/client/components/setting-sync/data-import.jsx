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
  Checkbox,
  Radio,
  message
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
import requestSensitiveActionAuth from '../common/sensitive-auth'

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

const migrationTableLabels = {
  bookmarks: '连接',
  bookmarkGroups: '连接分组',
  addressBookmarks: 'SFTP 地址书',
  terminalThemes: '终端主题',
  data: '系统设置',
  quickCommands: '快捷命令',
  profiles: '终端配置',
  workspaces: '工作区',
  history: '最近连接',
  terminalCommandHistory: '终端命令历史',
  aiChatHistory: 'AI 对话历史',
  autoRunWidgets: '自动运行组件'
}

const migrationExportKeys = Object.keys(migrationExportDataMaps)

function showMigrationError (action, err) {
  const text = err && err.message ? err.message : String(err || '未知错误')
  message.error(`${action}：${text}`)
}

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

function renderMigrationSummary (summary = {}) {
  const entries = Object.entries(summary).filter(([, count]) => count)
  if (!entries.length) {
    return null
  }
  return (
    <div className='cn-sync-migration-preview-list'>
      {entries.map(([name, count]) => (
        <span key={name}>
          <b>{migrationTableLabels[name] || name}</b>
          <em>{count}</em>
        </span>
      ))}
    </div>
  )
}

function renderMigrationConflicts (conflicts = {}) {
  const entries = Object.entries(conflicts).filter(([, info]) => {
    return info && (info.conflicts || info.additions)
  })
  if (!entries.length) {
    return <div className='cn-sync-migration-preview-empty'>未检测到同 ID 冲突。</div>
  }
  return (
    <div className='cn-sync-migration-conflicts'>
      {entries.map(([name, info]) => (
        <div key={name}>
          <strong>{migrationTableLabels[name] || name}</strong>
          <span>新增 {info.additions || 0} · 冲突 {info.conflicts || 0} · 当前 {info.current || 0}</span>
        </div>
      ))}
    </div>
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

function MigrationImportPreview (props) {
  const {
    preview,
    mode,
    onModeChange
  } = props
  const [selectedMode, setSelectedMode] = useState(mode)
  function handleModeChange (event) {
    const value = event.target.value
    setSelectedMode(value)
    onModeChange(value)
  }
  const externalKeyText = preview.externalKeyFileCount
    ? `迁移包包含 ${preview.externalKeyFileCount} 个本地密钥文件，导入时会恢复到本机迁移密钥目录。`
    : '迁移包未包含本地密钥文件。'
  return (
    <Space direction='vertical' size='middle' className='width-100'>
      <Alert
        type='info'
        showIcon
        message='已读取迁移包内容'
        description={`导出时间：${preview.exportedAt || '未知'}。${externalKeyText}`}
      />
      <div className='cn-sync-migration-preview'>
        <div className='cn-sync-migration-preview-title'>包含内容</div>
        {renderMigrationSummary(preview.summary)}
      </div>
      <div className='cn-sync-migration-preview'>
        <div className='cn-sync-migration-preview-title'>冲突检查</div>
        {renderMigrationConflicts(preview.conflicts)}
      </div>
      <Radio.Group
        className='cn-sync-migration-mode'
        value={selectedMode}
        onChange={handleModeChange}
      >
        <Radio value='replace'>覆盖当前同类配置</Radio>
        <Radio value='merge'>合并导入，冲突时使用迁移包内容</Radio>
        <Radio value='skipExisting'>只导入新增内容，跳过已有配置</Radio>
      </Radio.Group>
      <Alert
        type='warning'
        showIcon
        message='导入前会自动备份当前配置'
        description='自动备份使用本次输入的迁移密码加密保存，导入失败会回滚本次写入。'
      />
      {renderWarnings(preview.warnings)}
    </Space>
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
          message.warning('请设置迁移包密码')
          return false
        }
        if (!selectedExportKeys.length) {
          message.warning('请选择至少一种导出内容')
          return false
        }
        try {
          const auth = await requestSensitiveActionAuth({
            title: '导出配置迁移包',
            message: '导出迁移包属于敏感操作',
            description: '迁移包可能包含连接密码、同步令牌和密钥内容。导出前需要完成二次授权。',
            okText: '授权并导出'
          })
          if (!auth) {
            return false
          }
          const res = await store.handleExportAllData(password, {
            includeExternalKeys,
            tables: getMigrationExportTables(selectedExportKeys),
            appPassword: auth.appPassword
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
          showMigrationError('导出迁移包失败', err)
          return false
        }
      }
    })
  }

  function showImportPreviewModal (file, password, preview) {
    let mode = 'replace'
    return Modal.confirm({
      title: '确认导入配置迁移包',
      content: (
        <MigrationImportPreview
          preview={preview}
          mode={mode}
          onModeChange={value => {
            mode = value
          }}
        />
      ),
      okText: '导入配置',
      cancelText: e('cancel'),
      onOk: async () => {
        try {
          const auth = await requestSensitiveActionAuth({
            title: '导入配置迁移包',
            message: '导入迁移包会修改本机配置',
            description: '导入内容可能包含连接密码、同步令牌和密钥引用。写入本机前需要完成二次授权。',
            okText: '授权并导入'
          })
          if (!auth) {
            return false
          }
          const res = await store.importAll(file, password, {
            mode,
            createBackup: true,
            appPassword: auth.appPassword
          })
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
          showMigrationError('导入迁移包失败', err)
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
            message='先读取迁移包预览，再确认导入方式'
            description='云舵会先检查包含内容、同 ID 冲突和本地密钥文件，再由你选择覆盖、合并或跳过已有配置。'
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
      okText: '读取预览',
      cancelText: e('cancel'),
      onOk: async () => {
        try {
          const preview = await store.previewImportAll(file, password)
          showImportPreviewModal(file, password, preview)
        } catch (err) {
          showMigrationError('读取迁移包失败', err)
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
