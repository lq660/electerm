/**
 * default text editor for remote file
 */

import { useEffect } from 'react'
import { Form, Button, Flex } from 'antd'
import CodeEditor from './code-editor'
import download from '../../common/download'

const FormItem = Form.Item
const e = window.translate

export default function TextEditorForm (props) {
  const [form] = Form.useForm()
  const {
    text,
    loading,
    fileName
  } = props

  useEffect(() => {
    form.resetFields()
  }, [props.text])

  function handleSubmitClick () {
    form.submit()
  }

  async function handleSubmit (res) {
    props.submit(res)
  }

  // function onPressEnter (e) {
  //   e.stopPropagation()
  // }

  function handleResetClick () {
    form.resetFields()
  }

  function handleCancelClick () {
    props.cancel()
  }

  function handleEditWithClick () {
    props.editWith()
  }

  async function handleDownload () {
    if (!fileName) {
      return
    }
    const currentText = form.getFieldValue('text')
    await download(fileName, currentText ?? text ?? '')
  }

  return (
    <Form
      onFinish={handleSubmit}
      form={form}
      name='text-edit-form'
      layout='vertical'
      initialValues={{ text }}
      className='text-editor-form'
      style={{ height: '100%', width: '100%', minWidth: 0 }}
    >
      {/* 2026-09-06 coder(lq): Keep the editor on a plain shell so AntD Form wrappers do not shrink the body width. */}
      <div className='text-editor-editor-shell'>
        <FormItem
          name='text'
          noStyle
        >
          <CodeEditor
            fileName={fileName}
            onSave={handleSubmitClick}
            style={{
              width: '100%',
              minWidth: 0,
              minHeight: 0,
              flex: 1
            }}
          />
        </FormItem>
      </div>
      <Flex className='text-editor-actions' justify='space-between' align='center' wrap gap={8}>
        <Flex className='text-editor-actions-primary' wrap gap={8} align='center'>
          <Button
            type='primary'
            disabled={loading}
            onClick={handleSubmitClick}
            size='small'
          >
            {e('save')}
          </Button>
          <Button
            disabled={loading}
            onClick={handleResetClick}
            size='small'
          >
            {e('reset')}
          </Button>
          <Button
            type='dashed'
            onClick={handleCancelClick}
            disabled={loading}
            size='small'
          >
            {e('cancel')}
          </Button>
        </Flex>
        <Flex className='text-editor-actions-secondary' wrap gap={8} align='center'>
          <Button
            type='default'
            disabled={loading}
            onClick={handleEditWithClick}
            size='small'
          >
            {e('editWithSystemEditor')}
          </Button>
          <Button
            type='default'
            disabled={loading || !fileName}
            onClick={handleDownload}
            size='small'
          >
            {e('download')}
          </Button>
        </Flex>
      </Flex>
    </Form>
  )
}
