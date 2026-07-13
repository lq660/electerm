import {
  Popover
} from 'antd'
import TabItem from './batch-item'
import {
  DownOutlined
} from '@ant-design/icons'

export default function TabSelect (props) {
  const { selectedTabIds, tabs, activeTabId } = props
  function renderTabs () {
    if (!tabs.length) {
      return (
        <div className='batch-tab-select-empty'>
          当前没有可发送命令的终端
        </div>
      )
    }
    return tabs.map(tab => {
      const selected = selectedTabIds.includes(tab.id)
      const itemProps = {
        tab,
        selected,
        onSelect: window.store.onSelectBatchInputSelectedTabId,
        id: tab.id,
        isCurrent: tab.id === activeTabId
      }
      return (
        <TabItem
          key={tab.id}
          {...itemProps}
        />
      )
    })
  }
  function onSelectAll () {
    window.store.selectAllBatchInputTabs()
  }
  function onSelectNone () {
    window.store.selectNoneBatchInputTabs()
  }
  function renderBtns () {
    return (
      <div className='batch-tab-select-actions'>
        <button
          type='button'
          onClick={onSelectAll}
        >
          全选
        </button>
        <button
          type='button'
          onClick={onSelectNone}
        >
          清空
        </button>
      </div>
    )
  }
  function renderContent () {
    return (
      <div className='batch-tab-select-popover'>
        <div className='batch-tab-select-head'>
          <div className='batch-tab-select-title'>选择接收命令的终端</div>
          <div className='batch-tab-select-desc'>勾选后，点击“发送”会把当前命令同时写入这些终端。</div>
        </div>
        {renderBtns()}
        <div className='batch-tab-select-list'>
          {renderTabs()}
        </div>
      </div>
    )
  }

  function renderLabel () {
    const count = selectedTabIds.length
    const onlyCurrent = count === 1 && selectedTabIds.includes(activeTabId)
    if (!count) {
      return '发送到：未选择'
    }
    if (onlyCurrent) {
      return '发送到：当前终端'
    }
    return `发送到：${count} 个终端`
  }

  return (
    <Popover
      content={renderContent()}
      trigger='click'
      placement='topLeft'
      overlayClassName='batch-tab-select-overlay'
    >
      <span className='batch-tab-select-trigger pointer iblock pd1x'>
        {renderLabel()} <DownOutlined />
      </span>
    </Popover>
  )
}
