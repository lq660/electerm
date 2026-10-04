const { test } = require('node:test')
const assert = require('node:assert/strict')

test('AI running state is isolated by terminal and reference counted', async () => {
  const {
    finishAgentScope,
    getAgentRunningScopeId,
    hasRunningAgentScopes,
    isAgentScopeRunning,
    startAgentScope
  } = await import('../../src/client/common/agent-running-scopes.js')

  assert.equal(getAgentRunningScopeId({ terminalSessionId: 'term-a', sessionRootId: 'root' }), 'term-a')
  assert.equal(hasRunningAgentScopes({}), false)

  let scopes = startAgentScope({}, 'term-a')
  scopes = startAgentScope(scopes, 'term-b')
  scopes = startAgentScope(scopes, 'term-b')

  assert.equal(hasRunningAgentScopes(scopes), true)
  assert.equal(isAgentScopeRunning(scopes, 'term-a'), true)
  assert.equal(isAgentScopeRunning(scopes, 'term-b'), true)

  scopes = finishAgentScope(scopes, 'term-a')
  assert.equal(isAgentScopeRunning(scopes, 'term-a'), false)
  assert.equal(isAgentScopeRunning(scopes, 'term-b'), true)

  scopes = finishAgentScope(scopes, 'term-b')
  assert.equal(isAgentScopeRunning(scopes, 'term-b'), true)
  scopes = finishAgentScope(scopes, 'term-b')
  assert.equal(isAgentScopeRunning(scopes, 'term-b'), false)
  assert.equal(hasRunningAgentScopes(scopes), false)
})
