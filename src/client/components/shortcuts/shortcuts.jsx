import { PureComponent } from 'react'
import shortcutsDefaultsGen from './shortcuts-defaults'
import ShortcutEdit from './shortcut-editor'
import deepCopy from 'json-deep-copy'
import {
  Table,
  Button
} from 'antd'
import { isMacJs as isMac } from '../../common/constants.js'
import {
  getKeysTakenData
} from './shortcut-utils.js'

const e = window.translate
const shortcutsDefaults = shortcutsDefaultsGen()

export default class Shortcuts extends PureComponent {
  handleResetAll = () => {
    window.store.updateConfig({
      shortcuts: {}
    })
  }

  updateConfig = (name, value) => {
    const { config } = this.props
    const shortcuts = deepCopy(config.shortcuts || {})
    shortcuts[name] = value
    window.store.updateConfig({
      shortcuts
    })
  }

  getData () {
    const { shortcuts = {} } = this.props.config
    return shortcutsDefaults
      .filter(g => !g.readonly)
      .map((c, i) => {
        const propName = isMac ? 'shortcutMac' : 'shortcut'
        const name = c.name + '_' + propName
        return {
          index: i + 1,
          name,
          readonly: c.readonly,
          shortcut: c.readonly ? c[propName] : (shortcuts[name] || c[propName])
        }
      })
  }

  render () {
    const columns = [
      {
        title: '序号',
        dataIndex: 'index',
        key: 'index',
        render: (index) => {
          return index
        }
      },
      {
        title: e('description'),
        dataIndex: 'name',
        key: 'name',
        render: (name) => {
          const [a, b] = name.split('_')
          const pre = a === 'terminal' ? `[${e('terminal')}] ` : ''
          return pre + e(b)
        }
      },
      {
        title: e('settingShortcuts'),
        dataIndex: 'shortcut',
        key: 'shortcut',
        render: (shortcut, inst) => {
          const { readonly } = inst
          if (readonly) {
            return (
              <span className='readonly'>
                {
                  shortcut.split(',').map(s => {
                    return (
                      <span className='shortcut-unit' key={s}>{s}</span>
                    )
                  })
                }
              </span>
            )
          }
          return (
            <ShortcutEdit
              data={inst}
              keysTaken={getKeysTakenData()}
              updateConfig={this.updateConfig}
            />
          )
        }
      }
    ]
    const props = {
      dataSource: this.getData(),
      columns,
      bordered: true,
      pagination: false,
      size: 'small',
      rowKey: 'id'
    }
    return (
      <div className='form-wrap pd1y pd2x cn-setting-detail-form cn-shortcuts-form'>
        <div className='cn-setting-card-title'>
          <strong>{e('settingShortcuts')}</strong>
          <span>统一管理常用操作快捷键</span>
        </div>
        <section className='cn-settings-section'>
          <div className='cn-settings-section-title'>
            <strong>快捷键列表</strong>
            <span>点击右侧快捷键可重新录入组合键</span>
          </div>
          <Table
            {...props}
          />
        </section>
        <div className='pd1y cn-settings-action-row'>
          <Button
            onClick={this.handleResetAll}
          >
            {e('resetAllToDefault')}
          </Button>
        </div>
      </div>
    )
  }
}
