// ai-chat-history.jsx
import { useEffect, useLayoutEffect, useRef } from 'react'
import { auto } from 'manate/react'
import AIChatHistoryItem from './ai-chat-history-item'

export default auto(function AIChatHistory ({ history }) {
  const historyRef = useRef(null)
  const prevHistoryLengthRef = useRef(0)
  const stickToBottomRef = useRef(true)

  function getScrollOwner () {
    return historyRef.current?.closest('.ai-chat-history')
  }

  useEffect(() => {
    const scrollOwner = getScrollOwner()
    if (!scrollOwner) {
      return
    }
    const handleScroll = () => {
      const distanceToBottom = scrollOwner.scrollHeight - scrollOwner.scrollTop - scrollOwner.clientHeight
      stickToBottomRef.current = distanceToBottom < 48
    }
    handleScroll()
    scrollOwner.addEventListener('scroll', handleScroll)
    return () => scrollOwner.removeEventListener('scroll', handleScroll)
  }, [])

  useLayoutEffect(() => {
    const scrollOwner = getScrollOwner()
    const hasNewMessage = history.length > prevHistoryLengthRef.current
    // 2026-07-20 coder(lq): Streaming responses should not pull the user back down while they are reviewing earlier AI content.
    if (scrollOwner && (hasNewMessage || stickToBottomRef.current)) {
      scrollOwner.scrollTop = scrollOwner.scrollHeight
      stickToBottomRef.current = true
    }
    prevHistoryLengthRef.current = history.length
  }, [history])
  if (!history.length) {
    return <div />
  }
  return (
    <div ref={historyRef} className='ai-history-wrap'>
      {
        history.map((item) => {
          return (
            <AIChatHistoryItem
              key={item.id}
              item={item}
            />
          )
        })
      }
    </div>
  )
})
