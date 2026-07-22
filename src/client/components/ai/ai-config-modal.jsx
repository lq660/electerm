import Modal from '../common/modal'
import { auto } from 'manate/react'
import AIConfigForm from './ai-config'
import message from '../common/message'
import { aiConfigsArr } from './ai-config-props'
import { pick } from 'lodash-es'

const e = window.translate

export default auto(function AIConfigModal ({ store }) {
  const { showAIConfigModal } = store

  if (!showAIConfigModal) {
    return null
  }

  function getInitialValues () {
    const res = pick(store.config, aiConfigsArr)
    if (!res.languageAI) {
      res.languageAI = window.store.getLangName()
    }
    return res
  }

  function isLockedConfigError (error) {
    return String(error?.message || error).includes('锁定的旧版加密数据')
  }

  async function persistAiConfig (values, rebuild = false) {
    const nextConfig = {
      ...window.store.config,
      ...values
    }
    try {
      if (window.store.userConfigSaveLocked && !rebuild) {
        message.error('当前本地配置无法持久保存，请先重建本地配置')
        return false
      }
      await window.pre.runGlobalAsync(
        rebuild ? 'rebuildUserConfig' : 'saveUserConfig',
        nextConfig
      )
      window.store.userConfigSaveLocked = false
      window.store.userConfigLockedNoticeShown = false
      window.store.updateConfig(values)
      message.success(e('saved') || 'Saved')
      window.store.showAIConfigModal = false
      return true
    } catch (error) {
      if (isLockedConfigError(error)) {
        window.store.userConfigSaveLocked = true
        message.error('当前本地配置无法持久保存，请先重建本地配置')
        return false
      }
      window.store.onError(error)
      return false
    }
  }

  function handleSubmit (values) {
    return persistAiConfig(values)
  }

  function handleRebuildConfig (values) {
    return persistAiConfig(values, true)
  }

  function handleClose () {
    window.store.showAIConfigModal = false
  }

  return (
    <Modal
      open={showAIConfigModal}
      onCancel={handleClose}
      footer={null}
      title='AI 配置'
      width='80%'
      destroyOnClose
      maskClosable={false}
      className='ai-config-modal'
    >
      <AIConfigForm
        initialValues={getInitialValues()}
        onSubmit={handleSubmit}
        onRebuildConfig={handleRebuildConfig}
        configSaveLocked={store.userConfigSaveLocked}
        showAIConfig
      />
    </Modal>
  )
})
