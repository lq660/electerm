import {
  Checkbox
} from 'antd'

export default function DataSelectItem (props) {
  const {
    title,
    checked,
    value,
    onChange
  } = props
  const boxProps = {
    checked,
    className: 'cn-sync-data-option',
    onChange,
    'data-key': value
  }
  return (
    <Checkbox
      key={value}
      {...boxProps}
    >
      {title}
    </Checkbox>
  )
}
