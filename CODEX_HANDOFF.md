# Codex 接续说明

> 最后更新：2026-07-15
>
> 本文件用于让新的 Codex 快速接手“云舵工作台”改造。详细页面规划另见
> [`docs/page-architecture.md`](docs/page-architecture.md)。

## 1. 项目与 Git 状态

- 项目目录：`/Users/lq/work/my/code/electerm`
- 上游基础：electerm，项目 README 仍保留上游说明
- 产品名称：云舵工作台
- Git 远程：`git@github.com:lq660/electerm.git`
- 当前分支：`feature/china-workbench-ui`
- 历史基线提交：`778a86650f54dd5c9d680250b6e024231bf0df5a`
- 提交标题：`feat: redesign China operations workbench`
- Pull Request 地址：<https://github.com/lq660/electerm/pull/new/feature/china-workbench-ui>

上述提交包含主体改造，共 226 个文件、16537 行新增、2165 行删除。本文档只记录历史背景；
接续开发前必须以 `git status --short` 和 `git log -1 --oneline` 确认当前实际状态。

## 2. 产品决策与用户偏好

项目没有从头重写，而是选择在 electerm 开源代码基础上继续开发。原因是上游已经具备：

- SSH、本地终端、SFTP/FTP、RDP、VNC 等底层能力
- 多终端、文件传输、主题、快捷命令和配置同步
- Electron 桌面端、跨平台打包和已有协议实现

用户明确要求面向国内运维用户重新组织页面和操作逻辑。后续修改必须遵守以下方向：

1. 主工作区和设置/管理页面要有清晰边界，不能把所有功能混在首页。
2. 首页应优先展示服务器资源和连接入口；多个连接使用顶部 tab。
3. SSH 会话页是核心工作页，终端、文件、监控、AI 和传输围绕当前 SSH 会话组织。
4. 使用白色、浅灰、蓝色为主的统一工作台配色，避免黑边、黑色弹窗和大面积暗色 UI。
5. 页面要贴边、充分使用窗口空间，不能出现无意义的黑边或大块空白。
6. 操作要紧凑、明确、符合国内软件习惯；删除重复按钮和重复入口。
7. 所有用户可见文本、右键菜单、提示和空状态优先中文，同时保留国际化能力。
8. 功能必须真实可用，不能只做静态效果图或演示数据。
9. 每次改动后应启动真实 Electron 预览并逐页检查。

## 3. 当前信息架构

### 3.1 全局左侧导航

当前左侧导航已收口为：

- 应用菜单
- 新建连接
- 服务器资源
- 传输任务
- 管理中心
- 帮助与关于

“管理中心”展开后包含：

- 系统设置
- 终端主题
- 数据同步
- 扩展工具

服务器资源、连接工作区、设置和扩展工具不再使用同一种页面语义。

### 3.2 首页/工作台

首页是运维工作台，不是营销落地页。当前包含：

- 本地终端、新建连接、设置等主入口
- 快速连接输入
- 已保存服务器资源卡片
- 最近连接
- 传输任务摘要
- 当前会话信息应该放在 SSH 页右侧，不在首页显示虚构服务器监控数据

### 3.3 顶部“+”服务器选择器

顶部“+”的主任务是选择一个已保存服务器并打开连接，次要任务才是添加服务器或新建连接。
快速连接和“AI 生成连接”已经从这个弹层移除。

当前尺寸与行为：

- 默认宽度：`480px`
- 可拖动宽度：`420px` 到 `760px`
- 最大高度：`600px`，随窗口高度自适应
- 旧版保存宽度小于等于 `300px` 时自动迁移为 `480px`
- 服务器列表占满剩余空间并独立滚动
- 搜索栏和底部“添加服务器 / 新建连接”保持可见
- 搜索框使用单层浅色边框，不继承终端深色主题
- 右上角提供明确的关闭按钮，同时保留点击外部和 `Esc` 关闭
- 弹层按真实宽度计算位置，避免右侧越界

主要文件：

- `src/client/components/tabs/add-btn.jsx`
- `src/client/components/tabs/add-btn-menu.jsx`
- `src/client/components/tabs/add-btn.styl`
- `src/client/store/init-state.js`

### 3.4 SSH 会话与子 tab

一个 SSH 连接对应顶部的一个主 tab。主 tab 内可以继续创建：

- 默认终端“终端”，固定在最前且不可关闭
- 终端 1、终端 2 等附加终端，可关闭、可拖动排序
- 本地文件/远程文件 tab，可新增、关闭和排序
- 新建出的终端/文件 tab 排在“新终端”等添加入口之前

关闭“终端 1”等子 tab 只关闭对应子终端，不关闭整个 SSH 主连接。

