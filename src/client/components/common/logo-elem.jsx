import {
  packInfo
} from '../../common/constants'
import { Tag } from 'antd'
import YunduoLogo from '../icons/yunduo-logo.jsx'
import './logo.styl'

export default function LogoElem () {
  return (
    <h1 className='mg3y cn-logo-title'>
      <span className='iblock morph-shape cn-logo-mark mg1l mg1r'>
        <YunduoLogo className='cn-logo-mark-icon' />
      </span>
      <span className='cn-logo-name'>云舵工作台</span>
      <Tag color='#08c' variant='solid'>{packInfo.version}</Tag>
    </h1>
  )
}
