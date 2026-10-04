/**
 * transfer-history-modal
 */

import { memo, useState } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Table } from 'antd'
import time from '../../common/time'
import Tag from '../sftp/transfer-tag'
import './transfer-history.styl'
import { get as _get } from 'lodash-es'
import { filesize } from 'filesize'

const e = window.translate
const timeRender = t => time(t)
const sorterFactory = prop => {
  return (a, b) => {
    return _get(a, prop) > _get(b, prop) ? 1 : -1
  }
}
export default memo(function TransferHistoryModal (props) {
  const [pageSize, setPageSize] = useState(5)
  const tableScrollX = 1040

  const handlePageSizeChange = (page, pageSize) => {
    setPageSize(pageSize)
  }

  const {
    clearTransferHistory
  } = window.store
  const transferHistory = props.transferHistory
  const columns = [{
    title: e('startTime'),
    dataIndex: 'startTime',
    key: 'startTime',
    sorter: sorterFactory('startTime'),
    width: 132,
    render: timeRender
  }, {
    title: e('finishTime'),
    dataIndex: 'finishTime',
    key: 'finishTime',
    sorter: sorterFactory('finishTime'),
    width: 132,
    render: timeRender
  }, {
    title: e('type'),
    dataIndex: 'type',
    key: 'typeFrom',
    sorter: sorterFactory('typeFrom'),
    width: 92,
    render: (type, inst) => {
      return (
        <Tag transfer={inst} variant='solid' />
      )
    }
  }, {
    title: e('host'),
    dataIndex: 'host',
    key: 'host',
    sorter: sorterFactory('host'),
    width: 140,
    ellipsis: true
  }, {
    title: e('fromPath'),
    dataIndex: 'fromPath',
    key: 'fromPath',
    width: 220,
    ellipsis: true,
    render: (txt, inst) => {
      const t = inst.fromPathReal || txt
      return (
        <div className='sftp-file history-file' title={t}>{t}</div>
      )
    },
    sorter: sorterFactory('fromPath')
  }, {
    title: e('toPath'),
    dataIndex: 'toPath',
    key: 'toPath',
    width: 220,
    ellipsis: true,
    render: (txt, inst) => {
      const t = inst.toPathReal || txt
      return (
        <div className='sftp-file history-file' title={t}>{t}</div>
      )
    },
    sorter: sorterFactory('toPath')
  }, {
    title: e('size'),
    dataIndex: 'size',
    key: 'size',
    sorter: sorterFactory('size'),
    width: 92,
    render: (v) => filesize(v || 0)
  }, {
    title: e('speed'),
    dataIndex: 'speed',
    key: 'speed',
    sorter: sorterFactory('speed'),
    width: 112,
    ellipsis: true
  }]
  const tabConf = {
    dataSource: transferHistory,
    columns,
    bordered: true,
    tableLayout: 'fixed',
    scroll: {
      x: tableScrollX
    },
    pagination: {
      pageSize,
      showSizeChanger: true,
      pageSizeOptions: [5, 10, 20, 50, 100],
      placement: 'topEnd',
      onChange: handlePageSizeChange
    },
    size: 'small',
    rowKey: 'id'
  }
  return (
    <div className='pd2 cn-transfer-history'>
      <div className='cn-transfer-history-actions'>
        <button type='button' className='iblock cn-transfer-clear' aria-label={e('clear')} title={e('clear')} onClick={clearTransferHistory}>
          <CloseOutlined className='mg1r' />
          {e('clear')}
        </button>
      </div>
      <div className='table-scroll-wrap'>
        <Table
          {...tabConf}
        />
      </div>
    </div>
  )
})
