import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Radio,
  Space,
  Table,
  Tag,
  Tooltip,
  message
} from 'antd'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ImportOutlined
} from '@ant-design/icons'
import Modal from '../common/modal'
import Upload from '../common/upload'
import {
  getConnectionIdentity,
  importSelectedConnections,
  prepareConnectionImports,
  preserveSourceGroupsValue
} from './bookmark-upload'
import formatBookmarkGroups from '../bookmark-form/common/bookmark-group-tree-format'
import './connection-import-modal.styl'

const e = window.translate

function flattenGroupOptions (groups, parentTitles = []) {
  return groups.flatMap(group => {
    const titles = [...parentTitles, group.title]
    const option = {
      label: titles.join(' / '),
      value: group.value
    }
    return [option, ...flattenGroupOptions(group.children || [], titles)]
  })
}

export default function ConnectionImport ({ title }) {
  const [prepared, setPrepared] = useState(null)
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const [conflictStrategy, setConflictStrategy] = useState('skip')
  const [targetGroupId, setTargetGroupId] = useState(preserveSourceGroupsValue)
  const [importing, setImporting] = useState(false)

  const existingIdentities = useMemo(() => new Set(
    (window.store.bookmarks || []).map(getConnectionIdentity)
  ), [prepared])

  const targetGroupOptions = useMemo(() => [{
    label: e('preserveSourceGroups'),
    value: preserveSourceGroupsValue,
    key: preserveSourceGroupsValue
  }, ...flattenGroupOptions(
    formatBookmarkGroups(window.store.bookmarkGroups || [])
  )], [prepared])

  const rows = useMemo(() => {
    const batchIdentities = new Set()
    return (prepared?.result.connections || []).map((connection, index) => {
      const identity = getConnectionIdentity(connection)
      const batchConflict = batchIdentities.has(identity)
      batchIdentities.add(identity)
      return {
        ...connection,
        index,
        key: index,
        conflict: batchConflict || existingIdentities.has(identity)
      }
    })
  }, [prepared, existingIdentities])

  const handleFiles = async files => {
    try {
      const next = await prepareConnectionImports(files)
      setPrepared(next)
      setSelectedIndexes(next.result.connections.map((item, index) => index))
      setConflictStrategy('skip')
      setTargetGroupId(preserveSourceGroupsValue)
    } catch (error) {
      message.error(error.message || e('connectionImportFailed'))
    }
  }

  const handleCancel = () => {
    if (!importing) {
      setPrepared(null)
    }
  }

  const handleImport = async () => {
    if (!selectedIndexes.length) {
      message.warning(e('selectConnectionToImport'))
      return
    }
    setImporting(true)
    try {
      const summary = await importSelectedConnections({
        result: prepared.result,
        selectedIndexes,
        conflictStrategy,
        targetGroupId
      })
      message.success(e('connectionImportSummary')
        .replace('{added}', summary.added)
        .replace('{updated}', summary.updated)
        .replace('{skipped}', summary.skipped))
      setPrepared(null)
    } catch (error) {
      message.error(error.message || e('connectionImportFailed'))
    } finally {
      setImporting(false)
    }
  }

  const columns = [
    {
      title: e('connectionName'),
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      width: 150
    },
    {
      title: e('sourceFile'),
      dataIndex: 'sourceFileName',
      key: 'sourceFileName',
      ellipsis: true,
      width: 140
    },
    {
      title: e('hostAddress'),
      dataIndex: 'host',
      key: 'host',
      ellipsis: true,
      width: 180
    },
    {
      title: e('port'),
      dataIndex: 'port',
      key: 'port',
      width: 72
    },
    {
      title: e('username'),
      dataIndex: 'username',
      key: 'username',
      ellipsis: true,
      width: 110,
      render: value => value || '-'
    },
    {
      title: e('group'),
      dataIndex: 'groupName',
      key: 'groupName',
      ellipsis: true,
      width: 120,
      render: value => value || e('defaultGroup')
    },
    {
      title: e('status'),
      key: 'status',
      width: 130,
      render: (_, row) => {
        if (row.warnings.length) {
          return (
            <Tooltip title={row.warnings.join(' ')}>
              <Tag icon={<ExclamationCircleOutlined />} color='warning'>
                {e('credentialRequired')}
              </Tag>
            </Tooltip>
          )
        }
        if (row.conflict) {
          return <Tag color='processing'>{e('connectionConflict')}</Tag>
        }
        return (
          <Tag icon={<CheckCircleOutlined />} color='success'>
            {e('readyToImport')}
          </Tag>
        )
      }
    }
  ]

  const footer = (
    <div className='custom-modal-footer-buttons'>
      <Button onClick={handleCancel} disabled={importing}>
        {e('cancel')}
      </Button>
      <Button
        type='primary'
        icon={<ImportOutlined />}
        onClick={handleImport}
        loading={importing}
        disabled={!selectedIndexes.length}
        className='connection-import-confirm'
      >
        {e('importSelectedConnections').replace('{count}', selectedIndexes.length)}
      </Button>
    </div>
  )

  return (
    <>
      <Upload beforeUpload={handleFiles} className='upload-bookmark-icon' multiple>
        <Tooltip title={title} placement='bottom' mouseEnterDelay={0.2}>
          <Button icon={<ImportOutlined />} aria-label={title} />
        </Tooltip>
      </Upload>
      <Modal
        open={Boolean(prepared)}
        title={e('connectionImportPreview')}
        width={1040}
        onCancel={handleCancel}
        maskClosable={!importing}
        footer={footer}
        className='connection-import-modal'
      >
        {prepared && (
          <div className='connection-import-content'>
            <div className='connection-import-summary'>
              <div>
                <span>{e('importSource')}</span>
                <strong>{prepared.result.sourceLabel}</strong>
              </div>
              <div>
                <span>{e('importFile')}</span>
                <strong title={prepared.fileNames.join('\n')}>
                  {
                    prepared.fileNames.length === 1
                      ? prepared.fileNames[0]
                      : e('connectionImportFileCount').replace('{count}', prepared.fileNames.length)
                  }
                </strong>
              </div>
              <div>
                <span>{e('recognizedConnections')}</span>
                <strong>{prepared.result.connections.length}</strong>
              </div>
            </div>
            {prepared.failures.length > 0 && (
              <Alert
                type='warning'
                showIcon
                message={e('connectionImportSkippedFiles').replace('{count}', prepared.failures.length)}
                description={prepared.failures
                  .map(item => `${item.fileName}：${item.message}`)
                  .join('；')}
              />
            )}
            {(prepared.result.warnings.length > 0 || rows.some(row => row.warnings.length)) && (
              <Alert
                type='warning'
                showIcon
                message={e('connectionImportCredentialNotice')}
                description={[...prepared.result.warnings, ...rows.flatMap(row => row.warnings)]
                  .filter((value, index, values) => values.indexOf(value) === index)
                  .join(' ')}
              />
            )}
            <Table
              className='connection-import-table'
              size='small'
              columns={columns}
              dataSource={rows}
              pagination={false}
              scroll={{ y: 320, x: 960 }}
              rowSelection={{
                selectedRowKeys: selectedIndexes,
                onChange: keys => setSelectedIndexes(keys),
                preserveSelectedRowKeys: true
              }}
            />
            <div className='connection-import-target-group'>
              <div>
                <strong>{e('importTargetGroup')}</strong>
                <span>{e('importTargetGroupTip')}</span>
              </div>
              <select
                className='connection-import-group-select'
                value={targetGroupId}
                aria-label={e('importTargetGroup')}
                onChange={event => setTargetGroupId(event.target.value)}
              >
                {targetGroupOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className='connection-import-conflict'>
              <div>
                <strong>{e('conflictHandling')}</strong>
                <span>{e('conflictHandlingTip')}</span>
              </div>
              <Radio.Group
                value={conflictStrategy}
                onChange={event => setConflictStrategy(event.target.value)}
              >
                <Space wrap>
                  <Radio value='skip'>{e('skipExisting')}</Radio>
                  <Radio value='rename'>{e('renameImported')}</Radio>
                  <Radio value='overwrite'>{e('overwriteExisting')}</Radio>
                </Space>
              </Radio.Group>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
