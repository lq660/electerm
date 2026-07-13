import SettingCol from './col'
import BookmarkForm from '../bookmark-form'
import TreeList from './bookmark-tree-list'
import {
  settingMap
} from '../../common/constants'

export default function TabBookmarks (props) {
  const {
    settingTab
  } = props
  if (settingTab !== settingMap.bookmarks) {
    return null
  }
  const {
    settingItem,
    treeProps,
    formProps
  } = props
  return (
    <div
      className='setting-tabs-bookmarks'
    >
      <SettingCol
        className='cn-resource-master-template'
        leftTitle='服务器资源'
        leftDesc='按分组管理连接'
        rightTitle='连接详情'
        rightDesc='维护协议、账号、认证和高级参数'
      >
        <div className='model-bookmark-tree-wrap'>
          <TreeList
            {...treeProps}
          />
        </div>
        <BookmarkForm
          key={settingItem.id}
          {...formProps}
        />
      </SettingCol>
    </div>
  )
}
