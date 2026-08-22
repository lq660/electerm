import { theme } from 'antd'

export const workbenchThemeDefaults = {
  'workbench-mode': 'light',
  'workbench-bg': '#f4f7fb',
  'workbench-panel': '#ffffff',
  'workbench-panel-soft': '#fbfdff',
  'workbench-panel-muted': '#f8fafc',
  'workbench-panel-chrome': '#f5f7fb',
  'workbench-panel-chrome-strong': '#f7f9fc',
  'workbench-border': '#dbe3ef',
  'workbench-border-strong': '#d8e0ea',
  'workbench-border-soft': '#edf1f7',
  'workbench-border-muted': '#d7e2f1',
  'workbench-border-extra': '#e5ebf3',
  'workbench-border-lighter': '#e4eaf2',
  'workbench-input-border': '#cfd8e6',
  'workbench-text': '#1f2937',
  'workbench-control-text': '#344054',
  'workbench-muted': '#667085',
  'workbench-muted-strong': '#5f728b',
  'workbench-placeholder': '#98a2b3',
  'workbench-primary': '#1677ff',
  'workbench-primary-strong': '#1769e0',
  'workbench-primary-hover': '#0958d9',
  'workbench-primary-soft': '#eef5ff',
  'workbench-primary-tint': '#f5f8ff',
  'workbench-primary-border': '#b8d8ff',
  'workbench-primary-icon-bg': '#e6f1ff',
  'workbench-primary-active-bg': '#edf5ff',
  'workbench-primary-active-tint': '#eaf3ff',
  'workbench-primary-active-border': '#aacbfa',
  'workbench-primary-active-border-strong': '#9ec5ff',
  'workbench-info-bg': '#f7faff',
  'workbench-info-border': '#cfe0f6',
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
  'workbench-header-gradient-mid': '#f7fbff',
  'workbench-header-gradient-end': '#f8fffd',
  'workbench-switch-track': '#d0d5dd',
  'workbench-focus-shadow': 'rgba(22, 119, 255, .08)',
  'workbench-focus-shadow-soft': 'rgba(22, 119, 255, .06)',
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
