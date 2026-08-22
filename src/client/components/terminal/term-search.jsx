import { PureComponent } from 'react'
import {
  Tooltip
} from 'antd'
import InputAutoFocus from '../common/input-auto-focus'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import { paneMap } from '../../common/constants'
import { MatchCaseIcon } from '../icons/match-case'
import { MatchWholWordIcon } from '../icons/match-whole-word'
import { RegularExpIcon } from '../icons/regular-exp'
import classNames from 'classnames'
import copy from 'json-deep-copy'
import { refsStatic, refs } from '../common/ref'
import { resolveTerminalId } from '../../common/active-terminal'
import './term-search.styl'

const e = window.translate

export default class TermSearch extends PureComponent {
  searchControls = [{
    id: 'matchCase',
    icon: MatchCaseIcon,
    prop: 'caseSensitive'
  }, {
    id: 'matchWholeWord',
    icon: MatchWholWordIcon,
    prop: 'wholeWord'
  }, {
    id: 'useRegExp',
    icon: RegularExpIcon,
    prop: 'regex'
  }]

  searchActions = [{
    id: 'prev',
    icon: ArrowLeftOutlined,
    label: '上一个匹配项'
  }, {
    id: 'next',
    icon: ArrowRightOutlined,
    label: '下一个匹配项'
  }, {
    id: 'close',
    icon: CloseCircleOutlined,
    label: '关闭搜索'
  }]

  componentDidMount () {
    refsStatic.add('term-search', this)
  }

  toggleSearch = () => {
    const isClosing = this.props.termSearchOpen
    if (isClosing) {
      this.clearSearch()
    }
    window.store.toggleTerminalSearch()
    if (isClosing) {
      setTimeout(window.store.focus, 200)
    }
  }

  prev = () => {
    const {
      termSearchOptions
    } = this.props
    refs.get('term-' + this.getActiveTerminalId())
      ?.searchPrev(
        this.props.termSearch,
        copy(termSearchOptions)
      )
  }

  next = () => {
    refs.get('term-' + this.getActiveTerminalId())
      ?.searchNext(
        this.props.termSearch,
        copy(this.props.termSearchOptions)
      )
  }

  handleChange = e => {
    const v = e.target.value
    window.store.termSearch = v
    this.prev(v)
  }

  clearSearch = () => {
    const term = refs.get('term-' + this.getActiveTerminalId())
    if (!term) {
      return
    }
    term.searchAddon.clearDecorations()
    term.setState({
      searchResults: [],
      matchIndex: -1
    })
  }

  getActiveTerminalId = () => {
    // 2026-07-11 coder(lq): Session child tabs have their own terminal IDs; search must target the visible child terminal instead of the outer connection tab.
    return resolveTerminalId(this.props.activeTabId)
  }

  close = () => {
    this.clearSearch()
    window.store.termSearchOpen = false
  }

  renderSearchAction = item => {
    const {
      id,
      icon: Icon,
      label
    } = item
    const props = {
      onClick: this[id],
      className: `term-search-act term-search-action-${id}`
    }
    return (
      <Tooltip key={id} title={label}>
        <Icon {...props} />
      </Tooltip>
    )
  }

  renderMatchData = () => {
    const {
      termSearchMatchCount,
      termSearchMatchIndex
    } = this.props
    if (!termSearchMatchCount) {
      return null
    }
    return <span className='term-search-match-count'>{termSearchMatchIndex + 1} / {termSearchMatchCount}</span>
  }

  renderAfter = () => {
    return (
      <>
        {
          this.renderMatchData()
        }
        {
          this.searchActions.map(this.renderSearchAction)
        }
      </>
    )
  }

  toggle = prop => {
    const {
      termSearchOptions
    } = this.props
    const v = termSearchOptions[prop]
    window.store.setTermSearchOption({
      [prop]: !v
    })
    this.next()
  }

  renderSearchControl = (item) => {
    const {
      id,
      icon: Icon,
      prop
    } = item
    const v = this.props.termSearchOptions[prop]
    const cls = classNames('term-search-opt-icon', {
      'term-search-on': v
    })
    return (
      <Tooltip
        key={id}
        title={e(id)}
      >
        <Icon
          className={cls}
          onClick={() => this.toggle(prop)}
        />
      </Tooltip>
    )
  }

  renderSuffix = () => {
    return (
      <>
        {
          this.searchControls.map(this.renderSearchControl)
        }
      </>
    )
  }

  render () {
    const {
      termSearchOpen,
      termSearch,
      currentTab
    } = this.props
    if (
      !termSearchOpen ||
      !currentTab ||
      currentTab.pane === paneMap.fileManager
    ) {
      return null
    }
    const props = {
      value: termSearch,
      className: 'iblock',
      onChange: this.handleChange,
      suffix: <>{this.renderSuffix()} {this.renderAfter()}</>,
      onPressEnter: this.next,
      placeholder: '搜索当前终端内容',
      selectall: true
    }
    return (
      <div className='term-search-wrap'>
        <InputAutoFocus
          {...props}
        />
      </div>
    )
  }
}
