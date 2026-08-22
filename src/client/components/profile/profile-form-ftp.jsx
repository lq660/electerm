import {
  Form,
  Input
} from 'antd'
import { formItemLayout } from '../../common/form-layout'
import Password from '../common/password'

const FormItem = Form.Item
const e = window.translate

export default function ProfileFormSsh (props) {
  return (
    <>
      <FormItem
        {...formItemLayout}
        label={e('username')}
        hasFeedback
        name={['ftp', 'user']}
        rules={[{
          max: 128, message: '最多 128 个字符'
        }]}
      >
        <Input />
      </FormItem>
      <FormItem
        {...formItemLayout}
        label={e('password')}
        hasFeedback
        name={['ftp', 'password']}
      >
        <Password />
      </FormItem>
    </>
  )
}
