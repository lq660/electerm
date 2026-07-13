import React, { useState, useCallback } from 'react'
import { Input, Button } from 'antd'
import Modal from '../common/modal'

export default function WebAuthModal ({ authRequest, onAuthSubmit, onAuthCancel }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = useCallback(() => {
    onAuthSubmit(username, password)
    setUsername('')
    setPassword('')
  }, [onAuthSubmit, username, password])

  const handleCancel = useCallback(() => {
    onAuthCancel()
    setUsername('')
    setPassword('')
  }, [onAuthCancel])

  return (
    <Modal
      open={!!authRequest}
      title='需要登录认证'
      width={400}
      onCancel={handleCancel}
      footer={null}
    >
      <div className='pd1y cn-web-auth-modal'>
        <p className='cn-web-auth-tip'>
          <b>{authRequest?.host}</b> 需要输入访问凭据
          {authRequest?.realm ? `（${authRequest.realm}）` : ''}
        </p>
        <div className='pd1b'>
          <div className='pd1b cn-web-auth-label'>用户名</div>
          <Input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder='请输入用户名'
            autoFocus
          />
        </div>
        <div className='pd1b'>
          <div className='pd1b cn-web-auth-label'>密码</div>
          <Input.Password
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder='请输入密码'
            onPressEnter={handleSubmit}
          />
        </div>
        <div className='pd1t alignright'>
          <Button
            className='mg1r'
            onClick={handleCancel}
          >
            取消
          </Button>
          <Button
            type='primary'
            onClick={handleSubmit}
          >
            登录
          </Button>
        </div>
      </div>
    </Modal>
  )
}
