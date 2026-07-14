/**
 * Custom Upload component that uses Electron's native file dialog
 * This replaces antd Upload to get absolute file paths instead of browser-based file selection
 */

import { PureComponent } from 'react'
import { getLocalFileInfo } from '../sftp/file-read'

/**
 * Open a file select dialog
 * Supports browser upload in web app mode
 * @returns {Promise<Object|Object[]|null>} - File object(s) with path info or null if cancelled
 */
const openFileSelect = async (multiple = false) => {
  const properties = [
    'openFile',
    'showHiddenFiles',
    'noResolveAliases',
    'treatPackageAsDirectory',
    'dontAddToRecent'
  ]
  if (multiple) {
    properties.push('multiSelections')
  }
  const title = window.translate(multiple ? 'chooseFiles' : 'chooseFile')
  const files = await window.api.openDialog({
    title,
    message: title,
    properties
  }).catch(() => false)
  if (!files) {
    return null
  }
  // Browser upload returns { fileContent, fileName }
  if (files.fileContent !== undefined) {
    return multiple ? [files] : files
  }
  if (Array.isArray(files) && files[0]?.fileContent !== undefined) {
    return multiple ? files : files[0]
  }
  if (!files.length) {
    return null
  }
  const selectedPaths = multiple ? files : [files[0]]
  // 2026-07-14 coder(lq): Preserve every native-dialog selection so batch resource imports can parse files together.
  const selectedFiles = await Promise.all(selectedPaths.map(async filePath => {
    const stat = await getLocalFileInfo(filePath)
    return { ...stat, filePath, path: filePath }
  }))
  return multiple ? selectedFiles : selectedFiles[0]
}

/**
 * Custom Upload component
 * Uses Electron's native file dialog for file selection
 * API compatible with antd Upload for the use cases in this project
 */
export default class Upload extends PureComponent {
  handleClick = async () => {
    const { beforeUpload, disabled, multiple } = this.props
    if (disabled) {
      return
    }
    const file = await openFileSelect(Boolean(multiple))
    if (!file) {
      return
    }
    if (beforeUpload) {
      await beforeUpload(file)
    }
  }

  render () {
    const {
      children,
      className,
      style,
      disabled
    } = this.props

    return (
      <div
        className={className}
        style={style}
        onClick={this.handleClick}
        role='button'
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
      >
        {children}
      </div>
    )
  }
}
