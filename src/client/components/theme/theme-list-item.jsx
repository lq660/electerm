/**
 * theme list render
 */

import {
  PlusOutlined,
  SunOutlined,
  MoonOutlined
} from '@ant-design/icons'
import { Tag } from 'antd'
import classnames from 'classnames'
import { defaultTheme } from '../../common/theme-defaults'
import highlight from '../common/highlight'
import isColorDark from '../../common/is-color-dark'
import getThemeDisplayName from '../../common/get-theme-display-name'

export default function ThemeListItem (props) {
  const {
    item,
    activeItemId,
    theme,
    keyword
  } = props
  const { store } = window

  function handleClickTheme (event) {
    if (event.target.closest('.list-item-remove')) {
      return
    }
    props.onClickItem(item)
    if (item.id) {
      // 2026-07-13 coder(lq): Selecting an existing theme should apply it immediately; the former hover-only apply control was easy to miss.
      store.setTheme(item.id)
    }
  }

  function renderTag () {
    if (!id) {
      return null
    }
    const { main, text } = item.uiThemeConfig
    const isDark = isColorDark(main)
    const txt = isDark ? <MoonOutlined /> : <SunOutlined />
    return (
      <Tag
        color={main}
        className='mg1r'
        variant='solid'
        style={
          {
            color: text
          }
        }
      >
        {txt}
      </Tag>
    )
  }

  const { name, id, type } = item
  const cls = classnames(
    'item-list-unit theme-item',
    {
      current: theme === id
    },
    {
      active: activeItemId === id
    }
  )
  let title = getThemeDisplayName(item)
  title = highlight(
    title,
    keyword
  )

  return (
    <div
      className={cls}
      onClick={handleClickTheme}
    >
      <div className='elli pd1y pd2x' title={name}>
        {
          !id
            ? <PlusOutlined className='mg1r' />
            : null
        }
        {renderTag()}{title}
      </div>
      {
        id === defaultTheme().id || type === 'iterm'
          ? null
          : props.renderDelBtn(item)
      }
    </div>
  )
}
