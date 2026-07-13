import classNames from 'classnames'
import { forwardRef } from 'react'
import { Tooltip } from 'antd'

export default forwardRef(function SideIcon (props, ref) {
  const {
    show,
    className,
    title = '',
    active,
    children,
    ...rest
  } = props
  if (show === false) {
    return null
  }
  const cls = classNames(className, 'control-icon-wrap', {
    active
  })
  const content = (
    <div
      {...rest}
      ref={ref}
      className={cls}
      aria-label={title || undefined}
    >
      {children}
    </div>
  )
  // 2026-07-12 coder(lq): The compact rail depends on immediate Chinese hover labels, especially after low-frequency actions are grouped.
  return title
    ? (
      <Tooltip title={title} placement='right' mouseEnterDelay={0.2}>
        {content}
      </Tooltip>
      )
    : content
})
