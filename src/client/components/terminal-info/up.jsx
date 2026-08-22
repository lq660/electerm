/**
 * up time info
 */

import { ClockCircleOutlined } from '@ant-design/icons'

export default function TerminalInfoUp (props) {
  const { uptime, isRemote, terminalInfos } = props
  if (!isRemote || !terminalInfos.includes('uptime')) {
    return null
  }
  return (
    <div className='terminal-info-section terminal-info-up'>
      <div className='terminal-info-section-title'><ClockCircleOutlined /> 运行时长</div>
      <div className='terminal-info-line'>{uptime}</div>
    </div>
  )
}
