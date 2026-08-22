import {
  Empty,
  Tabs
} from 'antd'
import Transports from './transfer-list-control'
import TransportHistory from './transfer-history-modal'
import { memo } from 'react'

const e = window.translate

export default memo(function TransferModal (props) {
  const renderTransfer = () => {
    return (
      <Transports
        fileTransfers={props.fileTransfers}
      />
    )
  }

  const renderHistory = () => {
    return (
      <TransportHistory
        transferHistory={props.transferHistory}
      />
    )
  }

  const {
    fileTransfers,
    transferHistory,
    transferTab
  } = props
  if (!fileTransfers.length && !transferHistory.length) {
    return (
      <div className='cn-transfer-center pd2'>
        <div className='cn-transfer-summary'>
          <strong>暂无传输任务</strong>
          <span>从 SFTP、本地文件或远程文件面板发起上传、下载后会显示在这里</span>
        </div>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description='当前没有进行中或历史传输'
        />
      </div>
    )
  }
  const tabs = []
  if (fileTransfers.length) {
    tabs.push({
      title: e('fileTransfers'),
      id: 'transfer',
      render: renderTransfer
    })
  }
  if (transferHistory.length) {
    tabs.push({
      title: e('transferHistory'),
      id: 'history',
      render: renderHistory
    })
  }
  const activeTab = tabs.map(d => d.id).includes(transferTab)
    ? transferTab
    : tabs[0].id
  const items = tabs.map(tab => {
    return {
      key: tab.id,
      label: tab.title,
      children: tab.render()
    }
  })
  return (
    <div
      className='pd1 cn-transfer-center'
    >
      <div className='cn-transfer-summary'>
        <strong>传输任务</strong>
        <span>进行中 {fileTransfers.length} 个，历史记录 {transferHistory.length} 条</span>
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={window.store.handleTransferTab}
        items={items}
      />
    </div>
  )
})
