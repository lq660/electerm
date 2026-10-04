/**
 * Simple drawer component without animation
 * Replaces antd Drawer for better performance
 */

import classnames from 'classnames'
import { useEffect, useRef } from 'react'
import './drawer.styl'

export default function Drawer (props) {
  const {
    open,
    placement = 'left',
    size,
    zIndex = 1000,
    variant = 'drawer',
    ariaLabelledBy,
    className,
    children,
    styles = {},
    onClose
  } = props
  const contentRef = useRef(null)

  function handleMaskClick (e) {
    if (e.target === e.currentTarget && onClose) {
      onClose()
    }
  }

  useEffect(() => {
    if (!open || !onClose) {
      return undefined
    }

    // 2026-08-30 coder(lq): Let every drawer close from Escape while yielding to a visible child modal.
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) {
        return
      }
      onClose()
      e.preventDefault()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open || variant !== 'modal') {
      return undefined
    }

    // 2026-09-22 coder(lq): Focus the modal surface on open and return focus on close so keyboard users never get stranded behind the overlay.
    const previouslyFocused = document.activeElement
    const frame = window.requestAnimationFrame(() => {
      contentRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [open, variant])

  if (!open) {
    return null
  }

  const drawerStyle = {
    zIndex
  }

  const contentStyle = {
    width: typeof size === 'number' ? `${size}px` : size,
    ...styles.content
  }

  const cls = classnames(
    'custom-drawer',
    `custom-drawer-${placement}`,
    `custom-drawer-${variant}`,
    className
  )

  return (
    <div className={cls} style={drawerStyle}>
      <div
        className='custom-drawer-mask'
        onClick={handleMaskClick}
      />
      <div
        ref={contentRef}
        className='custom-drawer-content-wrapper'
        style={contentStyle}
        role={variant === 'modal' ? 'dialog' : undefined}
        aria-modal={variant === 'modal' ? 'true' : undefined}
        aria-labelledby={variant === 'modal' ? ariaLabelledBy : undefined}
        tabIndex={variant === 'modal' ? -1 : undefined}
      >
        <div className='custom-drawer-content'>
          {children}
        </div>
      </div>
    </div>
  )
}
