const { test } = require('node:test')
const assert = require('node:assert/strict')

test('editor language detection covers common server files', async () => {
  const { getEditorLanguageName } = await import('../../src/client/components/text-editor/code-editor-language.js')
  assert.equal(getEditorLanguageName('init-clickhouse.sql'), 'SQL')
  assert.equal(getEditorLanguageName('deploy.sh'), 'Shell')
  assert.equal(getEditorLanguageName('docker-compose.yml'), 'YAML')
  assert.equal(getEditorLanguageName('Dockerfile'), 'Dockerfile')
  assert.equal(getEditorLanguageName('README.md'), 'Markdown')
})

test('unknown editor files safely fall back to plain text', async () => {
  const { getEditorLanguageName } = await import('../../src/client/components/text-editor/code-editor-language.js')
  assert.equal(getEditorLanguageName('file.unknown-extension'), '纯文本')
})
