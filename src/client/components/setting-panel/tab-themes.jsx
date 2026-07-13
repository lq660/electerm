import SettingCol from './col'
import TerminalThemeForm from '../theme/theme-form'
import TerminalThemeList from '../theme/theme-list'
import {
  settingMap
} from '../../common/constants'

export default function TabThemes (props) {
  const {
    settingTab
  } = props
  if (settingTab !== settingMap.terminalThemes) {
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
      className='setting-tabs-terminal-themes'
    >
      <SettingCol
        className='cn-tools-template'
        leftTitle='主题列表'
        leftDesc='选择或新增终端主题'
        rightTitle='主题配置'
        rightDesc='编辑配色、字体和显示效果'
      >
        <TerminalThemeList
          {...listProps}
          theme={store.config.theme}
        />
        <TerminalThemeForm {...formProps} key={settingItem.id} />
      </SettingCol>
    </div>
  )
}
