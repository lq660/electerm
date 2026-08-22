/**
 * terminal interactive UI - renders a single interactive event modal
 */

import { Form, Button, Checkbox } from 'antd'
import Modal from '../common/modal'
import InputAutoFocus from '../common/input-auto-focus'

const e = window.translate
const FormItem = Form.Item

export default function TermInteractiveUI ({
  opts,
  onSend,
  onClose
}) {
  const [form] = Form.useForm()
  const savePasswordTarget = `${opts.username ? `${opts.username}@` : ''}${opts.host || opts.title || ''}${opts.port ? `:${opts.port}` : ''}`

  function onCancel () {
    onSend({
      id: opts.id,
      results: []
    })
    onClose()
  }
  function onOk () {
    form.submit()
  }
  function onConfirm () {
    onSend({
      id: opts.id,
      results: [opts.options.confirmResult || 'yes']
    })
    onClose()
  }
  function onIgnore () {
    onSend({
      id: opts.id,
      results: Object.keys(opts.options.prompts).map(() => '')
    })
    onClose()
  }
  function onFinish (res) {
    const prompts = opts.options.prompts || []
    const results = prompts.map((_, i) => res['item' + i])
    onSend({
      id: opts.id,
      results,
      savePassword: res.savePassword && opts.savePasswordCandidate
        ? {
            password: results[0],
            bookmarkId: opts.srcId,
            tabId: opts.tabId
          }
        : null
    })
    onClose()
  }
  function renderFormItem (pro, i) {
    const {
      prompt,
      echo
    } = pro
    const note = (opts.options.instructions || [])[i]
    const type = echo
      ? 'input'
      : 'password'
    return (
      <FormItem
        key={prompt + i}
        label={type === 'password' ? e('password') : prompt}
        rules={[{
          required: true, message: e('requiredField')
        }]}
      >
        <div>
          <pre>{note}</pre>
        </div>
        <FormItem noStyle name={'item' + i}>
          <InputAutoFocus
            type={type}
            placeholder={note}
          />
        </FormItem>
      </FormItem>
    )
  }
  function renderSavePasswordOption () {
    if (!opts.savePasswordCandidate) {
      return null
    }
    return (
      <FormItem
        name='savePassword'
        valuePropName='checked'
        className='mg1b'
      >
        <Checkbox>
          {e('savePasswordToBookmark')}
          {savePasswordTarget ? <span className='color-gray font12'>（{savePasswordTarget}）</span> : null}
        </Checkbox>
      </FormItem>
    )
  }
  function renderConfirmBody () {
    const instructions = opts.options.instructions || []
    return (
      <div>
        {
          instructions.map((note, index) => {
            return <pre key={note + index}>{note}</pre>
          })
        }
        <FormItem>
          <Button
            type='primary'
            onClick={onConfirm}
          >
            {opts.options.submitText || e('save')}
          </Button>
          <Button
            className='mg1l'
            onClick={onCancel}
          >
            {opts.options.cancelText || e('cancel')}
          </Button>
        </FormItem>
      </div>
    )
  }
  const props = {
    maskClosable: false,
    okText: e('submit'),
    onCancel,
    onOk,
    closable: false,
    open: true,
    title: opts.savePasswordCandidate
      ? e('enterPasswordFor').replace('{target}', savePasswordTarget || opts.options?.name || '?')
      : (opts.options?.name || '?'),
    footer: null
  }
  return (
    <Modal
      {...props}
    >
      {
        opts.options?.mode === 'confirm'
          ? renderConfirmBody()
          : (
            <Form
              form={form}
              layout='vertical'
              onFinish={onFinish}
            >
              {
                opts.options.prompts.map(renderFormItem)
              }
              {renderSavePasswordOption()}
              <FormItem>
                <Button
                  type='primary'
                  htmlType='submit'
                >
                  {e('submit')}
                </Button>
                <Button
                  type='dashed'
                  className='mg1l'
                  onClick={onIgnore}
                >
                  {e('ignore')}
                </Button>
                <Button
                  className='mg1l'
                  onClick={onCancel}
                >
                  {e('cancel')}
                </Button>
              </FormItem>
            </Form>
            )
      }
    </Modal>
  )
}
