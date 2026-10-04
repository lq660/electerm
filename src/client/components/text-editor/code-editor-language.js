import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'

// 2026-09-25 coder(lq): Match syntax support from the real filename so extensionless files such as Dockerfile and Makefile are highlighted correctly too.
export function getEditorLanguage (fileName = '') {
  return LanguageDescription.matchFilename(languages, fileName)
}

export function getEditorLanguageName (fileName = '') {
  return getEditorLanguage(fileName)?.name || '纯文本'
}

export async function loadEditorLanguage (fileName = '') {
  const description = getEditorLanguage(fileName)
  return description ? description.load() : []
}
