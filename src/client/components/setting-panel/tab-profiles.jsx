import SettingCol from './col'
import ProfileForm from '../profile/profile-form'
import ProfileList from '../profile/profile-list'
import {
  settingMap
} from '../../common/constants'

export default function TabProfiles (props) {
  const {
    settingTab
  } = props
  if (settingTab !== settingMap.profiles) {
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
      className='setting-tabs-profile'
    >
      <SettingCol
        className='cn-tools-template'
        leftTitle='模板列表'
        leftDesc='复用连接默认配置'
        rightTitle='模板详情'
        rightDesc='编辑协议参数和默认行为'
      >
        <ProfileList
          {...listProps}
          quickCommandId={store.quickCommandId}
        />
        <ProfileForm
          {...formProps}
          quickCommandTags={store.quickCommandTags}
          key={settingItem.id}
        />
      </SettingCol>
    </div>
  )
}
