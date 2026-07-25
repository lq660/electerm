export const planIds = {
  personal: 'personal',
  free: 'personal',
  pro: 'pro',
  team: 'team'
}

export const featureIds = {
  aiChat: 'ai.chat',
  aiAgent: 'ai.agent',
  solutionRecordsUnlimited: 'solution.records.unlimited',
  batchCommand: 'batch.command',
  advancedCommandAssistant: 'command.assistant.advanced',
  encryptedMigration: 'migration.encrypted',
  customTheme: 'theme.custom',
  teamWorkspace: 'team.workspace',
  teamSharedServers: 'team.sharedServers',
  teamCommandTemplates: 'team.commandTemplates',
  teamKnowledgeBase: 'team.knowledgeBase',
  teamPolicy: 'team.policy',
  teamAudit: 'team.audit'
}

export const planNames = {
  [planIds.personal]: '个人版',
  [planIds.pro]: '专业版',
  [planIds.team]: '团队版'
}

export const planDescriptions = {
  [planIds.personal]: '适合个人本机连接、文件管理和基础配置迁移。',
  [planIds.pro]: '适合高频运维、开发排障和 AI 辅助效率提升。',
  [planIds.team]: '适合团队共享资源、沉淀处理经验和统一安全管控。'
}

export const planTags = {
  [planIds.personal]: '本机基础',
  [planIds.pro]: '效率增强',
  [planIds.team]: '协作管控'
}

export const planTargets = {
  [planIds.personal]: '个人开发者、轻量运维、临时服务器管理',
  [planIds.pro]: '高频连接多台服务器、需要 AI 排障和批量处理的用户',
  [planIds.team]: '需要统一资源、成员权限、命令规范和审计留痕的团队'
}

export const planOrder = [
  planIds.personal,
  planIds.pro,
  planIds.team
]

const legacyPlanAliases = {
  free: planIds.personal
}

export const featureMap = {
  [featureIds.aiChat]: [planIds.pro, planIds.team],
  [featureIds.aiAgent]: [planIds.pro, planIds.team],
  [featureIds.solutionRecordsUnlimited]: [planIds.pro, planIds.team],
  [featureIds.batchCommand]: [planIds.pro, planIds.team],
  [featureIds.advancedCommandAssistant]: [planIds.pro, planIds.team],
  [featureIds.encryptedMigration]: [planIds.personal, planIds.pro, planIds.team],
  [featureIds.customTheme]: [planIds.personal, planIds.pro, planIds.team],
  [featureIds.teamWorkspace]: [planIds.team],
  [featureIds.teamSharedServers]: [planIds.team],
  [featureIds.teamCommandTemplates]: [planIds.team],
  [featureIds.teamKnowledgeBase]: [planIds.team],
  [featureIds.teamPolicy]: [planIds.team],
  [featureIds.teamAudit]: [planIds.team]
}

export const featureLabels = {
  [featureIds.aiChat]: 'AI 助手',
  [featureIds.aiAgent]: '代理实验',
  [featureIds.solutionRecordsUnlimited]: '无限处理记录',
  [featureIds.batchCommand]: '批量命令',
  [featureIds.advancedCommandAssistant]: '高级命令助手',
  [featureIds.encryptedMigration]: '加密迁移包',
  [featureIds.customTheme]: '自定义主题',
  [featureIds.teamWorkspace]: '团队空间',
  [featureIds.teamSharedServers]: '团队服务器共享',
  [featureIds.teamCommandTemplates]: '团队命令模板',
  [featureIds.teamKnowledgeBase]: '团队知识库',
  [featureIds.teamPolicy]: '危险命令策略',
  [featureIds.teamAudit]: '操作审计'
}

export const planFeatureGroups = [
  {
    plan: planIds.personal,
    price: '个人永久免费',
    highlight: '把云舵作为个人终端工作台使用',
    features: [
      'SSH、本地终端、SFTP 文件管理',
      '服务器资源保存、分组和快速搜索',
      '多标签、多终端和本地文件页签',
      '基础命令助手',
      '主题、快捷命令和基础工作区',
      '加密迁移包导入导出',
      '处理记录最多 20 条'
    ],
    limits: [
      '处理记录最多 20 条',
      '不包含 AI 助手、批量命令和团队共享'
    ]
  },
  {
    plan: planIds.pro,
    price: '建议 19-39 元/月',
    highlight: '面向高频排障和效率增强',
    features: [
      '包含个人版全部能力',
      'AI 助手和代理实验',
      'AI 辅助创建连接与解释终端输出',
      'AI 整理并保存处理记录',
      '处理记录不限数量',
      '命令助手高级识别和常用操作',
      '批量命令、终端日志和高级效率工具'
    ],
    limits: [
      '授权绑定个人使用',
      '不包含团队资源共享、成员权限和审计'
    ]
  },
  {
    plan: planIds.team,
    price: '建议 29-59 元/人/月',
    highlight: '面向团队共享、规范和安全管控',
    features: [
      '包含专业版全部能力',
      '团队服务器资源共享',
      '团队处理记录知识库',
      '团队命令模板和成员管理',
      '危险命令策略与操作审计',
      '统一导入导出、成员离职交接和安全策略'
    ],
    limits: [
      '按成员授权',
      '需要后续接入账号、组织和服务端授权'
    ]
  }
]

export const planComparisonGroups = [
  {
    title: '连接与配置',
    items: [
      {
        name: 'SSH / SFTP / 本地终端 / 远程桌面',
        plans: [planIds.personal, planIds.pro, planIds.team]
      },
      {
        name: '连接分组、快捷命令、主题和工作区',
        plans: [planIds.personal, planIds.pro, planIds.team]
      },
      {
        name: '加密迁移包、选择性导出和可选本地密钥打包',
        plans: [planIds.personal, planIds.pro, planIds.team]
      }
    ]
  },
  {
    title: '效率与 AI',
    items: [
      {
        name: 'AI 助手、终端上下文问答和连接生成',
        plans: [planIds.pro, planIds.team]
      },
      {
        name: 'AI Agent 代理实验',
        plans: [planIds.pro, planIds.team]
      },
      {
        name: '批量命令与高级命令助手',
        plans: [planIds.pro, planIds.team]
      },
      {
        name: '处理记录不限数量',
        plans: [planIds.pro, planIds.team]
      }
    ]
  },
  {
    title: '团队协作',
    items: [
      {
        name: '团队服务器共享与团队工作区',
        plans: [planIds.team]
      },
      {
        name: '团队命令模板和处理记录知识库',
        plans: [planIds.team]
      },
      {
        name: '成员权限、危险命令策略和操作审计',
        plans: [planIds.team]
      }
    ]
  }
]

export function getCurrentPlan (config = window.store?.config || {}) {
  return normalizePlanId(config.licensePlan)
}

export function getCurrentPlanName (config) {
  return planNames[getCurrentPlan(config)] || planNames[planIds.personal]
}

export function normalizePlanId (plan) {
  const normalized = legacyPlanAliases[plan] || plan
  return planOrder.includes(normalized) ? normalized : planIds.personal
}

export function hasFeature (config, featureId) {
  const allowedPlans = featureMap[featureId]
  if (!allowedPlans) {
    return true
  }
  return allowedPlans.includes(getCurrentPlan(config))
}

export function getRequiredPlanName (featureId) {
  const plan = featureMap[featureId]?.[0] || planIds.personal
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
