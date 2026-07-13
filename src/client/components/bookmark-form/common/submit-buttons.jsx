/**
 * Common submit buttons component for bookmark forms
 * Provides save, connect, and test functionality
 */
import React from 'react'
import { Button, Form } from 'antd'
import { tailFormItemLayout } from '../../../common/form-layout'

const FormItem = Form.Item

export default function SubmitButtons ({
  onSave,
  onSaveAndCreateNew,
  onConnect,
  onTestConnection
}) {
  return (
    <FormItem {...tailFormItemLayout}>
      <div className='cn-submit-actions'>
        <Button type='primary' htmlType='submit'>
          保存并连接
        </Button>
        <Button onClick={onSave}>
          仅保存
        </Button>
        <Button onClick={onSaveAndCreateNew}>
          保存并继续新建
        </Button>
        <Button onClick={onTestConnection}>
          测试连接
        </Button>
        <Button onClick={onConnect}>
          直接连接
        </Button>
      </div>
    </FormItem>
  )
}