终端/文件分屏时：

- 顶部子 tab 保持可见，用户能知道当前属于哪个终端
- 分屏文件区域自动跟随当前激活终端目录，不要求额外打开“目录跟随”开关
- 单独文件 tab 不做持续自动同步，提供“同步终端目录”的手工操作，并可选择目标终端

主要文件：

- `src/client/components/session/session.jsx`
- `src/client/components/session/session.styl`
- `src/client/components/terminal/terminal.jsx`
- `src/client/common/active-terminal.js`
- `src/client/store/session.js`

### 3.5 右侧会话侧边栏

右侧侧边栏围绕当前 SSH tab 显示，已按紧凑布局调整：

- 服务器监控位于顶部
- AI 助手和辅助工具放在同一个右侧区域
- 右侧栏可以隐藏/显示
- 隐藏后只保留顶部紧凑开关，不保留宽空白栏
- 已删除重复的“快捷操作”区域
- 传输任务入口移到上部工具图标区

主要文件：

- `src/client/components/side-panel-r/side-panel-r.jsx`
- `src/client/components/side-panel-r/right-side-panel.styl`
- `src/client/components/terminal-info/*`

### 3.6 文件与传输

- 本地文件和远程文件可以作为会话子 tab 打开
- 传输任务在工作区底部或侧边传输中心展示，不再使用额外重复弹窗
- 传输面板有明确关闭操作
- 文件右键菜单和常用操作已做中文化检查
- 文件与终端目录同步逻辑应区分“分屏自动跟随”和“文件 tab 手工同步”

### 3.7 命令助手

命令助手用于解决用户记不住 Linux 命令、软件目录和常见运维操作的问题。

当前能力包括：

- 多行命令输入，不再使用会遮挡内容的单行浮层
- 当前机器/SSH 环境识别
- 系统信息与已安装软件探测
- 从 PATH、运行进程和常见安装位置识别软件
- 支持 OpenResty/nginx 常见路径
- 已安装软件直接展示在“已安装”区域
- 每个软件提供常见操作，例如查看目录、状态、日志、重启等命令
- 命令历史和建议仍保留
- 机器探测不应额外创建一个用户可见终端 tab

主要文件：

- `src/client/components/terminal/command-assistant.jsx`
- `src/client/components/terminal/command-assistant.styl`
- `src/client/components/terminal/command-assistant-profile.mjs`
- `test/unit-ci/command-assistant-profile.spec.js`

### 3.8 连接导入

服务器资源管理支持从其他客户端导入连接。当前解析器覆盖：

- electerm 导出 JSON
- Xshell `.xsh`
- FinalShell 常见 JSON 字段
- OpenSSH config

导入流程包含预览、类型识别、冲突处理和分组。当前支持一次选择多个文件，导入前可以选择
目标分组，也可以保留各文件识别出的来源分组。安全规则：

- 不导入 Xshell/FinalShell 的不可解密密码
- 对缺少凭据的连接标记“需补充凭据”
- 支持跳过已有连接
- 导入结果可以放入用户选择的现有分组，或对应来源分组

主要文件：

- `src/client/common/connection-import-parser.mjs`
- `src/client/components/tree-list/connection-import-modal.jsx`
- `src/client/components/tree-list/connection-import-modal.styl`
- `src/client/components/tree-list/bookmark-toolbar.jsx`
- `src/client/components/tree-list/bookmark-upload.js`
- `test/unit-ci/connection-import-parser.spec.js`

### 3.9 终端主题

最后一次修复解决了“终端主体颜色修改不生效”的问题。

原问题：

- Xterm 画布被设为透明以支持背景图
- 终端容器实际一直使用 UI 的 `main`
- 保存时 `terminal:background` 又会被 `main` 强制覆盖
- 因此浅色界面无法配置独立的深色终端

当前行为：

- `main` 显示为“界面主背景”，只控制应用界面
- `terminal:background` 显示为“终端底色”，控制真实终端主体
- 两种颜色独立保存和应用
- 终端容器通过 `--terminal-background` 使用终端主题底色
- 保持 Xterm 透明能力，终端背景图片仍可叠加
- “保存并应用”操作固定在主题编辑区上方
- 再次打开终端主题页不会因记住旧 tab 状态而被错误关闭

主要文件：

- `src/client/components/theme/theme-form.jsx`
- `src/client/components/theme/theme-edit-slot.jsx`
- `src/client/components/terminal/terminal.styl`
- `src/client/components/session/session.jsx`
- `src/client/components/setting-panel/setting-wrap.styl`
- `src/client/store/setting.js`
- `test/e2e/009.basic.themes.spec.js`

### 3.10 本地数据加密

