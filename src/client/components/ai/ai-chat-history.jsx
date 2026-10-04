// ai-chat-history.jsx
import { useEffect, useLayoutEffect, useRef } from 'react'
import { auto } from 'manate/react'
import AIChatHistoryItem from './ai-chat-history-item'
import { buildAiConversationGroups } from '../../common/ai-chat-scope'
import { CopyOutlined } from '@ant-design/icons'
import { copy } from '../../common/clipboard'

export default auto(function AIChatHistory ({ history, searchQuery = '', readOnly = false }) {
  const historyRef = useRef(null)
  const prevHistoryLengthRef = useRef(0)
  const stickToBottomRef = useRef(true)
  const autoScrollFrameRef = useRef(null)

  function getScrollOwner () {
    return historyRef.current?.closest('.ai-chat-history')
  }

  function scrollToBottom () {
    const scrollOwner = getScrollOwner()
    if (!scrollOwner) {
      return
    }
    // 2026-08-30 coder(lq): Scroll after layout settles; streaming markdown and tool cards can change height one frame after React commits.
    stickToBottomRef.current = true
    const bottom = Math.max(0, scrollOwner.scrollHeight - scrollOwner.clientHeight)
    scrollOwner.scrollTop = bottom
    if (typeof scrollOwner.scrollTo === 'function') {
      scrollOwner.scrollTo({ top: bottom, behavior: 'auto' })
    }
  }

  function scheduleScrollToBottom () {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
    }
    autoScrollFrameRef.current = requestAnimationFrame(() => {
      autoScrollFrameRef.current = null
      if (stickToBottomRef.current) {
        scrollToBottom()
      }
    })
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
    // 2026-08-30 coder(lq): Do not classify the initial top position as an intentional user scroll; the first render should follow the newest transcript.
    scrollOwner.addEventListener('scroll', handleScroll)
    scheduleScrollToBottom()
    return () => scrollOwner.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const content = historyRef.current
    const scrollOwner = getScrollOwner()
    if (!content || !scrollOwner || typeof window.ResizeObserver !== 'function') {
      return
    }
    // 2026-08-30 coder(lq): Markdown, code blocks and tool results can grow after a stream update; keep following only while the user remains near the bottom.
    const resizeObserver = new window.ResizeObserver(() => {
      if (stickToBottomRef.current) {
        scheduleScrollToBottom()
      }
    })
    resizeObserver.observe(content)
    const mutationObserver = typeof window.MutationObserver === 'function'
      ? new window.MutationObserver(() => {
        if (stickToBottomRef.current) {
          scheduleScrollToBottom()
        }
      })
      : null
    mutationObserver?.observe(content, { childList: true, subtree: true, characterData: true })
    return () => {
      resizeObserver.disconnect()
      mutationObserver?.disconnect()
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current)
        autoScrollFrameRef.current = null
      }
    }
  }, [])

  useLayoutEffect(() => {
    const scrollOwner = getScrollOwner()
    const hasNewMessage = history.length > prevHistoryLengthRef.current
    // 2026-07-20 coder(lq): Streaming responses should not pull the user back down while they are reviewing earlier AI content.
    if (scrollOwner && (hasNewMessage || stickToBottomRef.current)) {
      scheduleScrollToBottom()
    }
    prevHistoryLengthRef.current = history.length
  }, [history])

  function formatConversation (group) {
    return group.items.map((item, index) => {
      const lines = [`第 ${index + 1} 轮`, `用户：${item.prompt || ''}`]
      if (item.toolCalls?.length) {
        item.toolCalls.forEach((toolCall) => {
          if (toolCall.args?.command) {
            lines.push(`终端命令：${toolCall.args.command}`)
          }
          if (toolCall.result) {
            lines.push(`命令结果：\n${toolCall.result}`)
          }
        })
      }
      if (item.response) {
        lines.push(`AI：${item.response}`)
      }
      return lines.join('\n')
    }).join('\n\n')
  }

  function handleCopyConversation (group) {
    copy(formatConversation(group))
  }

  function matchesSearch (item, query) {
    const searchableText = [
      item.prompt,
      item.response,
      ...(item.toolCalls || []).flatMap(toolCall => [
        toolCall.name,
        toolCall.args?.command,
        toolCall.result
      ])
    ].filter(Boolean).join('\n').toLocaleLowerCase()
    return searchableText.includes(query)
  }

  if (!history.length) {
    return <div ref={historyRef} className='ai-history-wrap' />
  }
  const groups = buildAiConversationGroups(history)
  const normalizedQuery = String(searchQuery || '').trim().toLocaleLowerCase()
  const visibleGroups = groups.map(group => {
    if (!normalizedQuery) {
      return { ...group, visibleItems: group.items }
    }
    const titleMatches = String(group.items[0]?.prompt || '').toLocaleLowerCase().includes(normalizedQuery)
    return {
      ...group,
      visibleItems: titleMatches ? group.items : group.items.filter(item => matchesSearch(item, normalizedQuery))
    }
  })
  return (
    <div ref={historyRef} className='ai-history-wrap'>
      {
        visibleGroups.map(group => {
          const isMultiRound = group.visibleItems.length > 1
          return (
            <section
              key={group.id}
              className={'ai-conversation-group ai-chat-conversation' + (isMultiRound ? ' is-multi-round' : '')}
              aria-label={isMultiRound ? `${group.items[0].prompt}，${group.visibleItems.length} 轮对话` : group.items[0].prompt}
            >
              <div className='ai-conversation-group-header'>
                <div className='ai-conversation-group-title'>
                  <strong>会话</strong>
                </div>
                {!readOnly && (
                  <div className='ai-conversation-group-actions'>
                    <button
                      type='button'
                      className='ai-history-meta-action'
                      onClick={() => handleCopyConversation(group)}
                      aria-label='复制整个会话'
                      title='复制整个会话'
                    >
                      <CopyOutlined />
                    </button>
                  </div>
                )}
              </div>
              <div className='ai-conversation-turns'>
                {group.visibleItems.map((item) => (
                  <AIChatHistoryItem
                    key={item.id}
                    item={item}
                    readOnly={readOnly}
                    searchQuery={searchQuery}
                  />
                ))}
                {normalizedQuery && !group.visibleItems.length && (
                  <div className='ai-history-search-empty' role='status'>没有找到匹配内容</div>
                )}
              </div>
            </section>
          )
        })
      }
    </div>
  )
})
