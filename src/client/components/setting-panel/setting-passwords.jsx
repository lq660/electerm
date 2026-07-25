/**
 * Passwords management component
 * Allows grouping bookmarks by password, changing passwords, and copying passwords
 */
import React, { Component } from 'react'
import {
  CopyOutlined,
  EditOutlined,
  KeyOutlined,
  LaptopOutlined
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Input,
  message
} from 'antd'
import Search from '../common/search'
import InputConfirm from '../common/input-confirm'
import createTitle from '../../common/create-title'
import { settingMap } from '../../common/constants'
import './setting.styl'

const { Text: TextAnt } = Typography
const e = window.translate
const text = key => e(key) || key

export default class SettingPasswords extends Component {
  state = {
    passwordGroups: [],
    newPassword: '',
    editModalVisible: false,
    selectedBookmarks: [],
    search: '',
    pagination: {
      current: 1,
      pageSize: 10
    }
  }

  componentDidMount () {
    this.groupBookmarksByPassword()
  }

  groupBookmarksByPassword = () => {
    const { bookmarks = [] } = this.props
    const passwordMap = new Map()

    bookmarks.forEach(bookmark => {
      const pwd = bookmark.password || ''
      if (!pwd) {
        return
      }
      if (!passwordMap.has(pwd)) {
        passwordMap.set(pwd, [])
      }
      passwordMap.get(pwd).push(bookmark)
    })

    const groups = []
    let index = 0
    passwordMap.forEach((bookmarksList, password) => {
      groups.push({
        id: `password-group-${index}`,
        password,
        count: bookmarksList.length,
        bookmarks: bookmarksList,
        titles: bookmarksList.map(b => createTitle(b))
      })
      index++
    })

    // Sort by count descending
    groups.sort((a, b) => b.count - a.count)

    this.setState({ passwordGroups: groups })
  }

  showEditModal = (record) => {
    this.setState({
      newPassword: '',
      editModalVisible: true,
      selectedBookmarks: record.bookmarks
    })
  }

  handleCopyPassword = (record) => {
    const requiresAppPassword = !!window.pre.requireAuth
    const firstTitle = record.titles && record.titles[0]
      ? record.titles[0]
      : '已保存连接'
    let appPassword = ''
    Modal.confirm({
      title: '复制已保存密码',
      content: (
        <Space direction='vertical' size='middle' className='width-100'>
          <Alert
            type='warning'
            showIcon
            message='复制密码属于敏感操作'
            description='复制前需要二次授权。复制成功后，如果剪贴板内容没有被你替换，云舵会在 30 秒后自动清空。'
          />
          {
            requiresAppPassword
              ? (
                <Input.Password
                  autoFocus
                  placeholder='输入软件访问密码'
                  onChange={event => {
                    appPassword = event.target.value
                  }}
                />
                )
              : (
                <Alert
                  type='info'
                  showIcon
                  message='未设置软件访问密码'
                  description='云舵会尝试使用系统认证；如果当前设备不支持，请先在通用设置里设置软件访问密码。'
                />
                )
          }
        </Space>
      ),
      okText: '授权并复制',
      cancelText: text('cancel') === 'cancel' ? '取消' : text('cancel'),
      onOk: async () => {
        if (requiresAppPassword && !appPassword) {
          message.warning('请输入软件访问密码')
          return false
        }
        try {
          const res = await window.pre.runGlobalAsync('copySensitiveText', record.password, {
            reason: `允许云舵复制 ${firstTitle} 的已保存密码`,
            appPassword,
            clearAfter: 30 * 1000
          })
          if (!res || !res.copied) {
            message.warning(res && res.reason ? res.reason : '未完成授权，密码未复制')
            return false
          }
          message.success('密码已复制，30 秒后自动清空剪贴板')
        } catch (err) {
          message.error(err && err.message ? err.message : '复制密码失败')
          return false
        }
      }
    })
  }

  handleEditConfirm = () => {
    const { newPassword, selectedBookmarks } = this.state
    if (!newPassword) {
      return
    }

    const { editItem } = this.props
    selectedBookmarks.forEach(bookmark => {
      editItem(bookmark.id, { password: newPassword }, settingMap.bookmarks)
    })

    this.setState({
      editModalVisible: false,
      newPassword: ''
    })

    this.groupBookmarksByPassword()
  }

  handleEditCancel = () => {
    this.setState({
      editModalVisible: false,
      newPassword: ''
    })
  }

  handlePasswordChange = (newPwd) => {
    this.setState({ newPassword: newPwd }, this.handleEditConfirm)
  }

  handleSearchChange = (evt) => {
    this.setState({
      search: evt.target.value,
      pagination: { ...this.state.pagination, current: 1 }
    })
  }

  handleTableChange = (pagination) => {
    this.setState({ pagination })
  }

