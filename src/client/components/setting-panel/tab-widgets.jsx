import SettingCol from './col'
import WidgetControl from '../widgets/widget-control'
import WidgetList from '../widgets/widgets-list'
import {
  settingMap
} from '../../common/constants'

export default function TabWidgets (props) {
  const {
    settingTab
  } = props
  if (settingTab !== settingMap.widgets) {
    return null
  }
  const {
    settingItem,
    listProps,
    formProps
  } = props
  return (
    <div
      className='setting-tabs-profile setting-tabs-widgets'
    >
      <SettingCol
        className='cn-tools-template'
        leftTitle='工具列表'
        leftDesc='管理工作台辅助面板'
        rightTitle='工具配置'
        rightDesc='设置展示方式和启用状态'
      >
        <WidgetList
          {...listProps}
        />
        <WidgetControl
          {...formProps}
          key={settingItem.id}
        />
      </SettingCol>
    </div>
  )
}
