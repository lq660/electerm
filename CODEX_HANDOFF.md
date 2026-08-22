# Codex 接续说明

> 最后更新：2026-07-25
>
> 本文件用于让新的 Codex 快速接手“云舵工作台”改造。详细页面规划另见
> [`docs/page-architecture.md`](docs/page-architecture.md)。

## 1. 项目与 Git 状态

- 项目目录：`/Users/lq/work/my/code/electerm`
- 远程仓库：`git@github.com:lq660/electerm.git`
- 当前分支：`feature/china-workbench-ui`
- 产品名称：`云舵工作台`
- 上游基础：electerm，MIT 开源项目
- 最新已推送提交：`b080c890 feat: refine yunduo ai and subscription workflow`
- 2026-07-25 推送后工作区干净；接手前仍必须重新执行 `git status --short` 和 `git log -1 --oneline` 确认。

重要边界：不要把所有内部 `electerm` 字符串盲目替换成云舵。依赖包名、数据目录、数据库文件名、`electerm://` 协议、MCP 工具 ID、同步文件名、旧迁移逻辑都关系到兼容性，必须等“品牌身份迁移”方案确定后再改。

## 2. 产品方向

用户要做一款类似 FinalShell、但更符合国内运维习惯的 SSH/SFTP/本地终端工具。当前策略是在 electerm 基础上改造，而不是从零重写。

核心要求：

- 首页优先放服务器资源和连接入口。
- 多个 SSH 连接用顶部主 tab。
- 一个 SSH 连接内可以有多个终端和文件 tab。
- 右侧栏围绕当前 SSH 会话显示监控、AI、处理记录等能力。
- 页面浅色、紧凑、统一，避免黑边、黑色弹窗和大块空白。
- 所有用户可见入口、右键菜单、提示、空状态尽量中文化，并保留国际化能力。
- 功能必须真实可用，不能只做静态效果。

## 3. 当前信息架构

### 3.1 首页/工作台

首页定位为资源管理器和运维入口，不放虚构的服务器监控数据。服务器资源支持排序，默认按最近使用，也支持按添加时间等方式排序。资源卡片按行优先排列。

主要文件：

- `src/client/components/tabs/no-session.jsx`
- `src/client/components/tabs/no-session.styl`
- `src/client/components/tree-list/*`

### 3.2 顶部主 tab 与服务器选择

顶部主 tab 表示主工作窗口，例如首页、SSH 连接、本地终端等。顶部“+”弹层的主功能是选择一个已保存服务器并打开连接，次要功能是添加服务器/新建连接，不再放快速连接。

服务器选择弹层已做过：

- 大尺寸列表，便于服务器多时选择。
- 搜索栏和底部操作固定可见。
- 列表独立滚动，避免遮住下方按钮。
- 右上角有关闭按钮。
- 搜索框和弹层改为浅色单层边框。

主要文件：

- `src/client/components/tabs/add-btn.jsx`
- `src/client/components/tabs/add-btn-menu.jsx`
- `src/client/components/tabs/add-btn.styl`

### 3.3 SSH 会话子 tab

一个 SSH 主 tab 内部包含子 tab：

- 默认终端：标题为“终端”，固定最前，不可关闭。
- 附加终端：标题为“终端 1 / 终端 2 ...”，可关闭、可拖动排序。
- 文件 tab：本地文件/远程文件可以像终端一样新增、关闭、排序。
- “新终端”“新文件”等添加入口排在已创建 tab 后面。

关闭“终端 1”等子 tab 只关闭对应子终端，不关闭整个 SSH 主连接。

文件与终端目录同步逻辑：

- 分屏时文件区域应自动跟随当前终端目录。
- 独立文件 tab 不做持续自动同步。
- 独立文件 tab 可以手动选择某个终端并点击“同步终端目录”。

主要文件：

- `src/client/components/session/session.jsx`
- `src/client/components/session/session.styl`
- `src/client/components/terminal/terminal.jsx`
- `src/client/common/active-terminal.js`
- `src/client/store/session.js`

### 3.4 右侧栏

右侧栏已拆成 tab，默认显示“会话”：

- 会话：服务器监控、当前连接信息、辅助能力。
- AI：AI 问答和代理实验模式。
- 处理记录：保存和查看已解决问题的处理方案。

右侧栏支持拖动宽度，用户要求不要限制太死。隐藏后只保留顶部紧凑开关，避免留下宽空白栏。快捷操作区已删除，传输任务入口移到顶部图标区。

主要文件：

- `src/client/components/session/session.jsx`
- `src/client/components/session/session.styl`
- `src/client/components/session/solution-records.jsx`

## 4. AI 能力现状

