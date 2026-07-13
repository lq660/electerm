const defaults = {
  c1: { x: [], y: [] },
  c2: { x: [50], y: [] },
  c3: { x: [100 / 3, 200 / 3], y: [] },
  r2: { x: [], y: [50] },
  r3: { x: [], y: [100 / 3, 200 / 3] },
  c2x2: { x: [50], y: [50] },
  c1r2: { x: [50], y: [50] },
  r1c2: { x: [50], y: [50] }
}

export function getLayoutRatios (layout, saved = {}) {
  const fallback = defaults[layout] || defaults.c1
  return {
    x: Array.isArray(saved.x) ? saved.x : fallback.x,
    y: Array.isArray(saved.y) ? saved.y : fallback.y
  }
}

export function getHandleOrientation (layout, index) {
  if (['c2', 'c3'].includes(layout)) return 'vertical'
  if (['r2', 'r3'].includes(layout)) return 'horizontal'
  if (layout === 'c2x2' || layout === 'c1r2') {
    return index === 0 ? 'vertical' : 'horizontal'
  }
  if (layout === 'r1c2') {
    return index === 0 ? 'horizontal' : 'vertical'
  }
  return ''
}

export function getRatioIndex (layout, handleIndex, orientation) {
  if (layout === 'c3' || layout === 'r3') return handleIndex
  return 0
}
