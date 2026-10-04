import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getUsagePercent,
  sizeToBytes
} from '../../src/client/common/system-metrics.mjs'

test('system metrics normalize memory units before calculating usage', async (t) => {
  await t.test('supports IEC units returned by free -h', () => {
    assert.equal(sizeToBytes('1Gi'), 1024 ** 3)
    assert.equal(sizeToBytes('512Mi'), 512 * 1024 ** 2)
    assert.equal(getUsagePercent('79.3Mi', '1.9Gi'), 4)
  })

  await t.test('supports legacy single-letter and byte units', () => {
    assert.equal(getUsagePercent('512M', '1G'), 50)
    assert.equal(getUsagePercent('500MB', '1GB'), 50)
  })

  await t.test('keeps invalid or inconsistent readings inside the display range', () => {
    assert.equal(getUsagePercent('20Gi', '10Gi'), 100)
    assert.equal(getUsagePercent('unknown', '10Gi'), 0)
    assert.equal(getUsagePercent('1Gi', ''), 0)
  })
})
