export function getZoomPercent (zoom = 1) {
  const value = Number(zoom)
  const safeValue = Number.isFinite(value) && value > 0 ? value : 1
  return Math.round(safeValue * 100)
}
