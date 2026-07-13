import {
  BookOutlined,
  FolderOutlined,
  ImportOutlined,
  ExportOutlined,
  CodeOutlined,
  MenuOutlined,
  EditOutlined
} from '@ant-design/icons'
import { Button, Space, Dropdown, Flex, Tooltip } from 'antd'
import copy from 'json-deep-copy'
import time from '../../common/time'
import download from '../../common/download'
import ConnectionImport from './connection-import-modal'

const e = window.translate

export default function BookmarkToolbar (props) {
  const {
    onNewBookmark,
    onNewBookmarkGroup,
    onExport,
    onSshConfigs,
    bookmarkGroups,
    bookmarks
  } = props
  const handleDownload = () => {
    const txt = JSON.stringify({
      bookmarkGroups: copy(bookmarkGroups || []),
      bookmarks: copy(bookmarks || [])
    }, null, 2)
    const stamp = time(undefined, 'YYYY-MM-DD-HH-mm-ss')
    download('bookmarks-' + stamp + '.json', txt)
  }
  const handleToggleEdit = () => {
    window.store.bookmarkSelectMode = true
  }
  const titleNew = e('newServer')
  const titleGroup = e('newGroup')
  const titleEdit = e('batchEdit')
  const titleExport = e('exportServerResources')
  const titleImport = e('importServerResources')
  const titleSshConfigs = e('loadSshConfig')
  const titleMore = e('moreActions')
  const items = [
    {
      label: titleNew,
      onClick: onNewBookmark,
      icon: <BookOutlined />
    },
    {
      label: titleGroup,
      onClick: onNewBookmarkGroup,
      icon: <FolderOutlined />
    },
    {
      label: titleEdit,
      onClick: handleToggleEdit,
      icon: <EditOutlined />
    },
    {
      label: titleImport,
      onClick: () => {
        const fileInput = document.querySelector('.upload-bookmark-icon')
        if (fileInput) {
          fileInput.click()
        }
      },
      icon: <ImportOutlined />
    },
    {
      label: titleExport,
      onClick: onExport,
      icon: <ExportOutlined />
    },
    {
      label: titleSshConfigs,
      onClick: onSshConfigs,
      icon: <CodeOutlined />
    }
  ]

  const ddProps = {
    menu: {
      items
    }
  }

  return (

    <div className='pd1b pd1r cn-bookmark-toolbar'>
      <Flex justify='space-between' align='center'>
        <div>
          <Space.Compact>
            <Tooltip title={titleNew} placement='bottom' mouseEnterDelay={0.2}>
              <Button
                icon={<BookOutlined className='with-plus' />}
                onClick={onNewBookmark}
                aria-label={titleNew}
              />
            </Tooltip>
            <Tooltip title={titleGroup} placement='bottom' mouseEnterDelay={0.2}>
              <Button
                icon={<FolderOutlined className='with-plus' />}
                onClick={onNewBookmarkGroup}
                aria-label={titleGroup}
              />
            </Tooltip>
            <Tooltip title={titleEdit} placement='bottom' mouseEnterDelay={0.2}>
              <Button
                icon={<EditOutlined />}
                onClick={handleToggleEdit}
                aria-label={titleEdit}
              />
            </Tooltip>
            <Tooltip title={titleExport} placement='bottom' mouseEnterDelay={0.2}>
              <Button
                icon={<ExportOutlined />}
                onClick={handleDownload}
                aria-label={titleExport}
                className='download-bookmark-icon'
              />
            </Tooltip>
            <ConnectionImport title={titleImport} />
            <Tooltip title={titleSshConfigs} placement='bottom' mouseEnterDelay={0.2}>
              <Button
                icon={<CodeOutlined />}
                onClick={onSshConfigs}
                aria-label={titleSshConfigs}
              />
            </Tooltip>
          </Space.Compact>
        </div>
        <div>
          <Tooltip title={titleMore} placement='bottom' mouseEnterDelay={0.2}>
            <Dropdown {...ddProps} trigger={['click']}>
              <Button
                type='text'
                icon={<MenuOutlined />}
                aria-label={titleMore}
                className='cn-bookmark-more-button'
              />
            </Dropdown>
          </Tooltip>
        </div>
      </Flex>
    </div>
  )
}
