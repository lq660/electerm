/**
 * Shared UI for authorizing sensitive actions.
 */

import React from 'react'
import {
  Alert,
  Input,
  Space,
  message
} from 'antd'
import Modal from './modal'

const e = window.translate

export default function requestSensitiveActionAuth (options = {}) {
  const {
    title = '敏感操作授权',
    message: alertMessage = '此操作会访问敏感信息',
    description = '请先完成二次授权，再继续操作。',
    okText = '授权继续',
    cancelText = e('cancel') === 'cancel' ? '取消' : e('cancel'),
    zIndex = 1100
  } = options
  const requiresAppPassword = !!window.pre.requireAuth
  let appPassword = ''
  return new Promise(resolve => {
    Modal.confirm({
      title,
      zIndex,
      content: (
        <Space direction='vertical' size='middle' className='width-100'>
          <Alert
            type='warning'
            showIcon
            message={alertMessage}
            description={description}
          />
          {
            requiresAppPassword
              ? (
                <Input.Password
                  autoFocus
                  placeholder='输入软件访问密码'
                  onChange={event => {
                    appPassword = event.target.value
                  }}
                />
                )
              : (
                <Alert
                  type='info'
                  showIcon
                  message='未设置软件访问密码'
                  description='云舵会尝试使用系统认证；如果当前设备不支持，请先在通用设置里设置软件访问密码。'
                />
                )
          }
        </Space>
      ),
      okText,
      cancelText,
      onCancel: () => resolve(null),
      onOk: () => {
        if (requiresAppPassword && !appPassword) {
          message.warning('请输入软件访问密码')
          return false
        }
        resolve({
          appPassword
        })
      }
    })
  })
}
