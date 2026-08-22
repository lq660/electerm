import ZoomControl from '../common/zoom-control'

export default function ZoomMenu (props) {
  const { store } = window
  return (
    <div className='cn-menu-zoom-control'>
      <span>界面缩放</span>
      <ZoomControl
        value={props.config.zoom}
        onChange={(v) => store.zoom(v)}
      />
    </div>
  )
}
