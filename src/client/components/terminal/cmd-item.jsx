import React from 'react'
import { CloseCircleOutlined } from '@ant-design/icons'

const SuggestionItem = ({ item, onSelect, onDelete }) => {
  const handleClick = () => {
    onSelect(item)
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    onDelete(item)
  }

  const isPassword = item.type === 'PW'
  const displayText = isPassword
    ? '••••••••'
    : item.command

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      className='suggestion-item'
      role='button'
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className='suggestion-command'>
        {displayText}
      </span>
      {item.hint && (
        <span className='suggestion-hint'>
          {item.hint}
        </span>
      )}
      <span className='suggestion-type'>
        {item.type}
      </span>
      {item.type === 'H' && (
        <button
          type='button'
          className='suggestion-delete'
          aria-label='删除建议命令'
          title='删除建议命令'
          onClick={handleDelete}
        >
          <CloseCircleOutlined />
        </button>
      )}
    </div>
  )
}

export default SuggestionItem
