import Modal from '../common/modal'
import { auto } from 'manate/react'
import AIConfigForm from './ai-config'
import { aiConfigsArr } from './ai-config-props'
import { pick } from 'lodash-es'
import message from '../common/message'

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

  async function persistAiConfig (values) {
    const nextConfig = {
      ...window.store.config,
      ...values
    }
    try {
      await window.pre.runGlobalAsync('saveUserConfig', nextConfig)
      window.store.userConfigSaveLocked = false
      window.store.userConfigLockedNoticeShown = false
      window.store.updateConfig(values)
      message.success(e('saved') || 'Saved')
      window.store.showAIConfigModal = false
      return true
    } catch (error) {
      window.store.onError(error)
      return false
    }
  }

  function handleSubmit (values) {
    return persistAiConfig(values)
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
        showAIConfig
      />
    </Modal>
  )
})
