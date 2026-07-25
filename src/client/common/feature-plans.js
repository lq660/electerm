export const planIds = {
  free: 'free',
  pro: 'pro',
  team: 'team'
}

export const featureIds = {
  aiChat: 'ai.chat',
  aiAgent: 'ai.agent',
  solutionRecordsUnlimited: 'solution.records.unlimited',
  batchCommand: 'batch.command',
  teamWorkspace: 'team.workspace',
  teamSharedServers: 'team.sharedServers',
  teamAudit: 'team.audit'
}

export const planNames = {
  [planIds.free]: '免费版',
  [planIds.pro]: '个人专业版',
  [planIds.team]: '团队版'
}

export const planDescriptions = {
  [planIds.free]: '适合个人基础 SSH、终端和文件管理。',
  [planIds.pro]: '适合高频运维、开发排障和 AI 辅助效率提升。',
  [planIds.team]: '适合团队共享资源、沉淀处理经验和统一安全管控。'
}

export const featureMap = {
  [featureIds.aiChat]: [planIds.pro, planIds.team],
  [featureIds.aiAgent]: [planIds.pro, planIds.team],
  [featureIds.solutionRecordsUnlimited]: [planIds.pro, planIds.team],
  [featureIds.batchCommand]: [planIds.pro, planIds.team],
  [featureIds.teamWorkspace]: [planIds.team],
  [featureIds.teamSharedServers]: [planIds.team],
  [featureIds.teamAudit]: [planIds.team]
}

export const featureLabels = {
  [featureIds.aiChat]: 'AI 助手',
  [featureIds.aiAgent]: '代理实验',
  [featureIds.solutionRecordsUnlimited]: '无限处理记录',
  [featureIds.batchCommand]: '批量命令',
  [featureIds.teamWorkspace]: '团队空间',
  [featureIds.teamSharedServers]: '团队服务器共享',
  [featureIds.teamAudit]: '操作审计'
}

export const planFeatureGroups = [
  {
    plan: planIds.free,
    price: '免费',
    features: [
      'SSH、本地终端、SFTP 文件管理',
      '服务器资源保存和分组',
      '多标签、多终端和本地文件页签',
      '基础命令助手',
      '处理记录最多 20 条'
    ]
  },
  {
    plan: planIds.pro,
    price: '建议 19-39 元/月',
    features: [
      'AI 助手和代理实验',
      'AI 整理并保存处理记录',
      '处理记录不限数量',
      '命令助手高级识别和常用操作',
      '批量命令、终端日志和高级效率工具'
    ]
  },
  {
    plan: planIds.team,
    price: '建议 29-59 元/人/月',
    features: [
      '包含个人专业版全部能力',
      '团队服务器资源共享',
      '团队处理记录知识库',
      '团队命令模板和成员管理',
      '危险命令策略与操作审计'
    ]
  }
]

export function getCurrentPlan (config = window.store?.config || {}) {
  return config.licensePlan || planIds.free
}

export function getCurrentPlanName (config) {
  return planNames[getCurrentPlan(config)] || planNames[planIds.free]
}

export function hasFeature (config, featureId) {
  const allowedPlans = featureMap[featureId]
  if (!allowedPlans) {
    return true
  }
  return allowedPlans.includes(getCurrentPlan(config))
}

export function getRequiredPlanName (featureId) {
  const plan = featureMap[featureId]?.[0] || planIds.free
  return planNames[plan]
}

export function getFeatureLockedMessage (featureId) {
  const featureName = featureLabels[featureId] || '该功能'
  return `${featureName}属于${getRequiredPlanName(featureId)}功能，请升级后使用。`
}

export function getSolutionRecordLimit (config) {
  return hasFeature(config, featureIds.solutionRecordsUnlimited) ? Infinity : 20
}

export function canCreateSolutionRecord (config, records = []) {
  return records.length < getSolutionRecordLimit(config)
}
