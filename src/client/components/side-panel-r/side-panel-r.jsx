import React, { memo, useRef } from 'react'
import DragHandle from '../common/drag-handle'
import './right-side-panel.styl'
import {
  CloseCircleOutlined,
  PushpinOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import {
  Flex,
  Tag
} from 'antd'

export default memo(function RightSidePanel (
  {
    rightPanelVisible,
    rightPanelPinned,
    rightPanelWidth,
    children,
    title,
    rightPanelTab
  }
) {
  const panelRef = useRef(null)

  if (!rightPanelVisible) {
    return null
  }
  const isAiPanel = rightPanelTab === 'ai'
  const tag = isAiPanel
    ? <Tag className='right-panel-tag'>AI</Tag>
    : <InfoCircleOutlined className='right-panel-tag-icon' />
  const panelName = isAiPanel ? '智能助手' : '运行详情'
  const panelSubtitle = isAiPanel ? title : `${title || '当前会话'} 的状态、日志和资源信息`

  function onDragEnd (nw) {
    window.store.setRightSidePanelWidth(nw)
  }

  function onDragMove (nw) {
    if (panelRef.current) {
      panelRef.current.style.width = nw + 'px'
    }
  }

  function onClose () {
    window.store.rightPanelVisible = false
  }

  function togglePin () {
    window.store.rightPanelPinned = !window.store.rightPanelPinned
  }

  const panelProps = {
    className: 'right-side-panel animate-fast' + (rightPanelPinned ? ' right-side-panel-pinned' : ''),
    ref: panelRef,
    style: {
      width: `${rightPanelWidth}px`
    }
  }

  const pinProps = {
    className: 'right-side-panel-pin right-side-panel-controls' + (rightPanelPinned ? ' pinned' : ''),
    onClick: togglePin
  }
  const dragProps = {
    min: 400,
    max: 1000,
    width: rightPanelWidth,
    onDragEnd,
    onDragMove,
    left: false
  }
  return (
    <div
      {...panelProps}
    >
      <DragHandle {...dragProps} />
      <Flex
        className='right-panel-title pd2'
        justify='space-between'
        align='center'
      >
        <div className='right-panel-heading'>
          <div className='right-panel-title-main'>
            {tag}
            <span>{panelName}</span>
          </div>
          <div className='right-panel-title-sub' title={panelSubtitle}>
            {panelSubtitle}
          </div>
        </div>
        <Flex>
          <PushpinOutlined
            {...pinProps}
          />
          <CloseCircleOutlined
            className='right-side-panel-close right-side-panel-controls mg1l'
            onClick={onClose}
          />
        </Flex>
      </Flex>
      <div className='right-side-panel-content'>
        {children}
      </div>
    </div>
  )
})
