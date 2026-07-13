import {
  CheckCircleOutlined
} from '@ant-design/icons'
import createName from '../../common/create-title'

export default function BatchInputTabItem (props) {
  function handleSelect (id) {
    props.onSelect(
      props.id
    )
  }

  const { tab, selected, isCurrent } = props
  const title = createName(tab)
  const btnProps = {
    className: `batch-tab-select-item${selected ? ' selected' : ''}${isCurrent ? ' current' : ''}`,
    onClick: handleSelect,
    title,
    type: 'button'
  }
  const icon = selected ? <CheckCircleOutlined /> : <span className='batch-tab-select-check' />
  return (
    <button
      {...btnProps}
    >
      {icon}
      <span className='batch-tab-select-name'>
        <b>{tab.tabCount}. {title}</b>
        {isCurrent ? <em>当前终端</em> : null}
      </span>
    </button>
  )
}
