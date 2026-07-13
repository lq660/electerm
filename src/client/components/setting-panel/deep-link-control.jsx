import React, { useState, useEffect } from 'react'
import { Button, Tooltip, Tag, Space } from 'antd'
import message from '../common/message'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'

const e = window.translate

export default function DeepLinkControl () {
  const [loading, setLoading] = useState(false)
  const [registrationStatus, setRegistrationStatus] = useState(null)

  const checkRegistrationStatus = async () => {
    try {
      const status = await window.pre.runGlobalAsync('checkProtocolRegistration')
      setRegistrationStatus(status)
    } catch (error) {
      console.error('Failed to check protocol registration:', error)
    }
  }

  useEffect(() => {
    checkRegistrationStatus()
  }, [])

  const handleRegister = async () => {
    setLoading(true)
    try {
      const result = await window.pre.runGlobalAsync('registerDeepLink', true)
      if (result.registered) {
        message.success(e('protocolHandlersRegistered'))
        await checkRegistrationStatus()
      } else {
        message.warning(`${e('registrationSkipped')}: ${result.reason || '-'}`)
      }
    } catch (error) {
      message.error(e('protocolRegistrationFailed'))
      console.error('Registration error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUnregister = async () => {
    setLoading(true)
    try {
      await window.pre.runGlobalAsync('unregisterDeepLink')
      message.success(e('protocolHandlersUnregistered'))
      await checkRegistrationStatus()
    } catch (error) {
      message.error(e('protocolUnregistrationFailed'))
      console.error('Unregistration error:', error)
    } finally {
      setLoading(false)
    }
  }

  const isAnyProtocolRegistered = () => {
    if (!registrationStatus) return false
    return Object.values(registrationStatus).some(status => status === true)
  }

  const isAllProtocolsRegistered = () => {
    if (!registrationStatus) return false
    return Object.values(registrationStatus).every(status => status === true)
  }

  const renderTooltipContent = () => {
    const protocols = ['ssh', 'telnet', 'rdp', 'vnc', 'serial', 'spice', 'electerm', 'ftp']
    const tip = `${e('protocolRegistrationTip')} (${protocols.join('://, ')})`

    return (
      <div>
        <div className='pd1b'>
          {tip}
        </div>

        {registrationStatus && (
          <>
            <div className='pd1b'>
              {e('protocolStatus')}
            </div>
            <div className='pd1b'>
              <Space size='small' wrap>
                {protocols.map(protocol => {
                  const isRegistered = registrationStatus[protocol]
                  return (
                    <Tag
                      key={protocol}
                      variant='solid'
                      icon={isRegistered ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                      color={isRegistered ? 'success' : 'default'}
                    >
                      {protocol}://
                    </Tag>
                  )
                })}
              </Space>
            </div>
          </>
        )}
      </div>
    )
  }

  const isRegistered = isAnyProtocolRegistered()
  const isAllRegistered = isAllProtocolsRegistered()

  return (
    <div className='pd2b'>
      <Tooltip
        title={renderTooltipContent()}
      >
        <Space>
          {
            !isAllRegistered && (
              <Button
                type='primary'
                onClick={handleRegister}
                loading={loading}
              >
                {e('registerDeepLink')}
              </Button>
            )
          }
          {
            isRegistered && (
              <Button
                color='danger'
                variant='solid'
                onClick={handleUnregister}
                loading={loading}
              >
                {e('unregisterDeepLink')}
              </Button>
            )
          }
        </Space>
      </Tooltip>
    </div>
  )
}
