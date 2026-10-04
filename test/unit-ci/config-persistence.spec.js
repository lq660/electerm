import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const modulePath = path.resolve('src/client/common/config-persistence.mjs')
const {
  getChangedConfigFields,
  localAIConfigFields,
  omitConfigFields
} = await import(pathToFileURL(modulePath))

test('getChangedConfigFields returns only changed top-level fields', () => {
  const previous = {
    theme: 'light',
    modelAI: 'old-model',
    syncSetting: { autoSync: true }
  }
  const next = {
    theme: 'dark',
    modelAI: 'old-model',
    syncSetting: { autoSync: true }
  }

  assert.deepEqual(getChangedConfigFields(previous, next), {
    theme: 'dark'
  })
})

test('omitConfigFields keeps synced settings without machine-local AI configuration', () => {
  const remote = {
    theme: 'dark',
    baseURLAI: 'https://old.example.test',
    modelAI: 'old-model',
    apiKeyAI: 'secret'
  }

  assert.deepEqual(omitConfigFields(remote, localAIConfigFields), {
    theme: 'dark'
  })
  assert.equal(remote.modelAI, 'old-model')
})
