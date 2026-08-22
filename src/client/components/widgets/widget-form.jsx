/**
 * Widget form component
 */
import React, { useState, useEffect } from 'react'
import { Form, Input, InputNumber, Switch, Select, Button, Tooltip, Alert, Space } from 'antd'
import { formItemLayout, tailFormItemLayout } from '../../common/form-layout'
import HelpIcon from '../common/help-icon'
import { nanoid } from 'nanoid'
import BatchOpEditor from '../batch-op/batch-op-editor'
import {
  getWidgetConfigDescription,
  getWidgetConfigLabel,
  getWidgetDescription,
  getWidgetTitle
} from './widget-i18n'

export default function WidgetForm ({ widget, onSubmit, loading, hasRunningInstance }) {
  const [form] = Form.useForm()
  const [showDownloadWarning, setShowDownloadWarning] = useState(false)

  useEffect(() => {
    let timer
    if (loading) {
      timer = setTimeout(() => {
        setShowDownloadWarning(true)
      }, 3000)
    } else {
      setShowDownloadWarning(false)
    }
    return () => {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [loading])

  if (!widget) {
    return null
  }

  const { info } = widget
  const { configs, type, singleInstance } = info
  const isInstanceWidget = type === 'instance'
  const isFrontendWidget = type === 'frontend'
  const txt = isInstanceWidget ? '启动工具' : '运行工具'
  const isDisabled = loading || (singleInstance && hasRunningInstance)

  const handleSubmit = async (values) => {
    onSubmit(values)
  }

  const renderFormItem = (config) => {
    const { name, type, choices, showGenerator } = config
    const label = getWidgetConfigLabel(config)
    const desc = getWidgetConfigDescription(config)
    let control = null

    switch (type) {
      case 'string':
        control = <Input placeholder={desc} />
        if (showGenerator) {
          return (
            <Form.Item
              key={name}
              {...formItemLayout}
              label={label}
              tooltip={desc}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item
                  noStyle
                  name={name}
                >
                  <Input placeholder={desc} />
                </Form.Item>
                <Button
                  onClick={() => form.setFieldValue(name, 'ett_' + nanoid())}
                >
                  生成
                </Button>
              </Space.Compact>
            </Form.Item>
          )
        }
        break
      case 'textarea':
        control = <Input.TextArea autoSize={{ minRows: 3 }} placeholder={desc} />
        break
      case 'number':
        control = <InputNumber style={{ width: '100%' }} placeholder={desc} />
        break
      case 'boolean':
        return (
          <Form.Item
            key={name}
            {...formItemLayout}
            label={label}
            name={name}
            valuePropName='checked'
            tooltip={desc}
          >
            <Switch />
          </Form.Item>
        )
      default:
        control = <Input placeholder={desc} />
    }

    if (choices && choices.length > 0) {
      control = (
        <Select placeholder={desc}>
          {choices.map(choice => (
            <Select.Option key={choice} value={choice}>
              {choice}
            </Select.Option>
          ))}
        </Select>
      )
    }

    return (
      <Form.Item
        key={name}
        {...formItemLayout}
        label={label}
        name={name}
        tooltip={desc}
      >
        {control}
      </Form.Item>
    )
  }

  function renderWarn () {
    if (!showDownloadWarning) {
      return null
    }
    return (
      <Alert
        title='首次使用需要下载工具依赖，请稍候...'
        type='warning'
        showIcon
        className='mg1t'
      />
    )
  }

  const initialValues = configs.reduce((acc, config) => {
    acc[config.name] = config.default
    return acc
  }, {})

  if (isFrontendWidget && info.name === 'Batch Operation') {
    return <BatchOpEditor widget={widget} />
  }

  return (
    <div className='widget-form'>
      <div className='pd1b alignright'>
        <h4>
          {getWidgetTitle(widget)}
          {info.name === 'MCP Server' && (
            <HelpIcon link='https://github.com/electerm/electerm/wiki/MCP-Widget-Usage-Guide' />
          )}
        </h4>
        <p>{getWidgetDescription(widget)}</p>
      </div>

      <Form
        form={form}
        onFinish={handleSubmit}
        initialValues={initialValues}
        layout='horizontal'
      >
        {configs.map(renderFormItem)}
        <Form.Item
          {...tailFormItemLayout}
        >
          <Tooltip title={isDisabled && singleInstance && hasRunningInstance ? '该工具已在运行，只允许启动一个实例' : ''}>
            <Button
              type='primary'
              htmlType='submit'
              loading={loading}
              disabled={isDisabled}
            >
              {txt}
            </Button>
          </Tooltip>
          {renderWarn()}
        </Form.Item>
      </Form>
    </div>
  )
}
