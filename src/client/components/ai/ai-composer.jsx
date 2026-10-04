import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Input } from 'antd'
import { CloseOutlined, FileTextOutlined, LoadingOutlined, PaperClipOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons'
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, readAiAttachment } from './ai-attachments'

export function AiAttachmentList ({ attachments = [], onRemove }) {
  if (!attachments.length) return null
  return (
    <div className='cn-ai-attachments' aria-label='附件列表'>
      {attachments.map(file => (
        <div className='cn-ai-attachment' key={file.id} title={file.name}>
          {file.kind === 'image' ? <img src={file.dataUrl} alt={file.name} /> : <FileTextOutlined />}
          <span>{file.name}</span>
          {onRemove && <button type='button' title={`移除 ${file.name}`} aria-label={`移除 ${file.name}`} onClick={() => onRemove(file.id)}><CloseOutlined /></button>}
        </div>
      ))}
    </div>
  )
}

const AiComposer = forwardRef(function AiComposer ({ initialValue = '', onDraftPersist, onSubmit, onConfigure, resetKey }, ref) {
  // 2026-09-11 coder(lq): Keep draft state inside the composer so typing never rerenders the transcript or streaming tool output.
  const [value, setValue] = useState(() => String(initialValue || ''))
  const [attachments, setAttachments] = useState([])
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const generation = useRef(0)
  const busy = useRef(false)
  const filesRef = useRef([])
  const valueRef = useRef(value)
  const onDraftPersistRef = useRef(onDraftPersist)
  onDraftPersistRef.current = onDraftPersist

  function updateValue (nextValue) {
    const text = String(nextValue ?? '')
    valueRef.current = text
    setValue(text)
  }

  useImperativeHandle(ref, () => ({
    setPrompt: updateValue,
    submit
  }))

  useEffect(() => {
    // 2026-09-11 coder(lq): Persist only when the composer closes; do not report every keystroke to the parent.
    return () => onDraftPersistRef.current?.(valueRef.current)
  }, [])

  useEffect(() => {
    generation.current++
    filesRef.current = []
    busy.current = false
    setAttachments([])
    setReading(false)
    setError('')
    return () => { generation.current++ }
  }, [resetKey])

  async function addFiles (files) {
    if (busy.current) return
    const batch = Array.from(files)
    if (!batch.length) return
    busy.current = true
    setReading(true)
    setError('')
    const current = generation.current
    const errors = []
    try {
      for (const file of batch) {
        if (filesRef.current.length >= MAX_ATTACHMENTS) {
          errors.push(`每条消息最多添加 ${MAX_ATTACHMENTS} 个附件。`)
          break
        }
        if (filesRef.current.reduce((total, attachment) => total + attachment.size, 0) + file.size > 8 * 1024 * 1024) {
          errors.push(`${file.name}：每条消息的附件合计最多 8 MB。`)
          continue
        }
        try {
          const attachment = await readAiAttachment(file)
          // 2026-09-09 coder(lq): A late file read must not attach data to a different server/conversation.
          if (current !== generation.current) return
          filesRef.current = [...filesRef.current, attachment]
          setAttachments(filesRef.current)
        } catch (error) {
          errors.push(error.message)
        }
        if (current !== generation.current) return
      }
    } finally {
      if (current === generation.current) {
        busy.current = false
        setReading(false)
        setError(errors.join('\n'))
      }
    }
  }

  function removeAttachment (id) {
    filesRef.current = filesRef.current.filter(file => file.id !== id)
    setAttachments(filesRef.current)
  }

  function submit () {
    const currentValue = valueRef.current
    if (busy.current || (!currentValue.trim() && !filesRef.current.length)) return
    if (onSubmit(currentValue, { attachments: filesRef.current }) === true) {
      updateValue('')
      filesRef.current = []
      setAttachments([])
      setError('')
      return true
    }
  }

  function paste (event) {
    const files = Array.from(event.clipboardData?.files || [])
    if (!files.length) return // Plain text keeps native selection replacement and undo behavior.
    event.preventDefault()
    event.stopPropagation()
    if (busy.current) {
      setError('附件读取中，请稍后再粘贴。')
      return
    }
    const text = event.clipboardData.getData('text/plain')
    if (text) {
      const { selectionStart, selectionEnd } = event.target
      updateValue(valueRef.current.slice(0, selectionStart) + text + valueRef.current.slice(selectionEnd))
    }
    addFiles(files)
  }

  return (
    <div className='ai-chat-input cn-ai-composer'>
      <AiAttachmentList attachments={attachments} onRemove={removeAttachment} />
      <Input.TextArea
        value={value}
        onChange={event => updateValue(event.target.value)}
        onPaste={paste}
        onPressEnter={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229 || event.shiftKey) return
          event.preventDefault()
          submit()
        }}
        placeholder='描述任务，或粘贴图片、日志…'
        aria-label='AI 消息'
        autoSize={{ minRows: 7, maxRows: 12 }}
        className='ai-chat-textarea'
      />
      {error && <div className='cn-ai-attachment-error' role='alert'>{error}</div>}
      <div className='ai-chat-terminals'>
        <div className='cn-ai-composer-toolbar'>
          <input ref={inputRef} type='file' accept={ATTACHMENT_ACCEPT} multiple hidden onChange={event => { addFiles(event.target.files); event.target.value = '' }} />
          <div className='cn-ai-action-icons'>
            <button type='button' className='cn-ai-icon-button' title='添加图片或文本文件（也可直接粘贴），发送后交给当前模型分析' aria-label='添加附件' disabled={reading || attachments.length >= MAX_ATTACHMENTS} onClick={() => inputRef.current?.click()}>
              {reading ? <LoadingOutlined /> : <PaperClipOutlined />}
            </button>
          </div>
          <span className='cn-ai-target-select' role='status'>{reading ? '正在读取附件…' : attachments.length ? `${attachments.length}/${MAX_ATTACHMENTS} 个附件` : ''}</span>
          <div className='cn-ai-action-icons'>
            <button type='button' onClick={onConfigure} className='cn-ai-icon-button toggle-ai-setting-icon' title='AI 设置' aria-label='AI 设置'><SettingOutlined /></button>
          </div>
          <button type='button' onClick={submit} disabled={reading || (!value.trim() && !attachments.length)} className='cn-ai-send-button send-to-ai-icon' title='发送给 AI，Enter 发送，Shift+Enter 换行' aria-label='发送给 AI'><SendOutlined /></button>
        </div>
      </div>
    </div>
  )
})

export default AiComposer
