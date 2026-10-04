import { memo } from 'react'

import {
  CaretDownOutlined,
  CaretRightOutlined
} from '@ant-design/icons'

function areEqual (prevProps, nextProps) {
  return prevProps.group?.id === nextProps.group?.id &&
    prevProps.hasChildren === nextProps.hasChildren &&
    prevProps.shouldOpen === nextProps.shouldOpen
}

function TreeExpander (props) {
  const { group } = props

  function onExpand (e) {
    e.stopPropagation()
    props.onExpand(group)
  }

  function onUnExpand (e) {
    e.stopPropagation()
    props.onUnExpand(group)
  }

  if (!props.hasChildren) {
    return null
  }

  const shouldOpen = props.shouldOpen
  const Icon = shouldOpen
    ? CaretDownOutlined
    : CaretRightOutlined
  const func = shouldOpen
    ? onUnExpand
    : onExpand
  return (
    <button
      type='button'
      className='tree-expander pointer'
      aria-label={shouldOpen ? '折叠' : '展开'}
      title={shouldOpen ? '折叠' : '展开'}
      onClick={func}
    >
      <Icon />
    </button>
  )
}

export default memo(TreeExpander, areEqual)
