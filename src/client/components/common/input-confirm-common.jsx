import React, { useState, useEffect } from 'react'
import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { Space } from 'antd'
import './input-confirm-common.styl'

export default function InputConfirmCommon ({
  value,
  onChange,
  inputComponent: InputComponent,
  addonBefore,
  addonAfter,
  ...rest
}) {
  const [localValue, setLocalValue] = useState(value)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  function handleChange (e) {
    const newValue = e && e.target ? e.target.value : e
    setLocalValue(newValue)
    setIsEditing(true)
  }

  function handleConfirm () {
    onChange(localValue)
    setIsEditing(false)
  }

  function handleCancel () {
    setLocalValue(value)
    setIsEditing(false)
  }

  function handleBlur () {
    if (isEditing) {
      handleConfirm()
    }
  }

  const icons = isEditing
    ? (
      <>
        <button type='button' onClick={handleConfirm} className='icon-button mg1x' aria-label='确认' title='确认'><CheckOutlined /></button>
        <button type='button' onClick={handleCancel} className='icon-button' aria-label='取消' title='取消'><CloseOutlined /></button>
      </>
      )
    : null
  const { className, ...restProps } = rest
  const cls = className ? `${className} input-confirm` : 'input-confirm'
  const beforeAddon = addonBefore || null
  const afterAddon = addonAfter || icons
    ? (
      <Space.Addon>
        {addonAfter}
        {icons}
      </Space.Addon>
      )
    : null

  const childProps = {
    ...restProps,
    value: localValue,
    onChange: handleChange,
    onBlur: handleBlur
  }

  const inputElement = <InputComponent {...childProps} />

  return (
    <Space.Compact className={cls}>
      {beforeAddon}
      {inputElement}
      {afterAddon}
    </Space.Compact>
  )
}
