import { theme } from 'antd'

export const workbenchThemeDefaults = {
  'workbench-mode': 'light',
  'workbench-bg': '#f3f5f8',
  'workbench-panel': '#ffffff',
  'workbench-panel-soft': '#fafbfc',
  'workbench-panel-muted': '#f6f8fa',
  'workbench-panel-chrome': '#f1f3f6',
  'workbench-panel-chrome-strong': '#f6f7f9',
  'workbench-border': '#d9e0e8',
  'workbench-border-strong': '#cbd5e1',
  'workbench-border-soft': '#e8edf3',
  'workbench-border-muted': '#d4dde7',
  'workbench-border-extra': '#e3e8ef',
  'workbench-border-lighter': '#e6ebf1',
  'workbench-input-border': '#cbd5df',
  'workbench-text': '#1f2a37',
  'workbench-control-text': '#344054',
  'workbench-muted': '#667085',
  'workbench-muted-strong': '#5f728b',
  'workbench-placeholder': '#98a2b3',
  'workbench-primary': '#426f9d',
  'workbench-primary-strong': '#365f8a',
  'workbench-primary-hover': '#2d5278',
  'workbench-primary-soft': '#eef3f8',
  'workbench-primary-tint': '#f5f8fb',
  'workbench-primary-border': '#c6d5e4',
  'workbench-primary-icon-bg': '#e7eef5',
  'workbench-primary-active-bg': '#eaf1f7',
  'workbench-primary-active-tint': '#f0f5f9',
  'workbench-primary-active-border': '#b8cadb',
  'workbench-primary-active-border-strong': '#a9bed3',
  'workbench-info-bg': '#f7f9fb',
  'workbench-info-border': '#d4dee8',
  'workbench-success': '#12b76a',
  'workbench-success-text': '#039855',
  'workbench-success-bg': '#ecfdf3',
  'workbench-success-border': '#abefc6',
  'workbench-warning': '#f79009',
  'workbench-warning-strong': '#fa8c16',
  'workbench-danger': '#f04438',
  'workbench-danger-text': '#d92d20',
  'workbench-danger-bg': '#fff1f3',
  'workbench-secondary': '#13c2c2',
  'workbench-sidebar': '#101828',
  'workbench-sidebar-border': '#0b1220',
  'workbench-sidebar-muted': '#8ea0b8',
  'workbench-sidebar-text': '#d0d5dd',
  'workbench-sidebar-hover-bg': 'rgba(255, 255, 255, .08)',
  'workbench-tab-muted': '#98a2b3',
  'workbench-scroll-thumb': '#b8c7dc',
  'workbench-scroll-thumb-hover': '#98a9c0',
  'workbench-terminal-accent': '#32d583',
  'workbench-header-gradient-mid': '#f7f9fb',
  'workbench-header-gradient-end': '#f5f8f8',
  'workbench-switch-track': '#d0d5dd',
  'workbench-focus-shadow': 'rgba(66, 111, 157, .10)',
  'workbench-focus-shadow-soft': 'rgba(66, 111, 157, .07)',
  'workbench-shadow-card': 'rgba(15, 23, 42, .06)',
  'workbench-shadow-xs': 'rgba(15, 23, 42, .03)',
  'workbench-shadow-sm': 'rgba(15, 23, 42, .04)',
  'workbench-shadow-sm-strong': 'rgba(15, 23, 42, .05)',
  'workbench-shadow-md': 'rgba(15, 23, 42, .08)',
  'workbench-shadow-md-strong': 'rgba(15, 23, 42, .12)',
  'workbench-shadow-lg': 'rgba(15, 23, 42, .14)',
  'workbench-shadow-xl': 'rgba(15, 23, 42, .16)',
  'workbench-shadow-xxl': 'rgba(15, 23, 42, .18)',
  'workbench-on-primary': '#ffffff'
}

function pickToken (themeConfig, key) {
  return themeConfig?.[key] || workbenchThemeDefaults[key]
}

export function getWorkbenchTokens (themeConfig = {}) {
  return Object.keys(workbenchThemeDefaults).reduce((prev, key) => {
    prev[key] = pickToken(themeConfig, key)
    return prev
  }, {})
}

export function getWorkbenchAntdTheme (themeConfig = {}) {
  const tokens = getWorkbenchTokens(themeConfig)
  const isDark = tokens['workbench-mode'] === 'dark'
  return {
    token: {
      borderRadius: 6,
      colorPrimary: tokens['workbench-primary'],
      colorBgBase: tokens['workbench-bg'],
      colorBgContainer: tokens['workbench-panel'],
      colorBorder: tokens['workbench-border-strong'],
      colorError: tokens['workbench-danger'],
      colorInfo: tokens['workbench-primary'],
      colorSuccess: tokens['workbench-success'],
      colorTextBase: tokens['workbench-text'],
      colorText: tokens['workbench-text'],
      colorTextSecondary: tokens['workbench-muted'],
      colorWarning: tokens['workbench-warning'],
      motion: false
    },
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm
  }
}

export function buildWorkbenchCssVariables (themeConfig = {}) {
  return Object.entries(getWorkbenchTokens(themeConfig))
    .map(([key, value]) => `--${key}: ${value};`)
    .join('\n')
}
