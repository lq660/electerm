export function normalizeMarqueeRect (start, current) {
  const left = Math.min(start.x, current.x)
  const top = Math.min(start.y, current.y)
  const right = Math.max(start.x, current.x)
  const bottom = Math.max(start.y, current.y)
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  }
}

export function rectanglesIntersect (first, second) {
  return first.left <= second.right &&
    first.right >= second.left &&
    first.top <= second.bottom &&
    first.bottom >= second.top
}

export function resolveMarqueeSelection (baseSelection, intersectingIds, toggle = false) {
  const nextSelection = toggle
    ? new Set(baseSelection)
    : new Set()

  for (const id of intersectingIds) {
    if (toggle && nextSelection.has(id)) {
      nextSelection.delete(id)
    } else {
      nextSelection.add(id)
    }
  }

  return nextSelection
}
