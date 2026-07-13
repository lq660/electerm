import SettingCol from './col'
import QuickCommandsList from '../quick-commands/quick-commands-list'
import QuickCommandsForm from '../quick-commands/quick-commands-form'
import {
  settingMap
} from '../../common/constants'

export default function TabQuickCommands (props) {
  const {
    settingTab
  } = props
  if (settingTab !== settingMap.quickCommands) {
    return null
  }
  const {
    settingItem,
    listProps,
    formProps,
    store
  } = props
  return (
    <div
      className='setting-tabs-quick-commands'
    >
      <SettingCol
        className='cn-tools-template'
        leftTitle='命令列表'
        leftDesc='维护常用脚本片段'
        rightTitle='命令详情'
        rightDesc='编辑命令内容、标签和执行方式'
      >
        <QuickCommandsList
          {...listProps}
          quickCommandId={store.quickCommandId}
        />
        <QuickCommandsForm
          {...formProps}
          quickCommandTags={store.quickCommandTags}
          key={settingItem.id}
        />
      </SettingCol>
    </div>
  )
}
