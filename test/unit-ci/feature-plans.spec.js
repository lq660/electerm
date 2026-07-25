const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function loadFeaturePlans () {
  const sourcePath = path.resolve(__dirname, '../../src/client/common/feature-plans.js')
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'electerm-feature-plans-'))
  const tempPath = path.join(tempDir, 'feature-plans.mjs')
  await fs.copyFile(sourcePath, tempPath)
  return import(pathToFileURL(tempPath).href)
}

describe('feature plans', () => {
  test('normalizes legacy free plan to personal', async () => {
    const {
      getCurrentPlan,
      getCurrentPlanName,
      normalizePlanId,
      planIds
    } = await loadFeaturePlans()

    assert.equal(normalizePlanId('free'), planIds.personal)
    assert.equal(getCurrentPlan({ licensePlan: 'free' }), planIds.personal)
    assert.equal(getCurrentPlanName({ licensePlan: 'free' }), '个人版')
  })

  test('keeps personal, pro and team feature boundaries distinct', async () => {
    const {
      featureIds,
      getSolutionRecordLimit,
      hasFeature,
      planIds
    } = await loadFeaturePlans()

    assert.equal(hasFeature({ licensePlan: planIds.personal }, featureIds.aiChat), false)
    assert.equal(hasFeature({ licensePlan: planIds.personal }, featureIds.batchCommand), false)
    assert.equal(getSolutionRecordLimit({ licensePlan: planIds.personal }), 20)

    assert.equal(hasFeature({ licensePlan: planIds.pro }, featureIds.aiChat), true)
    assert.equal(hasFeature({ licensePlan: planIds.pro }, featureIds.batchCommand), true)
    assert.equal(hasFeature({ licensePlan: planIds.pro }, featureIds.teamSharedServers), false)
    assert.equal(getSolutionRecordLimit({ licensePlan: planIds.pro }), Infinity)

    assert.equal(hasFeature({ licensePlan: planIds.team }, featureIds.teamSharedServers), true)
    assert.equal(hasFeature({ licensePlan: planIds.team }, featureIds.teamKnowledgeBase), true)
    assert.equal(hasFeature({ licensePlan: planIds.team }, featureIds.teamPolicy), true)
  })

  test('publishes a three-tier comparison matrix', async () => {
    const {
      planComparisonGroups,
      planFeatureGroups,
      planIds,
      planOrder
    } = await loadFeaturePlans()

    assert.deepEqual(planOrder, [planIds.personal, planIds.pro, planIds.team])
    assert.deepEqual(planFeatureGroups.map(group => group.plan), planOrder)
    assert.ok(planComparisonGroups.length >= 3)
    assert.ok(planComparisonGroups.some(group => {
      return group.items.some(item => item.plans.length === 1 && item.plans[0] === planIds.team)
    }))
  })
})
