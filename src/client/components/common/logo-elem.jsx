import {
  packInfo
} from '../../common/constants'
import { Tag } from 'antd'
import './logo.styl'

export default function LogoElem () {
  return (
    <h1 className='mg3y cn-logo-title'>
      <span className='iblock morph-shape cn-logo-mark mg1l mg1r'>
        云
      </span>
      <span className='cn-logo-name'>云舵工作台</span>
      <Tag color='#08c' variant='solid'>{packInfo.version}</Tag>
    </h1>
  )
}
