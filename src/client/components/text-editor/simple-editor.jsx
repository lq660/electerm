import React, { useState, useEffect, useRef } from 'react'
import { Input, Button, Flex, Tooltip } from 'antd'
import classnames from 'classnames'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  SearchOutlined,
  CopyOutlined
} from '@ant-design/icons'
import { copy } from '../../common/clipboard'
import { escapeRegExp } from 'lodash-es'

const e = window.translate

export default function SimpleEditor (props) {
  const text = props.value || ''
  const [searchKeyword, setSearchKeyword] = useState('')
  const [occurrences, setOccurrences] = useState([])
  const [currentMatch, setCurrentMatch] = useState(-1)
  const [isNavigating, setIsNavigating] = useState(false)
  const editorRef = useRef(null)
  const textareaProps = props.textareaProps || {}
  const {
    style: textareaStyleFromProps,
    className: textareaClassName,
    ...textareaRestProps
  } = textareaProps

  // When currentMatch changes, highlight the match in textarea
  useEffect(() => {
    // Only process navigation when explicitly triggered (not when text changes)
    if (!isNavigating) {
      return
    }

    if (currentMatch >= 0 && occurrences.length > 0) {
      const match = occurrences[currentMatch]
      if (editorRef.current) {
        const textarea = editorRef.current.resizableTextArea.textArea

        // Set selection range to select the matched text
        textarea.setSelectionRange(match.start, match.end)

        // Focus the textarea when explicitly navigating to show highlight
        textarea.focus()

        // Scroll to the selection position
        // Use setTimeout to ensure the selection is rendered before scrolling
        setTimeout(() => {
          const textBeforeSelection = text.substring(0, match.start)
          const lineBreaks = textBeforeSelection.split('\n').length - 1

          // Estimate the scroll position
          const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight) || 20
          const scrollPosition = lineHeight * lineBreaks

          // Scroll to center the match, but ensure we can scroll to the bottom
          const targetScroll = scrollPosition - textarea.clientHeight / 2
          const maxScroll = textarea.scrollHeight - textarea.clientHeight

          textarea.scrollTop = Math.max(0, Math.min(targetScroll, maxScroll))
        }, 0)
      }
    }
    // Reset navigating flag after using it
    setIsNavigating(false)
  }, [currentMatch, occurrences])

  // Auto-search while typing and keep the match list in sync with editor text.
  useEffect(() => {
    syncMatches()
  }, [searchKeyword, text])

  // Copy the editor content to clipboard
  const copyEditorContent = () => {
    copy(text)
  }

  // Find all matches of the search keyword in text
  const findMatches = (editorText = text) => {
    if (!searchKeyword) {
      setOccurrences([])
      setCurrentMatch(-1)
      return
    }

    const matches = []
    const escapedKeyword = escapeRegExp(searchKeyword)
    const regex = new RegExp(escapedKeyword, 'gi')
    let match

    while ((match = regex.exec(editorText)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + searchKeyword.length
      })
    }
    setOccurrences(matches)
    setCurrentMatch(matches.length ? 0 : -1)
  }

  // Sync matches with current keyword/text.
  const syncMatches = () => {
    if (!searchKeyword) {
      setOccurrences([])
      setCurrentMatch(-1)
      return
    }

    findMatches(text)
  }

  function handleChange (e) {
    setSearchKeyword(e.target.value)
  }

  // Navigate to next match
  const goToNextMatch = () => {
    if (!occurrences.length) {
      return
    }
    setIsNavigating(true)
    if (currentMatch < occurrences.length - 1) {
      setCurrentMatch(currentMatch + 1)
    } else {
      setCurrentMatch(0) // Loop back to first match
    }
  }

  // Navigate to previous match
  const goToPrevMatch = () => {
    if (!occurrences.length) {
      return
    }
    setIsNavigating(true)
    if (currentMatch > 0) {
      setCurrentMatch(currentMatch - 1)
    } else {
      setCurrentMatch(occurrences.length - 1) // Loop to last match
    }
  }

  // Render navigation buttons for search results
  const renderNavigationButtons = () => {
    if (occurrences.length === 0) {
      return null
    }
    return (
      <>
        <Button onClick={goToPrevMatch} size='small' type='text'>
          <ArrowUpOutlined />
        </Button>
        <Button onClick={goToNextMatch} size='small' type='text'>
          <ArrowDownOutlined />
        </Button>
      </>
    )
  }

  // Render search results counter
  const renderSearchCounter = () => {
    return occurrences.length
      ? `${currentMatch + 1}/${occurrences.length}`
      : '0/0'
  }

  function renderAfter () {
    return (
      <>
        <b className='pd1x'>{renderSearchCounter()}</b>
        {renderNavigationButtons()}
      </>
    )
  }

  return (
    <div
      className={classnames('simple-editor', props.className)}
      style={props.style}
    >
      <Flex className='simple-editor-toolbar' align='center' gap={8}>
        <Input
          className='simple-editor-search'
          value={searchKeyword}
          onChange={handleChange}
          placeholder='在文本中搜索...'
          allowClear
          prefix={<SearchOutlined />}
          suffix={renderAfter()}
        />
        <Tooltip title={e('copy')}>
          <Button
            onClick={copyEditorContent}
            aria-label={e('copy')}
            title={e('copy')}
            type='text'
            size='small'
            icon={<CopyOutlined />}
          />
        </Tooltip>
      </Flex>
      <div className='simple-editor-editor'>
        <Input.TextArea
          ref={editorRef}
          className={classnames('simple-editor-textarea', textareaClassName)}
          value={text}
          onChange={props.onChange}
          rows={props.textareaRows || 20}
          autoSize={props.textareaAutoSize}
          style={{
            width: '100%',
            minWidth: 0,
            flex: 1,
            minHeight: 0,
            height: '100%',
            ...(textareaStyleFromProps || {})
          }}
          {...textareaRestProps}
        />
      </div>
    </div>
  )
}
