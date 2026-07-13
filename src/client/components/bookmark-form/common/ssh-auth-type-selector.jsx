import { Radio, Form } from 'antd'
import { authTypeMap } from '../../../common/constants'
import { formItemLayout } from '../../../common/form-layout'

const authTypes = Object.keys(authTypeMap).map(k => {
  return k
})
const RadioButton = Radio.Button
const RadioGroup = Radio.Group
const e = window.translate
const FormItem = Form.Item

export default function SshAuthTypeSelector ({ handleChangeAuthType, filterAuthType = a => a, value, ...props }) {
  const authTypesFiltered = authTypes.filter(filterAuthType)
  const cnLabels = {
    password: '密码',
    privateKey: '私钥/证书',
    profiles: '配置文件'
  }
  return (
    <FormItem
      {...formItemLayout}
      className='mg1b cn-field-auth-type'
      label='认证方式'
      name='authType'
    >
      <RadioGroup
        size='small'
        onChange={handleChangeAuthType}
        buttonStyle='solid'
      >
        {
          authTypesFiltered.map(t => {
            const str = cnLabels[t] || e(t)
            return (
              <RadioButton value={t} key={t}>
                {str}
              </RadioButton>
            )
          })
        }
      </RadioGroup>
    </FormItem>
  )
}
