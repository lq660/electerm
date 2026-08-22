import {
  settingSyncId,
  settingShortcutsId,
  settingTerminalId,
  settingAiId,
  settingPasswordsId,
  settingSubscriptionId
} from '../common/constants'

const e = window.translate

export default () => ([
  {
    id: settingSubscriptionId,
    title: '版本与订阅'
  },
  {
    id: settingTerminalId,
    title: e('terminal')
  },
  {
    id: settingShortcutsId,
    title: e('settingShortcuts')
  },
  {
    id: settingSyncId,
    title: e('settingSync')
  },
  {
    id: settingAiId,
    title: 'AI'
  },
  {
    id: settingPasswordsId,
    title: e('password')
  }
])
