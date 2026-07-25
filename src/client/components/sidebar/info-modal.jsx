import {
  GithubOutlined,
  InfoCircleOutlined,
  HighlightOutlined
} from '@ant-design/icons'
import { Tabs, Button } from 'antd'
import Modal from '../common/modal'
import Link from '../common/external-link'
import RunningTime from './app-running-time'
import { auto } from 'manate/react'
import { useState } from 'react'

import {
  packInfo,
  infoTabs
} from '../../common/constants'
import { checkSkipSrc } from '../../common/check-skip-src'
import './info.styl'

const e = window.translate
const productName = '云舵工作台'

export default auto(function InfoModal (props) {
  const [runtimeEnv, setRuntimeEnv] = useState(null)

  const handleChangeTab = key => {
    window.store.infoModalTab = key
    if (key === infoTabs.env && !runtimeEnv) {
      window.pre.runGlobalAsync('getEnv').then(env => setRuntimeEnv(env))
    }
  }

  const renderCheckUpdate = () => {
    if (window.et.isWebApp || checkSkipSrc(props.installSrc)) {
      return null
    }
    const {
      onCheckUpdate
    } = window.store
    const {
      upgradeInfo
    } = props
    const onCheckUpdating = upgradeInfo.checkingRemoteVersion || upgradeInfo.upgrading
    const { noUpdateMessage, noUpdateMessageExpires } = upgradeInfo
    const showMessage = noUpdateMessage && noUpdateMessageExpires && Date.now() < noUpdateMessageExpires
    return (
      <div className='mg1b mg2t'>
        <Button
          type='primary'
          loading={onCheckUpdating}
          onClick={() => onCheckUpdate(true)}
        >
          {e('checkForUpdate')}
        </Button>
        {showMessage && (
          <span className='mg1l update-msg'>{noUpdateMessage}</span>
        )}
      </div>
    )
  }

  const renderParsed = (obj, depth = 0) => {
    if (Array.isArray(obj)) {
      return (
        <ul className='pd2l'>
          {obj.map((item, i) => (
            <li key={i}>{renderParsed(item, depth + 1)}</li>
          ))}
        </ul>
      )
    } else if (typeof obj === 'object' && obj !== null) {
      return (
        <div className={depth > 0 ? 'pd2l' : ''}>
          {Object.entries(obj).map(([k, v]) => (
            <div key={k} className='pd1b'>
              <b>{k}:</b> {renderParsed(v, depth + 1)}
            </div>
          ))}
        </div>
      )
    } else {
      return <span>{String(obj)}</span>
    }
  }

  const renderValue = (v) => {
    try {
      const parsed = JSON.parse(v)
      return renderParsed(parsed)
    } catch {
      return <span>{v}</span>
    }
  }

  const renderOSInfo = () => {
    return window.pre.osInfo().map(({ k, v }, i) => (
      <div className='pd1b' key={i + '_os_' + k}>
        <b className='bold'>{k}:</b>
        <span className='mg1l'>
          {renderValue(v)}
        </span>
      </div>
    ))
  }

  const { infoModalTab, commandLineHelp } = props
  const {
    showInfoModal
  } = window.store
  function onCloseAbout () {
    window.store.showInfoModal = false
  }
  if (!showInfoModal) {
    return null
  }
  const {
    name,
    devDependencies,
    dependencies,
    releases: releaseLink
  } = packInfo
  const upstreamProjectLink = releaseLink.replace('/releases', '')
  const { versions } = window.pre
  const deps = {
    ...devDependencies,
    ...dependencies
  }
  const envs = {
    ...versions,
    ...(runtimeEnv || {})
  }
  const title = (
    <div className='custom-modal-close-confirm-title font16'>
      <InfoCircleOutlined className='font20 mg1r' /> {e('about')} {productName}
    </div>
  )
  const attrs = {
    title,
    width: window.innerWidth - 100,
    maskClosable: true,
    onCancel: onCloseAbout,
    open: true,
    wrapClassName: 'info-modal'
  }
  const items = [
    {
      key: infoTabs.info,
      label: e('about'),
      children: (
        <div className='cn-about-page'>
          <div className='cn-about-hero'>
            <div className='cn-about-logo'>云</div>
            <div>
              <strong>{productName}</strong>
              <span>统一管理本地终端、SSH 会话、SFTP 文件和传输任务</span>
              <em>基于 electerm 开源内核定制，当前内核版本 {name} {packInfo.version}</em>
            </div>
          </div>
          <RunningTime />
          {/* 2026-07-04 coder(lq): Keep upstream attribution visible, but separate it from product-facing identity and support links. */}
          <div className='cn-about-facts'>
            <div>
              <b>产品定位</b>
              <span>本地终端、远程连接、文件管理和传输任务的一体化工作台</span>
            </div>
            <div>
              <b>当前版本</b>
              <span>{productName} {packInfo.version}</span>
            </div>
            <div>
              <b>安装包</b>
              <span>{window.store.installSrc || '开发预览'}</span>
            </div>
          </div>
          <div className='cn-about-open-source'>
            <h3>开源致谢</h3>
            <p>本产品基于 electerm 开源内核定制，保留其终端、连接和文件传输等基础能力。</p>
            <p>
              <GithubOutlined /> <b className='mg1r'>上游项目</b>
              <Link to={upstreamProjectLink} className='mg1l'>
                {upstreamProjectLink}
              </Link>
            </p>
            <p>
              <HighlightOutlined /> <b className='mg1r'>上游更新日志</b>
              <Link to={releaseLink} className='mg1l'>
                {releaseLink}
              </Link>
            </p>
          </div>
          {renderCheckUpdate()}
        </div>
      )
    },
    {
      key: infoTabs.deps,
      label: e('dependencies'),
      children: Object.keys(deps).map((k, i) => {
        const v = deps[k]
        return (
          <div className='pd1b' key={i + '_dp_' + k}>
            <b className='bold'>{k}</b>:
            <span className='mg1l'>
              {v}
            </span>
          </div>
        )
      })
    },
    {
      key: infoTabs.env,
      label: e('env'),
      children: Object.keys(envs).map((k, i) => {
        const v = envs[k]
        return (
          <div className='pd1b' key={i + '_env_' + k}>
            <b className='bold'>{k}</b>:
            <span className='mg1l'>
              {v}
            </span>
          </div>
        )
      })
    },
    {
      key: infoTabs.os,
      label: e('os'),
      children: <div>{renderOSInfo()}</div>
    }
  ]

  if (!window.et.isWebApp) {
    items.push({
      key: infoTabs.cmd,
      label: e('commandLineUsage'),
      children: (
        <pre>
          <code>{commandLineHelp}</code>
        </pre>
      )
    })
  }

  return (
    <Modal
      {...attrs}
    >
      <div className='about-wrap'>
        <Tabs
          activeKey={infoModalTab}
          onChange={handleChangeTab}
          items={items}
        />
      </div>
    </Modal>
  )
})
