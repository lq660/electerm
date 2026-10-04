/**
 * Virtual list for SFTP file list.
 *
 * Scroll state is owned by the parent (list-table-ui) via React's onScroll prop
 * on the scrollable container, and passed down as `scrollTop`. This avoids the
 * React lifecycle ordering bug where a child's componentDidMount fires before the
 * parent div's ref is assigned, making addEventListener attach to null.
 *
 * Uses spacers (top/bottom divs) so the container's scrollbar reflects the full
 * list height while only the visible window (± OVERSCAN) is in the DOM.
 *
 * offsetTop is read from rootRef.offsetTop at render time — the distance from the
 * scroll container's top edge to this list's top edge (accounts for the ".." parent
 * row above the list).
 */

import { Component, createRef } from 'react'

const ITEM_SIZE = 36 // Default before the rendered theme-specific row height is measured.
const OVERSCAN = 5

export default class VirtualList extends Component {
  rootRef = createRef()

  // 2026-09-25 coder(lq): Keyboard selection can target a virtual row that is not mounted yet, so scroll by its calculated position first.
  scrollToIndex = (index) => {
    const root = this.rootRef.current
    const container = root?.parentElement
    if (!root || !container || index < 0) return
    const itemSize = this.props.itemSize || ITEM_SIZE
    const itemTop = root.offsetTop + index * itemSize
    const itemBottom = itemTop + itemSize
    if (itemTop < container.scrollTop) {
      container.scrollTop = itemTop
    } else if (itemBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = itemBottom - container.clientHeight
    }
  }

  render () {
    const { list, renderItem, containerHeight = 400, scrollTop = 0, itemSize = ITEM_SIZE } = this.props

    // offsetTop: distance from scroll container top to this list's top.
    // rootRef.offsetTop is relative to the nearest positioned ancestor, which is
    // .sftp-table-content (position: relative) — exactly the scroll container.
    // Returns 0 on first render (rootRef not yet set); harmless (renders a few extra items).
    const offsetTop = this.rootRef.current?.offsetTop ?? 0

    const startIndex = Math.max(
      0,
      Math.floor((scrollTop - offsetTop) / itemSize) - OVERSCAN
    )
    const endIndex = Math.min(
      list.length - 1,
      Math.ceil((scrollTop + containerHeight - offsetTop) / itemSize) + OVERSCAN
    )

    const topSpacerHeight = startIndex * itemSize
    const bottomSpacerHeight = Math.max(0, (list.length - endIndex - 1) * itemSize)

    return (
      <div ref={this.rootRef}>
        <div style={{ height: topSpacerHeight }} />
        {list.slice(startIndex, endIndex + 1).map((item, i) =>
          renderItem(item, startIndex + i)
        )}
        <div style={{ height: bottomSpacerHeight }} />
      </div>
    )
  }
}
