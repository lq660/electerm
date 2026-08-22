import { getLayoutRatios } from './layout-ratios'

const size = (width, height) => ({
  width: Math.max(0, width),
  height: Math.max(0, height)
})

export default function calcSessionSize (layout, width, height, savedRatios) {
  const ratios = getLayoutRatios(layout, savedRatios)
  const x1 = width * (ratios.x[0] || 100) / 100
  const x2 = width * (ratios.x[1] || 100) / 100
  const y1 = height * (ratios.y[0] || 100) / 100
  const y2 = height * (ratios.y[1] || 100) / 100

  if (layout === 'c2') return [size(x1 - 2, height), size(width - x1 - 2, height)]
  if (layout === 'c3') return [size(x1 - 2, height), size(x2 - x1 - 4, height), size(width - x2 - 2, height)]
  if (layout === 'r2') return [size(width, y1 - 2), size(width, height - y1 - 2)]
  if (layout === 'r3') return [size(width, y1 - 2), size(width, y2 - y1 - 4), size(width, height - y2 - 2)]
  if (layout === 'c2x2') {
    return [
      size(x1 - 2, y1 - 2),
      size(width - x1 - 2, y1 - 2),
      size(x1 - 2, height - y1 - 2),
      size(width - x1 - 2, height - y1 - 2)
    ]
  }
  if (layout === 'c1r2') {
    return [
      size(x1 - 2, height),
      size(width - x1 - 2, y1 - 2),
      size(width - x1 - 2, height - y1 - 2)
    ]
  }
  if (layout === 'r1c2') {
    return [
      size(width, y1 - 2),
      size(x1 - 2, height - y1 - 2),
      size(width - x1 - 2, height - y1 - 2)
    ]
  }
  return [size(width, height)]
}
