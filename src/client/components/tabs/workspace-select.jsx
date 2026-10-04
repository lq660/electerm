/**
 * Workspace select content component
 */

import React from 'react'
import { Button, Empty, Popconfirm } from 'antd'
import {
  SaveOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import { auto } from 'manate/react'

const e = window.translate

export default auto(function WorkspaceSelect (props) {
  const { store } = props
  const { workspaces } = store

  function handleLoadWorkspace (id) {
    window.store.loadWorkspace(id)
  }

  function handleDeleteWorkspace (id, ev) {
    ev.stopPropagation()
    window.store.deleteWorkspace(id)
  }

  function handleSaveClick () {
    window.store.workspaceSaveModalVisible = true
  }

  // 2026-10-04 coder(lq): Render confirmation inside the Settings drawer so
  // its higher stacking context stays clickable.
  function getPopupContainer (trigger) {
    return trigger.closest('.custom-drawer-content') || document.body
  }

  return (
    <div className='workspace-menu-content'>
      <div className='workspace-save-btn pd1b'>
        <Button
          type='primary'
          icon={<SaveOutlined />}
          size='small'
          onClick={handleSaveClick}
          block
        >
          {e('save')}
        </Button>
      </div>
      {workspaces.length === 0
        ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={e('noItems')}
          />
          )
        : (
          <div className='workspace-list'>
            {workspaces.map(ws => (
              <div
                key={ws.id}
                className='workspace-item'
                role='button'
                tabIndex={0}
                onClick={() => handleLoadWorkspace(ws.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleLoadWorkspace(ws.id)
                  }
                }}
              >
                <span className='workspace-name'>{ws.name}</span>
                <Popconfirm
                  title={e('del') + '?'}
                  onConfirm={(ev) => handleDeleteWorkspace(ws.id, ev)}
                  onCancel={(ev) => ev.stopPropagation()}
                  okText={e('ok')}
                  cancelText={e('cancel')}
                  getPopupContainer={getPopupContainer}
                >
                  <button
                    type='button'
                    className='workspace-delete-icon'
                    aria-label={`${e('del')} ${ws.name}`}
                    title={e('del')}
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <DeleteOutlined />
                  </button>
                </Popconfirm>
              </div>
            ))}
          </div>
          )}
    </div>
  )
})
