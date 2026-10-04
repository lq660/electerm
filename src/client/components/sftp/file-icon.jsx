/**
 * file/folder icon by ext or name
 */

import { useEffect, useState } from 'react'
import { getIconForFile, getIconForFolder } from 'electerm-icons'
import { FileOutlined, FolderFilled } from '@ant-design/icons'
import classnames from 'classnames'

const systemIconPromises = new Map()

const getSystemIcon = path => {
  if (!path || typeof window.pre?.runGlobalAsync !== 'function') {
    return Promise.resolve(null)
  }
  if (!systemIconPromises.has(path)) {
    const promise = window.pre.runGlobalAsync('getSystemFileIcon', path)
      .then(icon => typeof icon === 'string' ? icon : null)
      .catch(() => null)
    systemIconPromises.set(path, promise)
  }
  return systemIconPromises.get(path)
}

export default function FileIcon ({ file, ...extra }) {
  const { extIconPath } = window.pre
  const fileData = file || {}
  const fileName = typeof fileData.name === 'string' ? fileData.name : ''
  const fallbackName = fileData.isDirectory
    ? getIconForFolder(fileName)
    : getIconForFile(fileName)
  const fallbackSrc = extIconPath + fallbackName
  let localPath = ''
  if (fileData.type === 'local' && fileData.path) {
    try {
      localPath = window.pre.resolve(fileData.path, fileName)
    } catch (err) {
      localPath = ''
    }
  }
  const [src, setSrc] = useState(fallbackSrc)
  const [iconFailed, setIconFailed] = useState(false)

  useEffect(() => {
    let active = true
    setSrc(fallbackSrc)
    setIconFailed(false)
    if (localPath) {
      getSystemIcon(localPath).then(icon => {
        if (active && icon) {
          setSrc(icon)
        }
      })
    }
    return () => {
      active = false
    }
  }, [fallbackSrc, localPath])

  const handleError = () => {
    if (src !== fallbackSrc) {
      setSrc(fallbackSrc)
      return
    }
    setIconFailed(true)
  }

  if (iconFailed) {
    const Icon = fileData.isDirectory ? FolderFilled : FileOutlined
    return (
      <Icon
        {...extra}
        className={classnames(extra.className, 'sftp-file-icon-fallback', {
          'sftp-file-icon-folder': fileData.isDirectory
        })}
        aria-hidden='true'
      />
    )
  }

  return (
    <img
      src={src}
      height={16}
      alt=''
      {...extra}
      className={classnames(extra.className, {
        // 2026-09-01 coder(lq): Tint bundled folder artwork while leaving native OS icons unchanged.
        'sftp-file-icon-folder': fileData.isDirectory && src === fallbackSrc
      })}
      onError={handleError}
    />
  )
}
