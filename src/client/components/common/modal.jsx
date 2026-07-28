/**
 * Simple modal component without animation
 * Replaces antd Modal for better performance
 */

import { CloseOutlined } from '@ant-design/icons'
import classnames from 'classnames'
import React, { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './modal.styl'

function isEditableTarget (target) {
  if (!target || target === document.body) {
    return false
  }

  const tagName = target.tagName ? target.tagName.toLowerCase() : ''
  if (['input', 'textarea', 'select'].includes(tagName)) {
    return true
  }

  if (target.isContentEditable) {
    return true
  }

  return Boolean(target.closest?.([
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '.ant-select',
    '.ant-picker',
    '.ant-input-number'
  ].join(',')))
}

export default function Modal (props) {
  const {
    open,
    title,
    width = 520,
    zIndex = 1000,
    className,
    wrapClassName,
    children,
    footer,
    maskClosable = true,
    onCancel
  } = props

  const contentRef = useRef(null)

  function handleMaskClick (e) {
    if (e.target === e.currentTarget && maskClosable && onCancel) {
      onCancel()
    }
  }

  function handleClose () {
    if (onCancel) {
      onCancel()
    }
  }

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (onCancel) {
          onCancel()
          e.preventDefault()
        }
      } else if ((e.key === 'Enter' || e.key === ' ')) {
        if (isEditableTarget(e.target)) {
          return
        }

        const okBtn = contentRef.current?.querySelector('.custom-modal-ok-btn')
        if (okBtn && !okBtn.disabled) {
          okBtn.click()
          e.preventDefault()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) {
    return null
  }

  const modalStyle = {
    zIndex
  }

  const contentStyle = {
    width: typeof width === 'number' ? `${width}px` : width
  }

  const cls = classnames(
    'custom-modal-wrap',
    wrapClassName,
    className
  )

  return (
    <div className={cls} style={modalStyle}>
      <div
        className='custom-modal-mask'
        onClick={handleMaskClick}
      />
      <div className='custom-modal-container' onClick={handleMaskClick}>
        <div
          className='custom-modal-content'
          style={contentStyle}
          ref={contentRef}
        >
          {title && (
            <div className='custom-modal-header'>
              <div className='custom-modal-title'>{title}</div>
              <button
                type='button'
                className='custom-modal-close'
                onClick={handleClose}
              >
                <CloseOutlined />
              </button>
            </div>
          )}
          <div className='custom-modal-body'>
            {children}
          </div>
          {footer !== null && footer !== undefined && (
            <div className='custom-modal-footer'>
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

Modal.displayName = 'Modal'

function createModalInstance (type, options) {
  const {
    title,
    content,
    okText = '确定',
    cancelText = '取消',
    onOk,
    onCancel,
    ...rest
  } = options

  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)

  const destroy = () => {
    if (root && container && container.parentNode) {
      root.unmount()
      document.body.removeChild(container)
    }
  }

  const handleOk = async () => {
    if (onOk) {
      const result = await onOk()
      if (result === false) {
        return
      }
    }
    destroy()
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    }
    destroy()
  }

  const hasCancel = type === 'confirm'

  const footer = (
    <div className='custom-modal-footer-buttons'>
      {hasCancel && (
        <button
          type='button'
          className='custom-modal-cancel-btn'
          onClick={handleCancel}
        >
          {cancelText}
        </button>
      )}
      <button
        type='button'
        className='custom-modal-ok-btn'
        onClick={handleOk}
      >
        {okText}
      </button>
    </div>
  )

  const modalProps = {
    ...rest,
    title,
    open: true,
    onCancel: hasCancel ? handleCancel : destroy,
    footer,
    children: content
  }

  root.render(<Modal {...modalProps} />)

  const update = (newOptions) => {
    const updatedOptions = { ...options, ...newOptions }
    const {
      title: newTitle,
      content: newContent,
      okText: newOkText = '确定',
      cancelText: newCancelText = '取消',
      onOk: newOnOk,
      onCancel: newOnCancel,
      ...newRest
    } = updatedOptions

    const newHandleOk = async () => {
      if (newOnOk) {
        const result = await newOnOk()
        if (result === false) {
          return
        }
      }
      destroy()
    }

    const newHandleCancel = () => {
      if (newOnCancel) {
        newOnCancel()
      }
      destroy()
    }

    const newFooter = (
      <div className='custom-modal-footer-buttons'>
        {hasCancel && (
          <button
            type='button'
            className='custom-modal-cancel-btn'
            onClick={newHandleCancel}
          >
            {newCancelText}
          </button>
        )}
        <button
          type='button'
          className='custom-modal-ok-btn'
          onClick={newHandleOk}
        >
          {newOkText}
        </button>
      </div>
    )

    const newModalProps = {
      ...newRest,
      title: newTitle,
      open: true,
      onCancel: hasCancel ? newHandleCancel : destroy,
      footer: newFooter,
      children: newContent
    }

    root.render(<Modal {...newModalProps} />)
  }

  return {
    destroy,
    update
  }
}

Modal.info = (options) => {
  return createModalInstance('info', options)
}

Modal.confirm = (options) => {
  return createModalInstance('confirm', options)
}
