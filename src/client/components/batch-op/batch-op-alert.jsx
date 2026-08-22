import React from 'react'
import { Alert } from 'antd'
import ExternalLink from '../common/external-link'

const batchOpWikiLink = 'https://github.com/electerm/electerm/wiki/batch-operation'
const e = window.translate

export default function BatchOpAlert () {
  const description = (
    <>
      <p>{e('supportedActions')}: <code>connect, command, sftp_upload, sftp_download</code></p>
      <div><ExternalLink to={batchOpWikiLink}>{batchOpWikiLink}</ExternalLink></div>
    </>
  )

  return (
    <Alert
      description={description}
      type='info'
      showIcon
      className='mg1b'
    />
  )
}
