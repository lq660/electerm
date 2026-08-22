import { defaultTheme, defaultThemeLight } from './theme-defaults'

export default function getThemeDisplayName (theme = {}) {
  const { id, name = '' } = theme
  const e = window.translate
  // 2026-07-15 coder(lq): Translate preset labels only at render time so saved theme ids and exported theme data remain stable.
  if (id === defaultTheme().id) {
    return e('default')
  }
  if (id === defaultThemeLight().id) {
    const translated = e('defaultLight')
    return translated === 'defaultLight' ? name : translated
  }
  return name
}
