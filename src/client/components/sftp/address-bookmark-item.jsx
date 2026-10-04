import { Component } from 'react'
import {
  CloseCircleOutlined
} from '@ant-design/icons'
import {
  Tag
} from 'antd'

export default class AddrBookmarkItem extends Component {
  handleClick = () => {
    const {
      handleClick,
      item,
      type
    } = this.props
    handleClick(
      type, item.addr
    )
  }

  handleDel = (e) => {
    e.stopPropagation()
    const {
      handleDel,
      item
    } = this.props
    handleDel(
      item
    )
  }

  handleDragOver = e => {
    e.preventDefault()
  }

  handleDragStart = e => {
    e.dataTransfer.setData('idDragged', e.target.getAttribute('data-id'))
  }

  handleDrop = e => {
    e.preventDefault()
    const { store } = window
    const [host, idDragged] = e.dataTransfer.getData('idDragged').split('#')
    const idDrop = e.target.getAttribute('data-id').split('#')[1]
    const dataName = host
      ? 'addressBookmarks'
      : 'addressBookmarksLocal'
    store.adjustOrder(dataName, idDragged, idDrop)
  }

  render () {
    const {
      item
    } = this.props
    const id = `${item.host}#${item.id}`
    const globTag = item.isGlobal
      ? <Tag color='green' variant='solid'>G</Tag>
      : null
    return (
      <div
        key={item.id}
        className='sftp-history-item addr-bookmark-item'
        role='button'
        tabIndex={0}
        onClick={this.handleClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            this.handleClick()
          }
        }}
        data-id={id}
        draggable
        onDragOver={this.handleDragOver}
        onDragStart={this.handleDragStart}
        onDrop={this.handleDrop}
      >
        {globTag}
        <b className='mg1l'>{item.addr}</b>
        <button
          type='button'
          className='del-addr-bookmark'
          aria-label='删除地址书签'
          title='删除地址书签'
          onClick={this.handleDel}
        >
          <CloseCircleOutlined />
        </button>
      </div>
    )
  }
}
