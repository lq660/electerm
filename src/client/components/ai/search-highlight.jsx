import { Fragment } from 'react'

// 2026-09-04 coder(lq): Keep search highlighting in React's render tree so streaming updates cannot leave stale DOM marks behind.
function escapeRegExp (value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function highlightText (text, query) {
  const value = String(text ?? '')
  const normalizedQuery = String(query || '').trim()
  if (!normalizedQuery) {
    return value
  }
  const matcher = new RegExp(escapeRegExp(normalizedQuery), 'gi')
  const parts = []
  let lastIndex = 0
  let matchIndex = 0
  value.replace(matcher, (match, offset) => {
    if (offset > lastIndex) {
      parts.push(value.slice(lastIndex, offset))
    }
    parts.push(<mark key={`search-${matchIndex++}`} className='ai-search-highlight'>{match}</mark>)
    lastIndex = offset + match.length
    return match
  })
  if (!parts.length) {
    return value
  }
  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex))
  }
  return parts.map((part, index) => (
    typeof part === 'string' ? <Fragment key={`text-${index}`}>{part}</Fragment> : part
  ))
}

export function HighlightedText ({ text, query, className }) {
  const content = highlightText(text, query)
  if (!className) {
    return content
  }
  return <span className={className}>{content}</span>
}

export function createSearchHighlightPlugin (query) {
  const normalizedQuery = String(query || '').trim()
  const matcher = normalizedQuery ? new RegExp(escapeRegExp(normalizedQuery), 'gi') : null

  return function searchHighlightPlugin () {
    return tree => {
      if (!matcher) {
        return
      }
      function visit (node, parentTagName) {
        if (!node?.children) {
          return
        }
        const nextChildren = []
        node.children.forEach(child => {
          if (child.type === 'text' && parentTagName !== 'code') {
            const value = child.value || ''
            matcher.lastIndex = 0
            let lastIndex = 0
            let matchIndex = 0
            value.replace(matcher, (match, offset) => {
              if (offset > lastIndex) {
                nextChildren.push({ type: 'text', value: value.slice(lastIndex, offset) })
              }
              nextChildren.push({
                type: 'element',
                tagName: 'mark',
                properties: { className: ['ai-search-highlight'] },
                children: [{ type: 'text', value: match }],
                data: { searchMatchIndex: matchIndex++ }
              })
              lastIndex = offset + match.length
              return match
            })
            if (lastIndex < value.length) {
              nextChildren.push({ type: 'text', value: value.slice(lastIndex) })
            }
            if (lastIndex === 0) {
              nextChildren.push(child)
            }
          } else {
            visit(child, child.tagName || parentTagName)
            nextChildren.push(child)
          }
        })
        node.children = nextChildren
      }
      visit(tree, '')
    }
  }
}
