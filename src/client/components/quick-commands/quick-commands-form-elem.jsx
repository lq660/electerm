import {
  Button,
  Switch,
  Form,
  Select,
  Input
} from 'antd'
import message from '../common/message'
import { useState } from 'react'
import generate from '../../common/uid'
import InputAutoFocus from '../common/input-auto-focus'
import renderQm from './quick-commands-list-form'
import ShortcutEdit from '../shortcuts/shortcut-editor'
import { getKeysTakenData } from '../shortcuts/shortcut-utils'
import deepCopy from 'json-deep-copy'
import templates from './templates'
import HelpIcon from '../common/help-icon'

const FormItem = Form.Item
const { Option } = Select
const e = window.translate

export default function QuickCommandForm (props) {
  const [form] = Form.useForm()
  const { store, formData } = props
  const { quickCommandTags = [] } = store
  const [shortcut, setShortcut] = useState(formData.shortcut || '')
  const uid = formData.id || generate()
  const updateConfig = (name, value) => {
    form.setFieldsValue({
      shortcut: value
    })
    setShortcut(value)
  }
  const handleClear = () => {
    form.setFieldsValue({
      shortcut: ''
    })
    setShortcut('')
  }
  const getKeysTaken = () => {
    const keysTaken = getKeysTakenData()

    // Exclude current shortcut if editing existing command
    if (formData.shortcut) {
      delete keysTaken[formData.shortcut]
    }

    return keysTaken
  }

  async function handleSubmit (res) {
    const { formData } = props
    const {
      name,
      commands,
      inputOnly,
      labels,
      shortcut
    } = res
    const update = deepCopy({
      name,
      commands,
      inputOnly,
      labels,
      shortcut
    })
    const update1 = {
      ...update,
      id: uid
    }
    if (formData.id) {
      store.editQuickCommand(formData.id, update)
    } else {
      store.addQuickCommand(update1)
      store.setSettingItem({
        id: '',
        name: e('newQuickCommand')
      })
    }
    message.success(e('saved'))
  }
  const initialValues = formData
  if (!initialValues.labels) {
    initialValues.labels = []
  }
  if (!initialValues.commands) {
    initialValues.commands = [{
      command: initialValues.command || '',
      id: generate(),
      delay: 100
    }]
  }
  const editorProps = {
    data: {
      name: uid,
      shortcut
    },
    keysTaken: getKeysTaken(),
    store,
    updateConfig,
    handleClear,
    renderClear: true
  }
  const templatesStr = templates.map(t => {
    return `{{${t}}}`
  }).join(', ')
  const wiki = 'https://github.com/electerm/electerm/wiki/quick-command-templates'
  return (
    <>
      <Form
        form={form}
        onFinish={handleSubmit}
        className='form-wrap pd2l cn-setting-detail-form cn-quick-command-form'
        layout='vertical'
        initialValues={initialValues}
      >
        <div className='cn-setting-card-title'>
          <strong>快捷命令</strong>
          <span>沉淀常用脚本、批量命令和快捷键</span>
        </div>
        <section className='cn-settings-section'>
          <div className='cn-settings-section-title'>
            <strong>基础信息</strong>
            <span>名称、标签和执行方式</span>
          </div>
          <FormItem
            label={e('quickCommandName')}
            rules={[{
              max: 60, message: '最多 60 个字符'
            }, {
              required: true, message: '请输入名称'
            }]}
            hasFeedback
            name='name'
          >
            <InputAutoFocus />
          </FormItem>
          <FormItem
            name='labels'
            label='标签'
          >
            <Select
              mode='tags'
            >
              {
                quickCommandTags.map(q => {
                  return (
                    <Option value={q} key={'qmt-' + q}>
                      {q}
                    </Option>
                  )
                })
              }
            </Select>
          </FormItem>
          <FormItem
            label='快捷键'
            name='shortcut'
          >
            <div>
              <Input className='hide' />
              <ShortcutEdit
                {...editorProps}
              />
            </div>
          </FormItem>
          <FormItem
            label={e('inputOnly')}
            name='inputOnly'
            valuePropName='checked'
          >
            <Switch />
          </FormItem>
        </section>
        <section className='cn-settings-section'>
          <div className='cn-settings-section-title'>
            <strong>命令步骤</strong>
            <span>支持多行命令、延迟执行和拖拽排序</span>
          </div>
          {renderQm(form)}
        </section>
        <FormItem className='cn-settings-action-row'>
          <div>
            <Button
              type='primary'
              htmlType='submit'
            >{e('save')}
            </Button>
          </div>
        </FormItem>
        <p className='cn-settings-help-line'>
          <b className='mg1r'>模板变量:</b>
          <span className='mg1r'>{templatesStr}</span>
          <HelpIcon
            link={wiki}
          />
        </p>
      </Form>
    </>
  )
}
