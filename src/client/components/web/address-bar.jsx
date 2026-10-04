import {
  Input,
  Tooltip,
  Space
} from 'antd'
import { copy } from '../../common/clipboard'
import {
  ReloadOutlined,
  GlobalOutlined
} from '@ant-design/icons'

export default function AddressBar (props) {
  const {
    url,
    onReload,
    onOpen,
    title,
    description
  } = props
  const content = (
    <>
      <h1>{title}</h1>
      <p>{description}</p>
    </>
  )
  function handleClick () {
    copy(url)
  }
  return (
    <div className='web-address-bar pd1'>
      <Tooltip
        title={content}
      >
        <Input
          value={url}
          onClick={handleClick}
          prefix={
            <ReloadOutlined
              onClick={onReload}
            />
          }
          suffix={
            <Space>
              <GlobalOutlined
                className='pointer'
                onClick={onOpen}
                title={window.translate('openInDefaultBrowser')}
              />
            </Space>
          }
        />
      </Tooltip>
    </div>
  )
}
