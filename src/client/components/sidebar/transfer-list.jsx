import { memo } from 'react'
import {
  SendOutlined
} from '@ant-design/icons'
import {
  Badge,
  Tooltip
} from 'antd'
import classNames from 'classnames'
import './transfer.styl'

export default memo(function TransferList (props) {
  const {
    fileTransfers,
    active
  } = props
  const len = fileTransfers.length
  const color = fileTransfers.some(item => item.error) ? 'red' : 'green'
  const bdProps = {
    count: len,
    size: 'small',
    offset: [-10, -5],
    color,
    overflowCount: 99
  }
  const handleOpenTransfer = () => {
    // 2026-08-30 coder(lq): Let the same entry toggle the transfer panel so an open panel is always dismissible.
    window.store.setOpenedSideBar(active ? '' : 'transfer')
  }
  const cls = classNames('control-icon-wrap cn-side-icon-transfer', {
    active
  })
  return (
    <Tooltip title='传输任务' placement='right' mouseEnterDelay={0.2}>
      <button
        type='button'
        className={cls}
        aria-label='传输任务'
        title='传输任务'
        onClick={handleOpenTransfer}
      >
        <Badge
          {...bdProps}
        >
          <SendOutlined
            className='iblock font18 control-icon'
          />
        </Badge>
      </button>
    </Tooltip>
  )
})
