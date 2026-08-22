// 2026-07-04 coder(lq): Built-in widget metadata comes from upstream electerm in English; localize only the display layer to avoid breaking widget IDs and runtime logic.
const widgetNameMap = {
  'Batch Operation': '批量操作',
  'Static File Server': '静态文件服务',
  'Local FTP Server': '本地 FTP 服务',
  'MCP Server': 'MCP 服务',
  'File Renamer': '批量重命名'
}

const widgetDescMap = {
  'Batch Operation': '定义并执行多步骤 SSH/SFTP 运维流程，支持进度跟踪。',
  'Static File Server': '从本机目录启动一个轻量静态文件服务。',
  'Local FTP Server': '在本机启动 FTP 服务，用于局域网文件共享。',
  'MCP Server': '向 AI 助手和外部工具开放工作台能力接口。',
  'File Renamer': '按模板批量重命名指定目录中的文件。'
}

const configNameMap = {
  host: '监听地址',
  port: '端口',
  directory: '目录',
  maxAge: '缓存时间',
  cacheControl: '缓存控制',
  lastModified: 'Last-Modified 响应头',
  etag: 'ETag',
  index: '默认首页',
  redirect: '目录重定向',
  anonymous: '匿名访问',
  username: '用户名',
  password: '密码',
  autoRun: '启动时自动运行',
  apiKey: 'API 密钥',
  enableBookmarks: '启用服务器接口',
  bookmarkKeyword: '服务器筛选关键字',
  enableBookmarkGroups: '启用分组接口',
  enableSftp: '启用 SFTP 接口',
  enableSettings: '启用设置接口',
  commandBlacklist: '命令黑名单',
  template: '命名模板',
  includeSubfolders: '包含子目录',
  fileTypes: '文件类型',
  startNumber: '起始序号',
  preserveCase: '保留原文件名大小写'
}

const configDescMap = {
  host: '服务绑定的 IP 地址',
  port: '服务监听端口',
  directory: '要共享或处理的本机目录',
  maxAge: '浏览器缓存时间，单位毫秒',
  cacheControl: '是否写入 Cache-Control 响应头',
  lastModified: '是否写入 Last-Modified 响应头',
  etag: '是否生成 ETag',
  index: '访问目录时默认返回的首页文件名',
  redirect: '访问目录时是否自动重定向',
  anonymous: '是否允许匿名 FTP 访问',
  username: '关闭匿名访问时使用的登录用户名',
  password: '关闭匿名访问时使用的登录密码',
  autoRun: '应用启动后自动运行这个工具',
  apiKey: '可选 API 密钥，填写后客户端需要通过 Authorization: Bearer <apiKey> 访问',
  enableBookmarks: '允许读取和维护服务器连接数据',
  bookmarkKeyword: '只返回标题包含该关键字的服务器，留空表示全部',
  enableBookmarkGroups: '允许读取和维护服务器分组',
  enableSftp: '允许读取、上传、下载和删除 SFTP 文件',
  enableSettings: '允许读取当前应用设置',
  commandBlacklist: '禁止执行的命令规则，一行一个',
  template: '新文件名模板，支持 {name}、{n}、{ext}、{date}、{time} 等变量',
  includeSubfolders: '是否处理子目录中的文件',
  fileTypes: '逗号分隔的扩展名，例如 jpg,png；填写 * 表示全部',
  startNumber: '顺序编号的起始数字',
  preserveCase: '是否保留原始文件名大小写'
}

export function getWidgetTitle (widgetOrName) {
  const name = typeof widgetOrName === 'string'
    ? widgetOrName
    : widgetOrName?.info?.name
  return widgetNameMap[name] || name || ''
}

export function getWidgetDescription (widget) {
  const name = widget?.info?.name
  return widgetDescMap[name] || widget?.info?.description || ''
}

export function getWidgetConfigLabel (config) {
  return configNameMap[config?.name] || config?.name || ''
}

export function getWidgetConfigDescription (config) {
  return configDescMap[config?.name] || config?.description || ''
}

export function getWidgetInstanceTitle (title = '') {
  const sourceName = Object.keys(widgetNameMap).find(name => title.startsWith(name))
  if (!sourceName) {
    return title
  }
  return title.replace(sourceName, widgetNameMap[sourceName])
}