AI 是当前重点改造区域。用户希望能直接问“查 nginx 配置路径”“解释当前终端报错”“整理这次处理过程”等，AI 应能读取当前终端上下文，而不是要求用户复制文本。

当前能力：

- AI 回复按终端/SSH 会话隔离。
- 右侧栏有单独 AI tab，不再和会话信息混在一起。
- 默认显示“会话”tab。
- 提供“连续对话”开关：开启时第二个问题会带上上一轮上下文；关闭时尽量只围绕当前问题。
- 问答模式偏解释和建议。
- 代理实验模式偏执行：应调用工具读取终端、发命令、读取结果。
- AI 可以读取当前终端最近输出，用于解释报错、整理脚本、总结日志。
- AI 结果可保存到“处理记录”，保存时会整理问题和结果。
- 处理记录支持重放/查看命令，免费版最多 20 条，专业版/团队版不限。

代理实验安全要求：

- 只读诊断命令可以自动执行。
- 破坏性命令必须强制停下来，显示待确认状态，让用户点击播放按钮手动执行。
- 不允许自动执行删除、重启、停止服务、改权限、安装卸载、写文件等高风险操作。
- 不要把某个软件写成硬编码固定模式，AI 应根据用户问题生成命令。
- 如果模型不返回工具调用，系统会尝试从回复里提取清晰命令，或生成只读诊断命令补救。

主要文件：

- `src/client/components/ai/ai-chat.jsx`
- `src/client/components/ai/ai-chat-history-item.jsx`
- `src/client/components/ai/agent.js`
- `src/client/components/ai/agent-tools.js`
- `src/client/components/ai/agent-tool-call-card.jsx`
- `src/client/components/ai/ai.styl`
- `src/client/common/solution-record-utils.mjs`
- `test/unit-ci/solution-record-utils.spec.js`

## 5. 命令助手

命令助手用于解决用户忘记命令的问题，例如查软件路径、找配置、统计目录大小、查看服务状态。

当前能力：

- 多行命令输入，避免单行浮层遮挡。
- 可以读取当前 SSH/机器信息。
- 可以探测系统信息和已安装软件。
- 从 PATH、运行进程、常见安装目录识别软件。
- 已安装软件直接展示在“已安装”目录区域。
- 每个软件可以展示常见操作，例如打开目录、查看状态、查看日志、重启等命令。
- 机器探测不应额外创建用户可见终端 tab。

主要文件：

- `src/client/components/terminal/command-assistant.jsx`
- `src/client/components/terminal/command-assistant.styl`
- `src/client/components/terminal/command-assistant-profile.mjs`
- `test/unit-ci/command-assistant-profile.spec.js`

## 6. 连接导入

服务器资源支持从其他软件导入连接，当前解析器覆盖：

- electerm 导出 JSON
- Xshell `.xsh`
- FinalShell 常见 JSON 字段
- OpenSSH config

当前要求：

- 导入服务器资源时可以选择多个文件。
- 导入链接时可以选择目标分组。
- 不导入 Xshell/FinalShell 不可解密密码。
- 缺少凭据的连接标记为“需补充凭据”。
- 支持跳过已有连接。

主要文件：

- `src/client/common/connection-import-parser.mjs`
- `src/client/components/tree-list/connection-import-modal.jsx`
- `src/client/components/tree-list/connection-import-modal.styl`
- `src/client/components/tree-list/bookmark-toolbar.jsx`
- `src/client/components/tree-list/bookmark-upload.js`
- `test/unit-ci/connection-import-parser.spec.js`

## 7. 收费分层

已完成第一阶段本地能力分层：

- 免费版
- 个人专业版
- 团队版

已加入的能力判断：

- `ai.chat`
- `ai.agent`
- `solution.records.unlimited`
- `batch.command`
- 团队能力占位

当前免费版限制：处理记录最多 20 条。专业版/团队版不限。当前只是本地配置和 UI 测试切换，未接入真实账号、支付、授权服务器。

主要文件：

- `src/client/common/feature-plans.js`
- `src/client/common/default-setting.js`
- `src/client/common/setting-list.js`
- `src/client/components/setting-panel/subscription.jsx`
- `src/client/components/setting-panel/tab-settings.jsx`
- `src/client/components/setting-panel/setting.styl`
- `src/client/store/setting.js`

## 8. 数据与安全

SSH 数据和配置当前仍主要保存在本地应用数据目录，数据库运行时选择：

- Node `<22`：NeDB
- Node `>=22`：SQLite

典型 SQLite 路径：

- `.../electerm/users/default_user/electerm.db`
- `.../electerm/users/default_user/electerm_data.db`

用户已明确：暂时先存本地，以后再考虑 macOS 钥匙串、Windows 凭据管理器等方案。启动时不要去钥匙串取数据。

已有本地加密处理：

