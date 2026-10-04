import { StopOutlined } from '@ant-design/icons'

export default function AIStopIcon (props) {
  return (
    <button
      type='button'
      className='ai-stop-icon-square mg1l pointer'
      onClick={props.onClick}
      title={props.title || 'Stop AI request'}
      aria-label={props.title || 'Stop AI request'}
    >
      <StopOutlined />
    </button>
  )
}
