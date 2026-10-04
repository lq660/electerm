const { test } = require('node:test')
const assert = require('node:assert/strict')

test('normalizes marquee coordinates in every drag direction', async () => {
  const { normalizeMarqueeRect } = await import('../../src/client/components/sftp/marquee-selection.js')
  assert.deepEqual(normalizeMarqueeRect(
    { x: 80, y: 60 },
    { x: 20, y: 10 }
  ), {
    left: 20,
    top: 10,
    right: 80,
    bottom: 60,
    width: 60,
    height: 50
  })
})

test('detects rows touched by a marquee', async () => {
  const { rectanglesIntersect } = await import('../../src/client/components/sftp/marquee-selection.js')
  const marquee = { left: 10, top: 10, right: 50, bottom: 50 }
  assert.equal(rectanglesIntersect(marquee, { left: 40, top: 40, right: 70, bottom: 70 }), true)
  assert.equal(rectanglesIntersect(marquee, { left: 51, top: 10, right: 70, bottom: 30 }), false)
})

test('replaces selection normally and toggles it with command or control', async () => {
  const { resolveMarqueeSelection } = await import('../../src/client/components/sftp/marquee-selection.js')
  assert.deepEqual(
    Array.from(resolveMarqueeSelection(new Set(['a']), ['b', 'c'])),
    ['b', 'c']
  )
  assert.deepEqual(
    Array.from(resolveMarqueeSelection(new Set(['a', 'b']), ['b', 'c'], true)),
    ['a', 'c']
  )
})