已增加本地 AES-GCM 加密与旧数据兼容处理：

- 新增本地数据库加密封装
- 无法解密的旧记录不删除、不覆盖
- 无法保存 `userConfig` 时停止重复写入，设置和终端主题页仍可使用
- 用户在锁定状态下修改设置时，仅提示一次“本次修改仅当前运行有效”
- 用户恢复钥匙串访问后可以重新加载
- 主题预设仅在展示层本地化，`default`、`defaultLight` 等保存 ID 和导出数据保持不变

主要文件：

- `src/app/lib/db-crypto.js`
- `src/app/lib/safe-storage.js`
- `src/app/lib/storage-key.js`
- `src/app/lib/sqlite.js`
- `src/client/store/db-upgrade.js`
- `src/client/store/load-data.js`
- `src/client/store/watch.js`
- `src/client/common/get-theme-display-name.js`
- `test/e2e/00184.storage-encryption.spec.js`

## 4. 视觉与国际化实现

全局中国版样式主要集中在：

- `src/client/css/china-workbench.styl`
- `src/client/components/setting-panel/setting-wrap.styl`
- 各业务组件自己的 `.styl` 文件

中文文案主要来自：

- `src/app/lib/locales.js`
- `src/client/components/widgets/widget-i18n.js`
- 各中国版页面中的固定中文文案

当前视觉基准：

- 页面背景：浅灰白
- 内容面板：白色
- 主色：清晰的蓝色
- 边框：浅灰蓝
- 状态色可以使用绿、黄、红，不做单一蓝色主题
- 卡片圆角控制在 8px 以内
- 左侧功能图标允许彩色，但同一功能状态要保持一致
- 不允许遗留黑色外边、黑色弹窗或暗色空白区域

`china-workbench.styl` 已超过 4000 行，包含多轮覆盖规则。后续不要盲目大规模重排；
改样式前先用 `rg` 找到组件局部样式和最后生效的覆盖，再通过截图确认。

## 5. 关键代码索引

| 领域 | 主要文件 |
| --- | --- |
| 页面规划 | `docs/page-architecture.md` |
| 首页工作台 | `src/client/components/tabs/no-session.jsx`, `no-session.styl` |
| 顶部主 tab | `src/client/components/tabs/index.jsx`, `tab.jsx`, `tabs.styl` |
| “+”服务器选择 | `src/client/components/tabs/add-btn*` |
| 左侧导航 | `src/client/components/sidebar/index.jsx`, `side-icon.jsx`, `sidebar.styl` |
| 服务器资源树 | `src/client/components/tree-list/*` |
| 连接表单 | `src/client/components/bookmark-form/*` |
| SSH 会话子 tab | `src/client/components/session/session.jsx`, `session.styl` |
| 终端 | `src/client/components/terminal/*` |
| SFTP 文件 | `src/client/components/sftp/*` |
| 传输任务 | `src/client/components/file-transfer/*`, `src/client/components/sidebar/transfer-*` |
| 右侧会话栏 | `src/client/components/side-panel-r/*`, `terminal-info/*` |
| 设置中心 | `src/client/components/setting-panel/*` |
| 数据同步 | `src/client/components/setting-sync/*` |
| AI | `src/client/components/ai/*` |
| 数据安全 | `src/app/lib/db-crypto.js`, `safe-storage.js`, `storage-key.js` |
| 全局中国版皮肤 | `src/client/css/china-workbench.styl` |

## 6. 已完成验证

在提交 `778a8665` 前后执行过以下验证：

### 6.1 静态检查

```bash
npm run lint
git diff --check
```

结果：通过。远程 push hook 也再次执行了 lint 并通过。

### 6.2 单元测试

```bash
npm run test-unit-ci
```

结果：10 个 suite、41 个 test，全部通过。

覆盖内容包括：

- 命令助手机器环境识别
- 连接导入解析
- SSH agent、密码、2FA、known_hosts
- FTP、串口、Telnet 传输
- Web 连接测试

### 6.3 生产构建

```bash
npm run vite-build
```

结果：通过。

现有非阻塞警告：

- `@xterm/addon-ligatures` 的 Node 模块浏览器 externalize 提示
- 个别构建 chunk 超过 500 kB

### 6.4 关键 E2E

已通过：

- `test/e2e/00183.layout-divider.spec.js`
- `test/e2e/00184.storage-encryption.spec.js`
- `test/e2e/00185.china-ui-smoke.spec.js` 的两个用例
- `test/e2e/009.basic.themes.spec.js`

共 5 个关键用例，覆盖布局分隔条、加密迁移、主页面、终端子 tab、连接导入和主题背景。

E2E 应使用独立数据目录，避免污染用户数据：

