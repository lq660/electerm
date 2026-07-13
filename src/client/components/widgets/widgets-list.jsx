/**
 * widgets list
 */
import React, { useState, useEffect } from 'react'
import {
  Input,
  Tabs
} from 'antd'
import WidgetInstances from './widget-instances'
import classnames from 'classnames'
import highlight from '../common/highlight'
import {
  auto
} from 'manate/react'
import { getWidgetTitle } from './widget-i18n'

const e = window.translate

export default auto(function WidgetsList ({ activeItemId, store }) {
  const { widgetInstances } = store
  const [tab, setTab] = useState('widgets') // or instances
  const [widgets, setWidgets] = useState([])
  const [keyword, setKeyword] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true)
    }, 200)
    loadWidgets()
    return () => {
      clearTimeout(timer)
    }
  }, [])

  const loadWidgets = async () => {
    try {
      const widgets = await window.store.listWidgets()
      setWidgets(widgets)
    } catch (error) {
      console.error('Failed to load widgets:', error)
    }
  }

  const handleSearch = (e) => {
    setKeyword(e.target.value)
  }

  const handleTabChange = (key) => {
    setTab(key)
  }

  const onClickWidget = (widget) => {
    window.store.setSettingItem(widget)
  }

  const renderWidgetItem = (widget, i) => {
    const title = getWidgetTitle(widget)
    const tag = ''
    const cls = classnames(
      'item-list-unit',
      {
        active: activeItemId === widget.id
      }
    )
    const titleHighlight = highlight(
      title,
      keyword
    )
    return (
      <div
        key={widget.id}
        className={cls}
        onClick={() => onClickWidget(widget)}
      >
        <div
          title={title}
          className='elli pd1y pd2x list-item-title'
        >
          {tag}{titleHighlight || e('new')}
        </div>
      </div>
    )
  }

  const renderWidgetsList = () => {
    const filteredWidgets = keyword
      ? widgets.filter(widget => {
        const title = getWidgetTitle(widget)
        return title.toLowerCase().includes(keyword.toLowerCase()) ||
          widget.info.name.toLowerCase().includes(keyword.toLowerCase())
      })
      : widgets

    return (
      <div className='item-list item-type-widgets'>
        <div className='pd1y'>
          <Input.Search
            type='text'
            placeholder='搜索工具...'
            value={keyword}
            onChange={handleSearch}
            className='form-control'
          />
        </div>
        <div className='item-list-wrap pd1y'>
          {filteredWidgets.map(renderWidgetItem)}
        </div>
      </div>
    )
  }

  const renderTabs = () => {
    const items = [
      {
        key: 'widgets',
        label: '工具库',
        children: null
      },
      {
        key: 'instances',
        label: `运行中 (${widgetInstances.length})`,
        children: null
      }
    ]
    return (
      <Tabs
        activeKey={tab}
        onChange={handleTabChange}
        items={items}
      />
    )
  }

  const renderInstancesSection = () => {
    return (
      <WidgetInstances
        widgetInstances={widgetInstances}
      />
    )
  }

  if (!ready) {
    return null
  }

  return (
    <div className='cn-widgets-list'>
      {renderTabs()}
      <div className='pd2x pd1y'>
        {
          tab === 'widgets'
            ? renderWidgetsList()
            : renderInstancesSection()
        }
      </div>
    </div>
  )
})
