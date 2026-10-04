import {
  Form,
  Input,
  Button,
  AutoComplete,
  Alert,
  Space,
  Select,
  Radio
} from 'antd'
import { useEffect, useState } from 'react'
import Link from '../common/external-link'
import AiCache from './ai-cache'
import {
  aiConfigWikiLink
} from '../../common/constants'
import Password from '../common/password'
import AiHistory, { addHistoryItem } from './ai-history'
import message from '../common/message'
import defaultSettings from '../../common/default-setting'

const STORAGE_KEY_CONFIG = 'ai_config_history'
const EVENT_NAME_CONFIG = 'ai-config-history-update'

const e = window.translate
const defaultRoles = [
  {
    value: defaultSettings.roleAI
  }
]

const proxyOptions = [
  { value: 'socks5://127.0.0.1:1080' },
  { value: 'http://127.0.0.1:8080' },
  { value: 'https://proxy.example.com:3128' }
]

const authHeaderOptions = [
  { value: 'Authorization: Bearer' },
  { value: 'x-api-key' },
  { value: 'api-key' },
  { value: 'Authorization: Api-Key' },
  { value: 'Authorization' }
]

export default function AIConfigForm ({ initialValues, onSubmit, showAIConfig, agentRunning = false }) {
  const [form] = Form.useForm()
  const [testing, setTesting] = useState(false)
  const baseURLAI = Form.useWatch('baseURLAI', form)
  const apiPathAI = Form.useWatch('apiPathAI', form)
  const currentBaseURL = baseURLAI ?? initialValues?.baseURLAI ?? ''
  const currentPath = apiPathAI ?? initialValues?.apiPathAI ?? ''
  const fullURL = /^https?:\/\//i.test(currentPath)
    ? currentPath
    : `${currentBaseURL.replace(/\/+$/, '')}/${currentPath.replace(/^\/+/, '')}`

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue(initialValues)
    }
  }, [initialValues])

  function filter () {
    return true
  }

  const handleSubmit = async (values) => {
    const saved = await onSubmit(values)
    if (saved !== false) {
      addHistoryItem(STORAGE_KEY_CONFIG, values, EVENT_NAME_CONFIG)
    }
  }

  const handleTest = async () => {
    try {
      const values = await form.validateFields()
      setTesting(true)
      const res = await window.pre.runGlobalAsync(
        'AIchat',
        'Hi',
        values.modelAI,
        values.roleAI,
        values.baseURLAI,
        values.apiPathAI,
        values.apiKeyAI,
        values.proxyAI,
        false,
        values.authHeaderNameAI,
        values.reasoningEffortAI
      )
      if (res && res.error) {
        message.error(res.error)
      } else if (res && res.response) {
        message.success('AI 配置可用')
      } else {
        message.error('AI 接口返回异常')
      }
    } catch (e) {
      if (e.message) {
        message.error(e.message)
      }
    } finally {
      setTesting(false)
    }
  }

  function handleSelectHistory (item) {
    if (item && typeof item === 'object') {
      form.setFieldsValue(item)
    }
  }

  function renderHistoryItem (item) {
    if (!item || typeof item !== 'object') return { label: '未知配置', title: '未知配置' }
    const name = item.nameAI || ''
    const model = item.modelAI || '默认模型'
    const rolePrefix = item.roleAI ? item.roleAI.substring(0, 15) + '...' : ''
    const label = name || `[${model}] ${rolePrefix}`
    const title = name
      ? `${name}\n模型：${item.modelAI}\n地址：${item.baseURLAI}`
      : `模型：${item.modelAI}\n角色：${item.roleAI}\n地址：${item.baseURLAI}`
    return { label, title }
  }

  function renderApiUrlLabel () {
    if (baseURLAI === 'https://api.atlascloud.ai/v1') {
      return <span>API 地址（<Link to='https://atlascloud.ai'>AtlasCloud</Link>）</span>
    }
    return 'API 地址'
  }

  if (!showAIConfig) {
    return null
  }
  const defaultLangs = window.store.getLangNames().map(l => ({ value: l }))
  return (
    <div className='form-wrap pd1y pd2x cn-setting-detail-form cn-ai-setting-form'>
      <div className='cn-setting-card-title'>
        <strong>AI 配置</strong>
        <span>配置模型服务地址、认证信息和默认语言</span>
      </div>
      <Alert
        title={
          <Link to={aiConfigWikiLink}>配置说明：{aiConfigWikiLink}</Link>
        }
        type='info'
        className='mg2y'
      />
      <p>
        完整地址：{fullURL}
      </p>
      <Form
        form={form}
        onFinish={handleSubmit}
        initialValues={initialValues}
        layout='vertical'
        className='ai-config-form'
      >
        <Form.Item
          label='配置名称'
          name='nameAI'
        >
          <Input
            placeholder='例如：DeepSeek 中转、本地 Ollama（可选）'
          />
        </Form.Item>
        <Form.Item label={renderApiUrlLabel()} required>
          <Space.Compact className='width-100'>
            <Form.Item
              label='API 地址'
              name='baseURLAI'
              noStyle
              rules={[
                { required: true, message: '请输入或选择 API 服务地址' },
                { type: 'url', message: '请输入有效的 URL' }
              ]}
            >
              <Input
                placeholder='请输入 API 服务地址'
                style={{ width: '75%' }}
              />
            </Form.Item>
            <Form.Item
              label='API 路径'
              name='apiPathAI'
              rules={[
                { required: true, message: '请输入 API 路径' }
              ]}
              noStyle
            >
              <Input
                placeholder='/v1/responses 或 /v1/chat/completions'
                style={{ width: '25%' }}
              />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
        <Form.Item
          label={e('modelAi')}
          name='modelAI'
          rules={[{ required: true, message: '请输入或选择模型' }]}
        >
          <Input
            placeholder='请输入或选择 AI 模型'
          />
        </Form.Item>

        <Form.Item
          label='推理强度'
          name='reasoningEffortAI'
          tooltip='根据接口自动使用 reasoning.effort（Responses）或 reasoning_effort（Chat Completions）；自动表示不额外发送该参数。部分模型或服务商可能不支持此选项。'
        >
          <Select
            options={[
              { value: 'auto', label: '自动（由模型决定）' },
              { value: 'low', label: '低' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' }
            ]}
          />
        </Form.Item>

        <Form.Item
          label='命令执行通道'
          name='terminalExecutionChannelAI'
          tooltip='选择 AI 的前台命令通过独立 SSH 通道执行，还是直接使用当前可见终端。'
          extra={agentRunning
            ? 'AI 任务运行中暂不能切换，完成或停止后可修改。'
            : '独立 SSH 不占用当前终端；当前终端会显示 AI 输入和输出。后台和长时间命令始终使用独立通道。'}
        >
          <Radio.Group
            disabled={agentRunning}
            optionType='button'
            buttonStyle='solid'
            options={[
              { value: 'isolated', label: '独立 SSH 通道' },
              { value: 'current', label: '当前终端' }
            ]}
          />
        </Form.Item>

        <Form.Item
          label='API 密钥'
          name='apiKeyAI'
        >
          <Password placeholder='请输入 API 密钥' />
        </Form.Item>

        <Form.Item
          label='认证请求头'
          name='authHeaderNameAI'
          tooltip='API 认证请求头格式。例如 "Authorization: Bearer" 会发送 "Authorization: Bearer <key>"，"x-api-key" 会发送 "x-api-key: <key>"'
        >
          <AutoComplete
            options={authHeaderOptions}
            filterOption={filter}
          >
            <Input placeholder='例如：Authorization: Bearer' />
          </AutoComplete>
        </Form.Item>

        <Form.Item
          label={e('roleAI')}
          name='roleAI'
          rules={[{ required: true, message: '请输入 AI 角色设定' }]}
        >
          <AutoComplete options={defaultRoles} placement='topLeft'>
            <Input.TextArea
              placeholder='请输入 AI 角色或系统提示词'
              rows={1}
            />
          </AutoComplete>
        </Form.Item>

        <Form.Item
          label={e('language')}
          name='languageAI'
          rules={[{ required: true, message: '请输入语言' }]}
        >
          <AutoComplete options={defaultLangs} placement='topLeft'>
            <Input
              placeholder={e('language')}
            />
          </AutoComplete>
        </Form.Item>

        <Form.Item
          label={e('proxy')}
          name='proxyAI'
          tooltip='AI API 请求代理，例如 socks5://127.0.0.1:1080'
        >
          <AutoComplete
            options={proxyOptions}
            filterOption={filter}
            allowClear
          >
            <Input placeholder='请输入代理地址（可选）' />
          </AutoComplete>
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type='primary' htmlType='submit'>
              {e('save')}
            </Button>
            <Button
              loading={testing}
              onClick={handleTest}
            >
              {e('testConnection')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
      <AiHistory
        storageKey={STORAGE_KEY_CONFIG}
        eventName={EVENT_NAME_CONFIG}
        onSelect={handleSelectHistory}
        renderItem={renderHistoryItem}
      />
      <AiCache />
    </div>
  )
}
