/**
 * hisotry/bookmark/setting modal
 */

import { auto } from 'manate/react'
import { pick } from 'lodash-es'
import { Tabs, Spin } from 'antd'
import { lazy, Suspense } from 'react'
import SettingModal from './setting-wrap'
import {
  settingMap,
  modals
} from '../../common/constants'
const TabBookmarks = lazy(() => import('./tab-bookmarks'))
const TabQuickCommands = lazy(() => import('./tab-quick-commands'))
const TabSettings = lazy(() => import('./tab-settings'))
const TabThemes = lazy(() => import('./tab-themes'))
const TabProfiles = lazy(() => import('./tab-profiles'))
const TabWidgets = lazy(() => import('./tab-widgets'))

const Loading = () => <div style={{ padding: 20, textAlign: 'center' }}><Spin /></div>

const cnTabLabels = {
  [settingMap.bookmarks]: '服务器管理',
  [settingMap.setting]: '系统设置',
  [settingMap.terminalThemes]: '终端主题',
  [settingMap.quickCommands]: '快捷命令',
  [settingMap.profiles]: '连接模板',
  [settingMap.widgets]: '工具面板'
}

const cnTabGroupMap = {
  resource: [settingMap.bookmarks],
  settings: [settingMap.setting],
  tools: [
    settingMap.terminalThemes,
    settingMap.quickCommands,
    settingMap.profiles,
    settingMap.widgets
  ]
}

function getCnTabGroup (settingTab) {
  return Object.keys(cnTabGroupMap).find(key => cnTabGroupMap[key].includes(settingTab)) || 'settings'
}

const cnPageMeta = {
  [settingMap.bookmarks]: {
    title: '服务器资源',
    desc: '维护服务器分组、连接详情、认证方式和远程访问入口',
    scope: '资源管理',
    badge: '连接配置',
    areaClass: 'cn-area-resource'
  },
  [settingMap.setting]: {
    title: '设置中心',
    desc: '只调整软件自身偏好、终端行为、同步、AI 和快捷键',
    scope: '系统配置',
    badge: '实时生效',
    areaClass: 'cn-area-settings'
  },
  [settingMap.terminalThemes]: {
    title: '终端主题',
    desc: '管理终端配色、字体显示和主题方案',
    scope: '外观配置',
    badge: '终端显示',
    areaClass: 'cn-area-tools'
  },
  [settingMap.quickCommands]: {
    title: '命令中心',
    desc: '管理常用脚本片段、快捷命令和执行模板',
    scope: '效率工具',
    badge: '命令模板',
    areaClass: 'cn-area-tools'
  },
  [settingMap.profiles]: {
    title: '连接模板',
    desc: '维护 SSH、SFTP、RDP 等连接的默认参数',
    scope: '模板配置',
    badge: '模板配置',
    areaClass: 'cn-area-tools'
  },
  [settingMap.widgets]: {
    title: '工具面板',
    desc: '管理右侧辅助工具、扩展面板和工作台能力',
    scope: '效率工具',
    badge: '扩展能力',
    areaClass: 'cn-area-tools'
  }
}

export default auto(function SettingModalWrap (props) {
  const selectItem = (item) => {
    window.store.setSettingItem(item)
  }

  function renderTabs () {
    const { store } = props
    const tabsShouldConfirmDel = [
      settingMap.bookmarks,
      settingMap.terminalThemes
    ]
    const { settingTab, settingItem, settingSidebarList, bookmarkSelectMode } = store
    const props0 = {
      store,
      activeItemId: settingItem.id,
      type: settingTab,
      onClickItem: selectItem,
      shouldConfirmDel: tabsShouldConfirmDel.includes(settingTab),
      list: settingSidebarList
    }
    const { bookmarks, bookmarkGroups, widgetInstances } = store
    const formProps = {
      store,
      formData: settingItem,
      type: settingTab,
      hide: store.hideSettingModal,
      ...pick(store, [
        'currentBookmarkGroupId',
        'config'
      ]),
      bookmarkGroups,
      bookmarks,
      widgetInstancesLength: widgetInstances.length,
      serials: store.serials,
      loaddingSerials: store.loaddingSerials
    }
    const treeProps = {
      ...props0,
      bookmarkSelectMode,
      bookmarkGroups,
      bookmarkGroupTree: store.bookmarkGroupTree,
      bookmarksMap: store.bookmarksMap,
      bookmarks,
      ...pick(store, [
        'currentBookmarkGroupId',
        'config',
        'checkedKeys',
        'expandedKeys',
        'leftSidebarWidth',
        'initLoadingData'
      ])
    }
    // 2026-07-04 coder(lq): Keep navigation task-oriented for Chinese ops users; resource, settings, and tools should not be mixed in one global tab row.
    const group = getCnTabGroup(settingTab)
    const visibleTabs = cnTabGroupMap[group]
    const items = visibleTabs.map(key => ({
      key,
      label: key === settingMap.widgets
        ? <>{cnTabLabels[key]} <sup>试用</sup></>
        : cnTabLabels[key],
      children: null
    }))
    const tabsProps = {
      activeKey: settingTab,
      animated: false,
      items,
      onChange: store.handleChangeSettingTab,
      destroyOnHidden: true,
      className: `setting-tabs cn-setting-tabs-${group} ${visibleTabs.length === 1 ? 'cn-setting-tabs-single' : ''}`,
      type: 'card'
    }
    return (
      <>
        <Tabs
          {...tabsProps}
        />
        <Suspense fallback={<Loading />}>
          <TabQuickCommands
            listProps={props0}
            settingItem={settingItem}
            formProps={formProps}
            store={store}
            settingTab={settingTab}
          />
          <TabBookmarks
            treeProps={treeProps}
            settingItem={settingItem}
            formProps={formProps}
            settingTab={settingTab}
          />
          <TabSettings
            listProps={props0}
            settingItem={settingItem}
            settingTab={settingTab}
            store={store}
          />
          <TabThemes
            listProps={props0}
            settingItem={settingItem}
            formProps={formProps}
            store={store}
            settingTab={settingTab}
          />
          <TabProfiles
            listProps={props0}
            settingItem={settingItem}
            formProps={formProps}
            store={store}
            settingTab={settingTab}
          />
          <TabWidgets
            listProps={props0}
            settingItem={settingItem}
            formProps={formProps}
            store={store}
            settingTab={settingTab}
          />
        </Suspense>
      </>
    )
  }

  const {
    showModal,
    hideSettingModal,
    innerWidth,
    useSystemTitleBar
  } = props.store
  const show = showModal === modals.setting
  if (!show) {
    return null
  }
  return (
    <SettingModal
      onCancel={hideSettingModal}
      visible={show}
      useSystemTitleBar={useSystemTitleBar}
      innerWidth={innerWidth}
      pageMeta={cnPageMeta[props.store.settingTab]}
    >
      {renderTabs()}
    </SettingModal>
  )
})
