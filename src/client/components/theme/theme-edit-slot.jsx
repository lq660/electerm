import { ColorPicker } from '../bookmark-form/common/color-picker'

const themeLabelMap = {
  'main-dark': '深色主背景',
  'main-light': '浅色主背景',
  text: '主文本',
  'text-light': '浅色文本',
  'text-dark': '深色文本',
  'text-disabled': '禁用文本',
  primary: '主色',
  info: '信息色',
  success: '成功色',
  error: '错误色',
  warn: '警告色',
  main: '界面主背景',
  foreground: '终端文字',
  background: '终端底色',
  cursor: '光标',
  selectionBackground: '选中文本背景',
  black: '黑色',
  red: '红色',
  green: '绿色',
  yellow: '黄色',
  blue: '蓝色',
  magenta: '品红',
  cyan: '青色',
  white: '白色',
  brightBlack: '亮黑',
  brightRed: '亮红',
  brightGreen: '亮绿',
  brightYellow: '亮黄',
  brightBlue: '亮蓝',
  brightMagenta: '亮品红',
  brightCyan: '亮青',
  brightWhite: '亮白'
}

function getThemeLabel (name) {
  const cleanName = name.replace('terminal:', '')
  return themeLabelMap[cleanName] || cleanName
}

export default function ThemeEditSlot (props) {
  const {
    name,
    value,
    disabled
  } = props
  function onChange (v) {
    props.onChange(v, name)
  }
  const pickerProps = {
    value,
    onChange,
    isRgba: value.startsWith('rgba'),
    disabled
  }
  return (
    <div className='theme-edit-slot'>
      <span className='theme-edit-slot-label'>
        <strong>{getThemeLabel(name)}</strong>
        <em>{name}</em>
      </span>
      <span className='theme-edit-slot-picker'>
        <ColorPicker
          {...pickerProps}
        />
      </span>
    </div>
  )
}
