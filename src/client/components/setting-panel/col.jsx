/**
 * two column layout, left column fixed with, right column auto width
 */

export default function SettingCol (props) {
  // 2026-07-03 coder(lq): Keep every settings tab in the same master-detail layout so users can distinguish navigation from editable detail.
  const {
    leftTitle = '分类列表',
    leftDesc = '选择要维护的对象',
    rightTitle = '详情配置',
    rightDesc = '编辑当前选中项',
    className = ''
  } = props
  return (
    <div className={`setting-col ${className}`}>
      <div className='setting-row setting-row-left cn-master-pane'>
        <div className='cn-setting-column-head'>
          <strong>{leftTitle}</strong>
          <span>{leftDesc}</span>
        </div>
        {props.children[0]}
      </div>
      <div
        className='setting-row setting-row-right cn-detail-pane'
      >
        <div className='cn-setting-column-head detail'>
          <strong>{rightTitle}</strong>
          <span>{rightDesc}</span>
        </div>
        {props.children[1]}
      </div>
    </div>
  )
}
