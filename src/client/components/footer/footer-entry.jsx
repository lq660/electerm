import { auto } from 'manate/react'
import { InfoCircleOutlined } from '@ant-design/icons'
import './footer.styl'
import { statusMap } from '../../common/constants'
import CmdHistory from './cmd-history'

export default auto(function FooterEntry (props) {
  function handleInfoPanel () {
    window.store.openInfoPanel()
  }

  function isLoading () {
    const { currentTab } = props.store
    if (!currentTab) {
      return true
    }
    const {
      status
    } = currentTab
    return status !== statusMap.success
  }

  function renderInfoIcon () {
    const loading = isLoading()
    if (loading) {
      return null
    }
    return (
      <div className='terminal-footer-unit terminal-footer-info'>
        <InfoCircleOutlined
          onClick={handleInfoPanel}
          className='pointer font18 terminal-info-icon'
        />
      </div>
    )
  }

  function renderCmdHistory () {
    return (
      <div className='terminal-footer-unit terminal-footer-history'>
        <CmdHistory store={props.store} />
      </div>
    )
  }

  const {
    leftSidebarWidth,
    openedSideBar,
    inActiveTerminal
  } = props.store
  const w = 43 + leftSidebarWidth
  const sideProps = openedSideBar
    ? {
        className: 'main-footer',
        style: {
          left: `${w}px`
        }
      }
    : {
        className: 'main-footer'
      }
  if (
    inActiveTerminal
  ) {
    return null
  }
  return (
    <div {...sideProps}>
      <div className='terminal-footer-flex'>
        {renderCmdHistory()}
        {renderInfoIcon()}
      </div>
    </div>
  )
})
