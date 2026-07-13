import { formItemLayout } from '../../../common/form-layout.js'
import { terminalSerialType, commonBaudRates, commonDataBits, commonStopBits, commonParities, commonTxLineEndings, commonRxLineEndings } from '../../../common/constants.js'
import defaultSettings from '../../../common/default-setting.js'
import { createBaseInitValues, getTerminalBackgroundDefaults } from '../common/init-values.js'
import { commonFields } from './common-fields.js'

const e = window.translate
const renderOptionLabel = d => d === 'none' ? e('none') : d
const renderLineEndingOption = d => ({
  value: d.value,
  label: d.value === 'none' ? e('none') : d.label
})

const serialConfig = {
  key: 'serial',
  type: terminalSerialType,
  initValues: (props) => {
    return createBaseInitValues(props, terminalSerialType, {
      baudRate: 9600,
      dataBits: 8,
      lock: true,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
      xon: false,
      xoff: false,
      xany: false,
      term: defaultSettings.terminalType,
      displayRaw: false,
      runScripts: [{}],
      ignoreKeyboardInteractive: false,
      ...getTerminalBackgroundDefaults(defaultSettings)
    })
  },
  layout: formItemLayout,
  tabs: () => [
    {
      key: 'auth',
      label: e('auth'),
      fields: [
        commonFields.category,
        commonFields.colorTitle,
        { type: 'serialPathSelector', name: 'path', label: () => e('path'), rules: [{ required: true, message: '请输入串口路径' }] },
        {
          type: 'autocomplete',
          name: 'baudRate',
          label: () => e('baudRate'),
          options: commonBaudRates.map(d => ({ value: d.toString(), label: d.toString() })),
          normalize: (value) => {
            if (value === '' || value == null) {
              return undefined
            }
            const numValue = Number(value)
            return isNaN(numValue) ? undefined : numValue
          }
        },
        { type: 'select', name: 'dataBits', label: () => e('dataBits'), options: commonDataBits.map(d => ({ value: d, label: d })) },
        { type: 'select', name: 'stopBits', label: () => e('stopBits'), options: commonStopBits.map(d => ({ value: d, label: d })) },
        { type: 'select', name: 'parity', label: () => e('parity'), options: commonParities.map(d => ({ value: d, label: renderOptionLabel(d) })) },
        { type: 'switch', name: 'lock', label: () => e('lock'), valuePropName: 'checked' },
        { type: 'switch', name: 'rtscts', label: () => e('rtscts'), valuePropName: 'checked' },
        { type: 'switch', name: 'xon', label: () => e('xon'), valuePropName: 'checked' },
        { type: 'switch', name: 'xoff', label: () => e('xoff'), valuePropName: 'checked' },
        { type: 'switch', name: 'xany', label: () => e('xany'), valuePropName: 'checked' },
        { type: 'select', name: 'txLineEnding', label: () => e('txLineEnding'), options: commonTxLineEndings.map(renderLineEndingOption) },
        { type: 'select', name: 'rxLineEnding', label: () => e('rxLineEnding'), options: commonRxLineEndings.map(renderLineEndingOption) },
        commonFields.runScripts,
        commonFields.description,
        { type: 'input', name: 'type', label: () => e('type'), hidden: true }
      ]
    },
    {
      key: 'settings',
      label: e('settings'),
      fields: [
        { type: 'terminalBackground', name: 'terminalBackground', label: () => e('terminalBackgroundImage') }
      ]
    },
    {
      key: 'quickCommands',
      label: e('quickCommands'),
      fields: [
        { type: 'quickCommands', name: '__quick__', label: '' }
      ]
    }
  ]
}

export default serialConfig