```bash
DATA_PATH="/tmp/electerm-e2e-$(date +%s)" \
  ./node_modules/.bin/playwright test \
  test/e2e/00183.layout-divider.spec.js \
  test/e2e/00184.storage-encryption.spec.js \
  test/e2e/00185.china-ui-smoke.spec.js \
  --workers=1
```

运行 E2E 前必须关闭正在运行的预览 Electron，否则单实例锁会使测试连接到错误进程或直接退出。

### 6.5 2026-07-15 本轮验证

已通过：

```bash
npm run lint
git diff --check
npm run vite-build
```

另外使用 `work/app` 的真实 Electron 构建产物和隔离数据目录验证：

- 旧版锁定的 `data:userConfig` 不会被覆盖。
- 设置中心、终端主题页仍可打开。
- 首次修改设置会提示本次修改仅当前运行有效，运行时设置仍会立即生效。
- 终端主题页显示“默认”“默认浅色”，主题 ID 不变。

当前机器的 Playwright `1.28.1` 在 Node `25.8.1` 下会报
`Execution context was destroyed`，不应据此判定应用功能失败；修复环境后应重新跑
`00184.storage-encryption.spec.js` 和 `009.basic.themes.spec.js`。

## 7. 当前预览与启动方式

开发调试：

```bash
# 终端 1
npm start

# 终端 2
npm run app
```

- Vite 预览地址：`http://127.0.0.1:5570`
- `npm run app` 使用开发入口 `src/app`，适合调试，不可代替发布前的构建验证。

构建产物验证：

```bash
npm run vite-build
npm run t
```

`npm run t` 启动 `work/app` 中的构建产物；真实 Electron 页面检查、截图和发布前功能走查应使用该方式。
预览端口会随运行时变化，新 Codex 不应假设已有进程或端口仍然存活。

## 8. 已知数据状态与技术债

### 8.1 旧加密记录

本机仍可能存在无法通过 macOS safeStorage 解密的旧记录。应用不会在启动时打断用户；
若锁定的是 `userConfig`，用户首次修改设置时会收到一次说明，日志和锁定保护仍保留：

```text
部分旧数据暂未解锁
检测到 4 条旧版加密记录。数据仍保留在本机，恢复钥匙串访问后可以重新加载。
```

这是旧钥匙串访问问题，不要删除这些记录，也不要为了消除提示而覆盖数据。

### 8.2 运行时警告

开发预览中曾出现以下上游警告，尚未系统处理：

- 少数组件列表缺少唯一 React `key`

`TreeSelect.popupClassName` 的已废弃用法已改为 `classNames.popup.root`。

这些不是当前核心流程阻断项，但后续做质量收尾时应逐个定位。

### 8.3 大范围改造风险

- 本分支改动面很大，与上游 electerm 后续升级可能产生大量冲突。
- `session.jsx`、`session.styl` 和 `china-workbench.styl` 是高风险文件。
- 修改终端、文件跟随或 tab 生命周期时，必须同时回归默认终端、附加终端、文件 tab 和分屏。
- 不要仅凭静态页面判断功能；终端/SFTP 必须通过真实 Electron 会话验证。

## 9. 建议的下一步

若用户继续要求“检查所有页面”或“继续优化”，建议按以下顺序执行：

1. 用真实 Electron 逐页走查首页、服务器资源、新建连接、SSH、本地终端、文件、传输、设置、主题、同步、扩展工具和关于页。
2. 每页检查四项：入口能否找到、功能是否执行、中文是否完整、关闭/返回是否清晰。
3. 优先修复阻断真实任务的问题，不再新增重复入口或仅装饰性的页面区块。
4. 检查浅色主题下是否仍有黑色背景、黑边、透明层穿透或弹窗配色不一致。
5. 用桌面和较窄窗口分别截图，确认文字不溢出、固定栏不遮挡、tab 可滚动。
6. 最后处理 React key、Ant Design 废弃 API 和重复 CSS 等技术债。

## 10. 继续开发时的工作规则

- 修改前先读 `README.md` 和相关组件，不要根据文件名猜用途。
- 优先复用 electerm 现有 Store、组件和协议实现，不要重新手写 SSH/SFTP 核心逻辑。
- 不要重置或回退不属于当前任务的工作区改动。
- 手工编辑使用 `apply_patch`。
- 有维护价值的源码注释使用：

```text
YYYY-MM-DD coder(lq): comment content
```

- 注释只解释非显然逻辑，不添加复述代码的空注释。
- 页面修改后至少执行相关 lint、最窄的自动化测试和真实预览。
- 提交前检查 `git diff --check`、未跟踪文件和敏感信息。
