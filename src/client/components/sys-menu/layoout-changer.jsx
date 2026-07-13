import {
  SingleIcon,
  TwoColumnsIcon,
  ThreeColumnsIcon,
  TwoRowsIcon,
  ThreeRowsIcon,
  Grid2x2Icon,
  TwoRowsRightIcon,
  TwoColumnsBottomIcon
} from '../icons/split-icons'
import {
  splitMapDesc
} from '../../common/constants'

const layoutNameMap = {
  single: '单窗口',
  twoColumns: '左右两栏',
  threeColumns: '三栏布局',
  twoRows: '上下两行',
  threeRows: '三行布局',
  grid2x2: '四宫格',
  twoRowsRight: '右侧上下分栏',
  twoColumnsBottom: '底部左右分栏'
}

export default function LayoutChanger (props) {
  const getLayoutIcon = (layout) => {
    const iconMaps = {
      single: SingleIcon,
      twoColumns: TwoColumnsIcon,
      threeColumns: ThreeColumnsIcon,
      twoRows: TwoRowsIcon,
      threeRows: ThreeRowsIcon,
      grid2x2: Grid2x2Icon,
      twoRowsRight: TwoRowsRightIcon,
      twoColumnsBottom: TwoColumnsBottomIcon
    }
    return iconMaps[layout]
  }

  const handleChangeLayout = ({ key }) => {
    window.store.setLayout(key)
  }

  const items = Object.keys(splitMapDesc).map((t) => {
    const v = splitMapDesc[t]
    const Icon = getLayoutIcon(v)
    return (
      <div
        key={t}
        className='sub-context-menu-item'
        onClick={() => handleChangeLayout({ key: t })}
      >
        <span>
          <Icon /> {layoutNameMap[v] || v}
        </span>
      </div>
    )
  })

  return (
    <div className='sub-context-menu bookmarks-sub-context-menu'>
      {items}
    </div>
  )
}
