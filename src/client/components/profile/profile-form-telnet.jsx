import {
  Form,
  Input
} from 'antd'
import { formItemLayout } from '../../common/form-layout'
import renderAuth from '../bookmark-form/common/render-auth-ssh'

const FormItem = Form.Item
const e = window.translate

export default function ProfileFormTelnet (props) {
  return (
    <>
      <FormItem
        {...formItemLayout}
        label={e('username')}
        hasFeedback
        name={['telnet', 'username']}
        rules={[{
          max: 128, message: '最多 128 个字符'
        }]}
      >
        <Input />
      </FormItem>
      {
        renderAuth({
          store: props.store,
          form: props.form,
          authType: 'password',
          formItemName: ['telnet', 'password']
        })
      }
    </>
  )
}
