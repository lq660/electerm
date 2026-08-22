import { auto } from 'manate/react'
import Layouts from './layouts'
import TabsWrap from '../tabs/index'
import {
  splitConfig,
  quickCommandBoxHeight,
  footerHeight
} from '../../common/constants'
import layoutAlg from './layout-alg'
import calcSessionSize from './session-size-alg'
import TermSearch from '../terminal/term-search'
import Footer from '../footer/footer-entry'
import SessionsWrap from '../session/sessions'
import QuickCommandsFooterBox from '../quick-commands/quick-commands-box'
import pixed from './pixed'
import { pick } from 'lodash-es'
import {
  getHandleOrientation,
  getLayoutRatios,
  getRatioIndex
} from './layout-ratios'
import './layout.styl'

export default auto(function Layout (props) {
  const { store } = props
  const {
    layout, config, currentTab
  } = store
  const conf = splitConfig[layout]

  const handleMousedown = (e) => {
    e.preventDefault()
    const handleIndex = Number(e.currentTarget.dataset.index)
    const orientation = getHandleOrientation(layout, handleIndex)
    if (!orientation) return
    const rect = e.currentTarget.parentElement.getBoundingClientRect()
    const axis = orientation === 'vertical' ? 'x' : 'y'
    const ratioIndex = getRatioIndex(layout, handleIndex, orientation)

    // 2026-07-12 coder(lq): Divider movement updates both visible pane geometry and terminal canvas sizes through one ratio source.
    const handleMousemove = (event) => {
      const raw = axis === 'x'
        ? (event.clientX - rect.left) * 100 / rect.width
        : (event.clientY - rect.top) * 100 / rect.height
      const current = getLayoutRatios(layout, store.layoutSplitRatios[layout])
      const points = [...current[axis]]
      const minimum = ratioIndex > 0 ? points[ratioIndex - 1] + 15 : 15
      const maximum = ratioIndex < points.length - 1 ? points[ratioIndex + 1] - 15 : 85
      points[ratioIndex] = Math.min(maximum, Math.max(minimum, raw))
      store.layoutSplitRatios = {
        ...store.layoutSplitRatios,
        [layout]: {
          ...current,
          [axis]: points
        }
      }
    }
    const handleMouseup = () => {
      document.removeEventListener('mousemove', handleMousemove)
      document.removeEventListener('mouseup', handleMouseup)
      store.triggerResize()
    }
    document.addEventListener('mousemove', handleMousemove)
    document.addEventListener('mouseup', handleMouseup)
  }

  const getFooterOffset = () => {
    // 2026-07-04 coder(lq): Terminal auxiliary controls moved into the session side panel, so terminal workspaces should not reserve bottom footer space.
    return props.store.inActiveTerminal ? 0 : footerHeight
  }

  const calcLayoutStyle = () => {
    const {
      width,
      height,
      pinnedQuickCommandBar,
      // tabsHeight,
      leftSidebarWidth,
      // infoPanelPinned,
      pinned,
      rightPanelVisible,
      rightPanelPinned,
      rightPanelWidth,
      resizeTrigger,
      inActiveTerminal
    } = props.store
    const h = height - getFooterOffset() - (inActiveTerminal && pinnedQuickCommandBar ? quickCommandBoxHeight : 0) + resizeTrigger
    const l = pinned ? 43 + leftSidebarWidth : 43
    const r = rightPanelVisible && rightPanelPinned ? rightPanelWidth : 0
    return {
      height: h,
      top: 0,
      left: l,
      width: width - l - r
    }
  }

  const buildLayoutStyles = () => {
    const {
      layout,
      height,
      width,
      pinnedQuickCommandBar,
      leftSidebarWidth,
      rightPanelVisible,
      rightPanelPinned,
      rightPanelWidth,
      pinned
    } = props.store
    const l = pinned ? leftSidebarWidth : 0
    const r = rightPanelPinned && rightPanelVisible ? rightPanelWidth : 0
    const w = width - l - r - 42
    const h = height - getFooterOffset() - (pinnedQuickCommandBar ? quickCommandBoxHeight : 0)
    return layoutAlg(layout, w, h, props.store.layoutSplitRatios[layout])
  }
  const layoutSize = calcLayoutStyle()
  const {
    width,
    height
  } = layoutSize
  const pixedLayoutStyle = pixed(layoutSize)
  const styles = buildLayoutStyles(conf, layout)
  const layoutProps = {
    layout,
    ...styles,
    layoutStyle: pixedLayoutStyle,
    handleMousedown
  }
  const sizes = calcSessionSize(
    layout,
    width,
    height,
    store.layoutSplitRatios[layout]
  )

  function renderSessions (conf, layout) {
    const {
      store
    } = props
    const { tabs } = store
    const tabsBatch = {}
    for (const tab of tabs) {
      const { batch } = tab
      if (!tabsBatch[batch]) {
        tabsBatch[batch] = []
      }
      tabsBatch[batch].push(tab)
    }
    return sizes.map((v, i) => {
      const sessProps = {
        batch: i,
        layout,
        currentBatchTabId: store[`activeTabId${i}`],
        ...v,
        tabs: tabsBatch[i] || [],
        ...pick(store, [
          'isMaximized',
          'config',
          'resolutions',
          'hideDelKeyTip',
          'fileOperation',
          'pinnedQuickCommandBar',
          'tabsHeight',
          'appPath',
          'leftSidebarWidth',
          'addPanelWidth',
          'pinned',
          'openedSideBar'
        ])
      }
      return (
        <TabsWrap
          key={'sess' + i}
          {...sessProps}
        />
      )
    })
  }

  const termProps = {
    currentTab,
    config,
    ...pick(store, [
      'activeTabId',
      'termSearchOpen',
      'termSearch',
      'termSearchOptions',
      'termSearchMatchCount',
      'termSearchMatchIndex'
    ])
  }
  const footerProps = {
    store
  }
  const qmProps = pick(store, [
    'quickCommandTags',
    'qmSortByFrequency',
    'openQuickCommandBar',
    'pinnedQuickCommandBar',
    'qmSortByFrequency',
    'inActiveTerminal',
    'leftSidebarWidth',
    'openedSideBar',
    'currentQuickCommands'
  ])
  const sessionsProps = {
    styles: styles.wrapStyles,
    sizes,
    width,
    height,
    layoutStyle: pixedLayoutStyle,
    ...pick(store, [
      'activeTabId',
      'activeTabId0',
      'activeTabId1',
      'activeTabId2',
      'activeTabId3',
      'batch',
      'resolutions',
      'hideDelKeyTip',
      'fileOperation',
      'file',
      'pinnedQuickCommandBar',
      'tabsHeight',
      'appPath',
      'leftSidebarWidth',
      'pinned',
      'openedSideBar',
      'config',
      'fullscreen',
      'fileTransfers',
      'transferHistory',
      'transferTab'
    ]),
    tabs: store.tabs,
    layout
  }
  return [
    <Layouts {...layoutProps} key='layouts'>
      {renderSessions(conf, layout)}
    </Layouts>,
    <SessionsWrap key='SessionsWrap' {...sessionsProps} />,
    <TermSearch
      key='TermSearch'
      {...termProps}
    />,
    <QuickCommandsFooterBox
      key='QuickCommandsFooterBox'
      {...qmProps}
    />,
    <Footer
      key='Footer'
      {...footerProps}
    />
  ]
})
