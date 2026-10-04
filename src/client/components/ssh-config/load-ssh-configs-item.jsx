import { useState } from 'react'
import {
  Input
} from 'antd'
import {
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons'

const { TextArea } = Input

export default function LoadSshConfigsItem (props) {
  const { item, index, onDelete, onUpdate } = props
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(JSON.stringify(item, null, 2))

  const handleToggleEdit = function () {
    if (isEditing) {
      try {
        const parsed = JSON.parse(editValue)
        onUpdate(index, parsed)
      } catch (err) {
        console.error('Invalid JSON:', err)
        setEditValue(JSON.stringify(item, null, 2))
      }
    } else {
      setEditValue(JSON.stringify(item, null, 2))
    }
    setIsEditing(!isEditing)
  }

  const handleDelete = function () {
    onDelete(index)
  }

  const handleCancelEdit = function () {
    setEditValue(JSON.stringify(item, null, 2))
    setIsEditing(false)
  }

  function renderActions () {
    if (isEditing) {
      return [
        <button type='button' className='mg1r icon-success icon-button' aria-label='确认编辑' title='确认编辑' onClick={handleToggleEdit} key='confirm-ssh-config-item'><CheckOutlined /></button>,
        <button type='button' className='mg1r icon-warning icon-button' aria-label='取消编辑' title='取消编辑' onClick={handleCancelEdit} key='cancel-ssh-config-item'><CloseOutlined /></button>
      ]
    }
    return [
      <button type='button' className='mg1r icon-button ssh-config-item-edit-icon' aria-label='编辑' title='编辑' onClick={handleToggleEdit} key='edit-ssh-config-item'><EditOutlined /></button>,
      <button type='button' className='icon-button icon-danger ssh-config-item-delete-icon' aria-label='删除' title='删除' onClick={handleDelete} key='del-ssh-config-item'><DeleteOutlined /></button>
    ]
  }

  function renderContent () {
    if (isEditing) {
      return (
        <TextArea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          rows={10}
          className='mg1t'
        />
      )
    }
    return (
      <pre className='ssh-config-item-content'>
        {JSON.stringify(item, null, 2)}
      </pre>
    )
  }

  return (
    <div className='ssh-config-item pd1'>
      <div className='pd1b ssh-config-item-header'>
        <b className='mg1r'>[{index + 1}]</b>
        {renderActions()}
      </div>
      {renderContent()}
    </div>
  )
}