- 本地 AES-GCM 加密封装。
- 无法解密的旧记录不删除、不覆盖。
- 旧版系统钥匙串加密记录不再自动读取。
- 用户修改设置时只提示一次“本次修改仅当前运行有效”。

相关文件：

- `src/app/lib/db.js`
- `src/app/lib/db-crypto.js`
- `src/app/lib/storage-key.js`
- `src/app/lib/sqlite.js`
- `src/app/lib/nedb.js`
- `src/client/store/db-upgrade.js`
- `src/client/store/load-data.js`
- `src/client/store/watch.js`

## 9. 品牌替换状态

已把用户可见品牌逐步换成“云舵工作台/云舵”：

- 启动加载页不再显示 electerm 旧 logo，改为 CSS “云”标和“云舵工作台”。
- 通用 Logo 组件不再引用 electerm 图片。
- 关于页保留上游开源致谢，但产品名是云舵工作台。
- AI 系统提示词改为云舵工作台。
- 异常页、升级提示、导出文件名、协议显示名已改。
- 导出文件名从 `electerm-...` 改为 `yunduo-...`。

保留不改的兼容项：

- `package.json` 的 `name`、`bin`
- `electron-builder.json` 的 `appId`、历史协议 scheme `electerm`
- 数据目录和数据库文件名
- `electerm://` 解析
- MCP 工具名 `*_electerm_*`
- 上游依赖包和资源包名
- 同步状态文件名

后续如果要彻底品牌化，需要单独做“品牌身份迁移”：

- 新 appId、新应用数据目录、新命令行入口。
- 注册 `yunduo://`，同时兼容 `electerm://`。
- 旧数据目录迁移到新目录。
- 更新打包图标、托盘图标、安装包身份、文档和发布链接。

## 10. 视觉与国际化

全局中国版样式主要集中在：

- `src/client/css/china-workbench.styl`
- `src/client/components/setting-panel/setting.styl`
- 各业务组件自己的 `.styl`

视觉基准：

- 页面背景浅灰白。
- 面板白色。
- 主色为清晰蓝色。
- 边框浅灰蓝。
- 状态色可用绿、黄、红，避免全页面单一蓝色。
- 卡片圆角控制在 8px 内。
- 不允许遗留黑边、黑色弹窗、透明穿透。

注意：`china-workbench.styl` 历史覆盖很多，不要盲目追加大量全局样式。先定位组件局部样式和最终覆盖规则，再用预览确认。

## 11. 已完成验证

最近一轮在提交 `b080c890` 前后执行过：

```bash
npm run lint
npm run compile
npm run test-unit-ci
```

结果：

- lint 通过。
- compile 通过。
- `test-unit-ci` 通过，53 个测试全部通过。

构建仍有上游/环境类非阻塞提示：

- `@xterm/addon-ligatures` 的浏览器 externalize 提示。
- 部分 chunk 超过 500 kB。
- 构建复制 `@electerm/electerm-resource/tray-icons/*` 时会提示路径不存在，但退出码为 0，当前不是阻断项。

## 12. 预览与调试

开发调试：

```bash
# 终端 1
npm start

# 终端 2
npm run app
```

构建产物验证：

```bash
npm run compile
npm run t
```

注意：

- 不要假设预览进程还活着，用户经常会要求重启预览。
- 真实 Electron 页面检查比浏览器静态页面更可信。
- E2E 或真实验证建议使用独立 `DATA_PATH`，避免污染用户本机数据。

## 13. 后续优先事项

建议按这个顺序继续：

1. 真实 Electron 逐页走查：首页、服务器资源、新建连接、SSH、本地终端、文件、传输、设置、主题、同步、扩展工具、关于页。
2. 检查每页四件事：入口是否清楚、功能是否能执行、中文是否完整、关闭/返回是否清晰。
3. 继续打磨 AI 代理实验流程，尤其是“生成命令、执行、读取结果、总结、保存处理记录”的闭环。
4. 把处理记录从 localStorage 迁移到本地 DB，设计表/集合 `solutionRecords`，并从旧 key 做一次性迁移。
5. 准备完整品牌身份迁移方案，再改 appId、数据目录、协议、命令行入口和图标。
6. 清理 React key、Ant Design 废弃 API、重复 CSS 和过大的样式覆盖。

## 14. 工作规则

- 修改前先读相关组件和 README，不根据文件名猜用途。
- 优先复用 electerm 现有 Store、组件和协议实现。
- 不要重置或回退不属于当前任务的改动。
- 手工编辑使用 `apply_patch`。
- 有维护价值的源码注释使用：

```text
YYYY-MM-DD coder(lq): comment content
```

- 页面修改后至少执行相关 lint、最窄测试和真实预览。
- 提交前检查 `git diff --check`、未跟踪文件和敏感信息。
