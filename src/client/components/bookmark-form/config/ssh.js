// SSH config using common fields
import { formItemLayout } from '../../../common/form-layout.js'
import { connectionMap, authTypeMap, defaultEnvLang } from '../../../common/constants.js'
import defaultSetting from '../../../common/default-setting.js'
import { createBaseInitValues, getTerminalDefaults, getSshDefaults, getTerminalBackgroundDefaults, getAuthTypeDefault } from '../common/init-values.js'
import { sshAuthFields, sshSettings, quickCommandsTab, sshTunnelTab, connectionHoppingTab } from './common-fields.js'

const sshConfig = {
  key: connectionMap.ssh,
  type: connectionMap.ssh,
  initValues: (props) => {
    const { store } = props
    return createBaseInitValues(props, connectionMap.ssh, {
      port: 22,
      authType: authTypeMap.password,
      id: '',
      envLang: defaultEnvLang,
      enableSftp: true,
      sshTunnels: [],
      connectionHoppings: [],
      useSshAgent: true,
      sshAgent: '',
      serverHostKey: [],
      cipher: [],
      compress: [],
      ...getTerminalDefaults(store),
      ...getSshDefaults(),
      ...getTerminalBackgroundDefaults(defaultSetting),
      ...getAuthTypeDefault(props)
    })
  },
  layout: formItemLayout,
  tabs: () => [
    {
      key: 'auth',
      label: '基础信息',
      fields: sshAuthFields
    },
    {
      key: 'settings',
      label: '高级设置',
      fields: sshSettings
    },
    quickCommandsTab(),
    sshTunnelTab(),
    connectionHoppingTab()
  ]
}
export default sshConfig
