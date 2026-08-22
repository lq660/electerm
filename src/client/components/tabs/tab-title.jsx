import { createHeaderTitle } from '../../common/create-title'

export default function tabTitle (props) {
  const { tab } = props
  const title = createHeaderTitle(tab)
  return (
    <span className='tab-title'>
      {title}
    </span>
  )
}
