import {
  Form,
  InputNumber,
  Space,
  Button,
  Input
} from 'antd'
import { MinusCircleOutlined, PlusOutlined, HolderOutlined } from '@ant-design/icons'
import HelpIcon from '../common/help-icon'
import { copy } from '../../common/clipboard'
import { useRef } from 'react'

const FormItem = Form.Item
const FormList = Form.List

export default function renderQm (form) {
  const focused = useRef(0)
  const dragIndexRef = useRef(null)

  function handleDragStart (e, index) {
    dragIndexRef.current = index
    e.target.closest('.ant-space-compact')?.classList.add('qm-field-dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  function handleDragOver (e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const el = e.target.closest('.ant-space-compact')
    if (dragIndexRef.current !== index && el) {
      el.classList.add('qm-field-dragover')
    }
  }

  function handleDragLeave (e) {
    e.target.closest('.ant-space-compact')?.classList.remove('qm-field-dragover')
  }

  function handleDrop (e, index, form) {
    e.preventDefault()
    const el = e.target.closest('.ant-space-compact')
    el?.classList.remove('qm-field-dragover')
    const dragIndex = dragIndexRef.current
    if (dragIndex === null || dragIndex === index) {
      dragIndexRef.current = null
      return
    }
    const commands = form.getFieldValue('commands') || []
    const item = commands[dragIndex]
    const newCommands = [...commands]
    newCommands.splice(dragIndex, 1)
    newCommands.splice(index, 0, item)
    form.setFieldValue('commands', newCommands)
    dragIndexRef.current = null
  }

  function handleDragEnd (e) {
    const el = e.target.closest('.ant-space-compact')
    el?.classList.remove('qm-field-dragging')
    el?.classList.remove('qm-field-dragover')
    dragIndexRef.current = null
  }

  function renderItem (field, i, add, remove, form) {
    return (
      <Space.Compact
        align='center'
        className='width-100 mg2b cn-qm-command-row'
        key={field.key}
        draggable
        onDragStart={(e) => handleDragStart(e, i)}
        onDragOver={(e) => handleDragOver(e, i)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, i, form)}
        onDragEnd={handleDragEnd}
      >
        <HolderOutlined className='mg1r drag' />

        <Space.Addon>延迟</Space.Addon>
        <FormItem
          label=''
          name={[field.name, 'delay']}
          required
          noStyle
        >
          <InputNumber
            min={1}
            step={1}
            max={65535}
            placeholder={100}
            className='compact-input'
            suffix='ms'
          />
        </FormItem>
        <FormItem
          label=''
          name={[field.name, 'command']}
          required
          className='mg2x'
          noStyle
        >
          <Input.TextArea
            autoSize={{ minRows: 1 }}
            placeholder='请输入命令内容'
            className='compact-input qm-input'
            onFocus={() => {
              focused.current = i
            }}
          />
        </FormItem>
        <Button
          icon={<MinusCircleOutlined />}
          onClick={() => remove(field.name)}
        />
      </Space.Compact>
    )
  }
  const commonCmds = [
    { cmd: 'ls', desc: '列出目录内容' },
    { cmd: 'cd', desc: '切换当前目录' },
    { cmd: 'pwd', desc: '显示当前路径' },
    { cmd: 'cp', desc: '复制文件或目录' },
    { cmd: 'mv', desc: '移动或重命名文件' },
    { cmd: 'rm', desc: '删除文件或目录' },
    { cmd: 'mkdir', desc: '创建目录' },
    { cmd: 'rmdir', desc: '删除空目录' },
    { cmd: 'touch', desc: '创建空文件或更新时间戳' },
    { cmd: 'chmod', desc: '修改文件权限' },
    { cmd: 'chown', desc: '修改文件属主和属组' },
    { cmd: 'cat', desc: '查看文件内容' },
    { cmd: 'echo', desc: '输出文本或变量' },
    { cmd: 'grep', desc: '按模式搜索文本' },
    { cmd: 'find', desc: '查找文件' },
    { cmd: 'df', desc: '查看文件系统空间' },
    { cmd: 'du', desc: '统计文件空间占用' },
    { cmd: 'top', desc: '查看进程和资源占用' },
    { cmd: 'ps', desc: '查看进程快照' },
    { cmd: 'kill', desc: '向进程发送信号' }
  ]

  const cmds = commonCmds.map(c => {
    return (
      <Button
        title={c.desc}
        type='text'
        key={c.cmd}
        size='small'
        onClick={() => {
          copy(c.cmd)
        }}
      >
        <b className='pointer'>{c.cmd}</b>
      </Button>
    )
  })
  const label = (
    <div>
      命令步骤
      <HelpIcon
        title={cmds}
      />
    </div>
  )
  return (
    <FormItem label={label} className='cn-qm-command-list'>
      <FormList
        name='commands'
      >
        {
          (fields, { add, remove }, { errors }) => {
            return (
              <>
                {
                  fields.map((field, i) => {
                    return renderItem(field, i, add, remove, form)
                  })
                }
                <FormItem>
                  <Button
                    type='dashed'
                    onClick={() => add()}
                    icon={<PlusOutlined />}
                  >
                    新增命令
                  </Button>
                </FormItem>
              </>
            )
          }
        }
      </FormList>
    </FormItem>
  )
}
