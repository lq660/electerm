import { useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { copy } from '../../common/clipboard'
import { CopyOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { HighlightedText, createSearchHighlightPlugin } from './search-highlight'

const e = window.translate

export default function AIOutput ({ item = {}, content, variant = 'answer', searchQuery = '' }) {
  const outputRef = useRef(null)
  const response = content !== undefined ? content : item.response || item.streamingResponse

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [response])

  if (!response) {
    return null
  }

  const renderCode = (props) => {
    const { node, className = '', children, ...rest } = props
    const code = String(children).replace(/\n$/, '')
    const inline = !className.includes('language-')
    if (inline) {
      return (
        <code className={className} {...props}>
          <HighlightedText text={code} query={searchQuery} />
        </code>
      )
    }

    const copyToClipboard = () => {
      copy(code)
    }

    const runInTerminal = () => {
      // Filter out comments from the code before running
      const filteredCode = code
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
          // Remove empty lines and comments
          if (!line) {
            return false
          }
          if (line.startsWith('#')) {
            return false
          }
          return true
        })
        .join('\n') // Join multiple commands with &&

      if (filteredCode) {
        window.store.runCommandInTerminal(filteredCode)
      }
    }

    return (
      <div className='code-block'>
        <div className='code-block-actions alignright'>
          <button
            type='button'
            className='code-action-icon pointer iblock'
            onClick={copyToClipboard}
            title={e('copy')}
            aria-label={e('copy')}
          >
            <CopyOutlined />
          </button>
          <button
            type='button'
            className='code-action-icon pointer mg1l iblock'
            onClick={runInTerminal}
            title='发送到终端执行'
            aria-label='发送到终端执行'
          >
            <PlayCircleOutlined />
          </button>
        </div>
        <pre>
          <code className={className} {...rest}>
            <HighlightedText text={code} query={searchQuery} />
          </code>
        </pre>
      </div>
    )
  }

  const mdProps = {
    children: response,
    rehypePlugins: searchQuery ? [createSearchHighlightPlugin(searchQuery)] : undefined,
    components: {
      code: renderCode
    }
  }

  return (
    <div className={`ai-stream-output ai-${variant}-output`} ref={outputRef}>
      <div className='pd1'>
        <ReactMarkdown {...mdProps} />
      </div>
    </div>
  )
}
