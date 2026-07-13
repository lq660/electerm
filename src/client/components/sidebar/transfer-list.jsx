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
    window.store.setOpenedSideBar('transfer')
  }
  const cls = classNames('control-icon-wrap cn-side-icon-transfer', {
    active
  })
  return (
    <Tooltip title='传输任务' placement='right' mouseEnterDelay={0.2}>
      <div
        className={cls}
        aria-label='传输任务'
        onClick={handleOpenTransfer}
      >
        <Badge
          {...bdProps}
        >
          <SendOutlined
            className='iblock font18 control-icon'
          />
        </Badge>
      </div>
    </Tooltip>
  )
})
