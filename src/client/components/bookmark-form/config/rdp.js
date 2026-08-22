import { formItemLayout } from '../../../common/form-layout.js'
import { terminalRdpType } from '../../../common/constants.js'
import { createBaseInitValues, getAuthTypeDefault } from '../common/init-values.js'
import { isEmpty } from 'lodash-es'
import { commonFields, connectionHoppingTab } from './common-fields.js'

const e = window.translate

const rdpConfig = {
  key: 'rdp',
  type: terminalRdpType,
  initValues: (props) => {
    return createBaseInitValues(props, terminalRdpType, {
      port: 3389,
      connectionHoppings: [],
      ...getAuthTypeDefault(props)
    })
  },
  layout: formItemLayout,
  tabs: () => [
    {
      key: 'auth',
      label: e('auth'),
      fields: [
        {
          type: 'wiki',
          name: 'rdp-limitation-warning',
          link: 'https://github.com/electerm/electerm/wiki/RDP-limitation'
        },
        commonFields.category,
        commonFields.colorTitle,
        { type: 'input', name: 'host', label: () => e('host'), rules: [{ required: true, message: '请输入主机地址' }] },
        commonFields.port,
        { type: 'profileItem', name: '__profile__', label: '', profileFilter: d => !isEmpty(d.rdp) },
        { ...commonFields.username, rules: [{ required: true, message: '请输入用户名' }] },
        { ...commonFields.password, rules: [{ required: true, message: '请输入密码' }] },
        commonFields.description,
        { type: 'input', name: 'domain', label: () => e('domain') },
        commonFields.proxy,
        commonFields.type
      ]
    },
    connectionHoppingTab()
  ]
}

export default rdpConfig