  getFilteredData = () => {
    const { passwordGroups, search } = this.state
    if (!search) {
      return passwordGroups
    }
    const keyword = search.toLowerCase()
    return passwordGroups.filter(group => {
      return group.titles.some(title =>
        title.toLowerCase().includes(keyword)
      )
    })
  }

  getColumns = () => {
    const columns = [
      {
        title: text('password'),
        dataIndex: 'password',
        key: 'password',
        render: () => {
          const props0 = {
            children: [
              <KeyOutlined key='icon' />,
              <TextAnt keyboard key='text'>********</TextAnt>
            ]
          }
          return <Space>{props0.children}</Space>
        }
      },
      {
        title: text('count') === 'count' ? '数量' : text('count'),
        dataIndex: 'count',
        key: 'count',
        width: 80,
        render: (count) => {
          const props0 = {
            color: 'blue',
            children: count
          }
          return <Tag {...props0} />
        }
      },
      {
        title: text('host') === 'host' ? '服务器' : text('host'),
        dataIndex: 'titles',
        key: 'host',
        render: (titles) => {
          const display = titles.length > 2
            ? `${titles.slice(0, 2).join(', ')}... (+${titles.length - 2})`
            : titles.join(', ')
          const props0 = {
            title: titles.join('\n'),
            children: <span>{display}</span>
          }
          return <Tooltip {...props0} />
        }
      },
      {
        title: text('actions') === 'actions' ? '操作' : text('actions'),
        key: 'actions',
        width: 96,
        render: (_, record) => {
          const copyProps0 = {
            type: 'text',
            icon: <CopyOutlined />,
            onClick: () => this.handleCopyPassword(record)
          }
          const editProps0 = {
            type: 'text',
            icon: <EditOutlined />,
            onClick: () => this.showEditModal(record)
          }
          const copyTooltipProps = {
            title: '授权后复制密码',
            children: <Button {...copyProps0} />
          }
          const editTooltipProps = {
            title: text('changePassword') === 'changePassword' ? '重置这一组连接密码' : text('changePassword'),
            children: <Button {...editProps0} />
          }
          const spaceProps0 = {
            children: [
              <Tooltip key='copy' {...copyTooltipProps} />,
              <Tooltip key='edit' {...editTooltipProps} />
            ]
          }
          return <Space>{spaceProps0.children}</Space>
        }
      }
    ]
    return columns
  }

  renderContent () {
    const { search, pagination } = this.state
    const data = this.getFilteredData()

    if (data.length === 0) {
      return (
        <div className='setting-passwords-empty'>
          <LaptopOutlined style={{ fontSize: 48, color: '#ccc' }} />
          <p>暂无已保存密码</p>
          <span>保存服务器连接密码后，可在这里按密码聚合维护。</span>
        </div>
      )
    }

    const searchProps0 = {
      value: search,
      onChange: this.handleSearchChange,
      placeholder: text('search') === 'search' ? '搜索服务器' : text('search')
    }
    const tableProps0 = {
      dataSource: data,
      columns: this.getColumns(),
      rowKey: 'id',
      pagination: { ...pagination, showSizeChanger: true },
      onChange: this.handleTableChange,
      size: 'small'
    }

    return (
      <div>
        <Search {...searchProps0} />
        <Table {...tableProps0} />
      </div>
    )
  }

  render () {
    const { editModalVisible, newPassword, selectedBookmarks } = this.state

    const modalProps0 = {
      title: text('changePassword') === 'changePassword' ? '修改密码' : text('changePassword'),
      open: editModalVisible,
      onCancel: this.handleEditCancel,
      footer: null
    }

    return (
      <div className='form-wrap pd1y pd2x cn-setting-detail-form setting-passwords'>
        <div className='cn-setting-card-title setting-passwords-header'>
          <strong>
            <KeyOutlined /> 密码管理
          </strong>
          <span>按服务器连接聚合和维护保存的密码，默认不明文展示或复制</span>
        </div>

        {this.renderContent()}

        <Modal {...modalProps0}>
          <div className='password-edit-form'>
            <Alert
              type='info'
              showIcon
              className='mg1b'
              message='出于安全考虑，这里不会显示原密码'
              description='输入新密码后，会同步更新这一组使用相同旧密码的连接。'
            />
            <InputConfirm
              value={newPassword}
              onChange={this.handlePasswordChange}
              placeholder={text('newPassword') === 'newPassword' ? '请输入新密码' : text('newPassword')}
              inputComponent={Input.Password}
            />
            <div className='affected-bookmarks pd2y'>
              <h3>影响的服务器</h3>
              {
                selectedBookmarks.map(b => (
                  <p key={b.id}>
                    # {createTitle(b)}
                  </p>
                ))
              }
            </div>
          </div>
        </Modal>
      </div>
    )
  }
}
