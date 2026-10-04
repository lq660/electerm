/**
 * btns
 */

import { CloseOutlined, MinusOutlined } from '@ant-design/icons'
import { auto } from 'manate/react'
import {
  isMacJs
} from '../../common/constants'

const e = window.translate

export default auto(function WindowControl (props) {
  const {
    isMaximized,
    config
  } = props.store
  if (config.useSystemTitleBar || isMacJs) {
    return null
  }
  const minimize = () => {
    window.pre.runGlobalAsync('minimize')
  }
  const maximize = () => {
    window.pre.runGlobalAsync('maximize')
    window.store.isMaximized = true
  }
  const unmaximize = () => {
    window.pre.runGlobalAsync('unmaximize')
    window.store.isMaximized = false
  }
  const closeApp = () => {
    window.store.exit()
  }
  return (
    <div className='window-controls'>
      <button type='button' aria-label={e('minimize')} title={e('minimize')} className='window-control-box window-control-minimize' onClick={minimize}>
        <MinusOutlined className='iblock font12 widnow-control-icon' />
      </button>
      <button
        type='button'
        aria-label={isMaximized ? e('unmaximize') : e('maximize')}
        title={isMaximized ? e('unmaximize') : e('maximize')}
        className='window-control-box window-control-maximize'
        onClick={
          isMaximized ? unmaximize : maximize
        }
      >
        <span className={
            'iblock font12 icon-maximize widnow-control-icon ' +
              (isMaximized ? 'is-max' : 'not-max')
          }
        />
      </button>
      <button type='button' aria-label={e('close')} title={e('close')} className='window-control-box window-control-close' onClick={closeApp}>
        <CloseOutlined className='iblock font12 widnow-control-icon' />
      </button>
    </div>
  )
})
