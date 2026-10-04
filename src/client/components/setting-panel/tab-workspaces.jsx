import { auto } from 'manate/react'
import { settingMap } from '../../common/constants'
import LayoutSelect from '../tabs/layout-select'
import WorkspaceSelect from '../tabs/workspace-select'

export default auto(function TabWorkspaces ({ settingTab, store }) {
  if (settingTab !== settingMap.workspaces) {
    return null
  }

  return (
    <div className='cn-setting-detail-form cn-workspaces-settings'>
      <section className='cn-settings-section'>
        <div className='cn-settings-section-title'>窗口布局</div>
        <div className='cn-settings-help-line'>选择当前工作台的分屏方式，修改后立即生效。</div>
        <div className='cn-settings-section-body'>
          <LayoutSelect layout={store.layout} />
        </div>
      </section>
      <section className='cn-settings-section'>
        <div className='cn-settings-section-title'>工作区</div>
        <div className='cn-settings-help-line'>保存并恢复当前布局及各分屏中的服务器连接。</div>
        <div className='cn-settings-section-body'>
          <WorkspaceSelect store={store} />
        </div>
      </section>
    </div>
  )
})
