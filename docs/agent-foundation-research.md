# 服务器操作智能体底座调研

更新时间：2026-09-02

## 结论先行

electerm 目前的问题不是缺少“查版本”等命令规则，而是智能体执行协议不完整：工具调用没有形成可靠的“调用→观察→判断→继续/修正→验证→最终答复”闭环，模型会把命令输出误当成下一条命令，或者在没有完成目标时提前结束。

建议将 AI 能力拆成三层：

```text
Electron UI
  └─ 本地 Agent Service（状态机、上下文、审批、完成门禁）
       └─ SSH/本地执行适配器（PTY、超时、取消、输出截断）
```

短期可在现有代码中重建一个最小、可测试的循环；中期把循环移到独立的 Agent Service；长期再评估直接复用 OpenHands SDK 或 goose GDK。不要把第三方完整 UI 嵌入 electerm renderer。

## 候选项目

| 项目 | 最值得借鉴的部分 | 与服务器操作的匹配度 | 主要限制 | 建议用法 |
| --- | --- | --- | --- | --- |
| [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk) | Python SDK、REST/TypeScript 客户端；本地/远程 workspace；持久会话；最大迭代数和卡死检测；PTY/tmux 长任务；安全分析器；上下文 condenser | 高 | 依赖和运行时较重，直接嵌入 Electron 成本高 | 作为独立 Agent Server 或参考其协议 |
| [goose](https://github.com/aaif-goose/goose) | Rust 持久化 StateMachine；MCP 工具；工具错误回传模型后自动纠错；Auto/Manual/Smart/Chat Only 审批；强制 `final_output` 校验；goal/grind；上下文压缩 | 高 | GDK 目前 alpha，API 需锁定版本；Rust 集成有成本 | 最适合参考通用运维智能体架构，或作为本地 sidecar |
| [Codex CLI](https://github.com/openai/codex) | Allow/Prompt/Forbidden 执行策略；危险命令识别；sandbox；超时、取消、输出上限、进程组清理；app-server 协议；上下文 compact | 中高 | 默认面向代码任务，远程 SSH 和运维风险模型需适配 | 参考执行安全和 UI/内核分离协议 |
| [mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent) | 约 100 行的最小闭环：模型→命令→执行→观察→继续；step/cost/time 限制；超时杀进程组；轨迹保存 | 中 | Bash-only；没有生产级审批和安全策略 | 用作短期重建 loop 的基准实现 |
| [SWE-agent](https://github.com/SWE-agent/SWE-agent) | 格式错误重试、Bash 预检、超时、输出截断、history processor | 中 | 官方已推荐 mini-SWE-agent；更偏研究和代码仓库 | 只借鉴容错和历史处理 |
| [Aider](https://github.com/Aider-AI/aider) | Repo map、Git/lint/test、历史摘要 | 低 | 核心是代码编辑器，不是服务器运维执行器 | 仅借鉴上下文摘要和验证习惯 |

## 关键能力对照

### 1. 必须是持久化状态机，而不是一次性 while 循环

goose 的每一步都会从持久化 session 恢复状态，记录 operation metadata，支持取消；OpenHands 的 Conversation 也支持持久会话、最大迭代数和 stuck detection。这样 UI 重载、网络抖动或跨窗口时不会丢失“正在执行什么、已经观察到什么、下一步是什么”。

### 2. 终端执行必须返回结构化 observation

执行器至少返回：`commandId`、原始命令、退出码、stdout、stderr、开始/结束时间、是否超时、是否被取消、输出是否截断。原始终端回显只用于调试；发给模型的是结构化结果和摘要，避免把 shell 提示符、`Up 33 minutes` 等状态文本再次当成命令。

OpenHands 的 TerminalAction/Observation 和终端工具支持持久 shell、tmux/PTY、长任务、继续读取、Ctrl-C、reset，可作为 SSH 适配器的设计参考。

### 3. 工具错误要回传模型，不能直接结束回合

goose 的错误处理会将 ToolResult 继续交给模型，模型可以修正参数或选择替代方案。网络错误、命令不存在、权限不足、非零退出码都应进入同一循环；只有达到取消、超时、最大步数或不可恢复错误时才结束。

### 4. 完成必须有门禁和最终输出契约

不要以“模型说我继续查”作为完成条件。为每个请求维护目标状态，要求模型在结束前调用结构化 `final_output`（例如 `status: success|partial|blocked`、`answer`、`evidence`、`next_action`）。字段校验失败时，把具体校验错误回传模型并要求修正。goose 的 `final_output` JSON Schema、`/goal`/`/grind` 和 max-turns 机制可直接参考。

### 5. 审批按风险，而不是按“是否是中风险”粗暴处理

建议默认策略：

- 只读查询、版本查看、日志读取、状态检查：自动执行。
- 会改变配置、重启服务、安装/升级软件：自动执行，但在执行前显示一条固定位置的可见提示，并允许停止。
- 删除、覆盖、清空、批量迁移、权限/密钥变更、磁盘/网络破坏性操作：必须明确确认；支持取消和队列删除。
- 明确禁止的危险模式：阻止执行并解释原因。

goose 已实现 Auto、Manual Approval、Smart Approval、Chat Only 及工具级 Always Allow/Ask/Never Allow；Codex 的 Allow/Prompt/Forbidden 和危险命令启发式可作为规则边界参考。审批结果应持久化在 operation metadata，避免重复执行。

### 6. 上下文要长期保留，但发送给模型由策略决定

会话记录持久化保存，除非用户手工删除。每次调用时由 context manager 选择完整历史、最近消息、目标相关摘要和关键工具结果；超出窗口时自动压缩旧消息，保留目标、已执行命令、关键证据、失败原因和待办事项。goose context-management、持久指令 MOIM 和 OpenHands condenser 都提供了可参考的实现方向。

## 推荐落地路线

### 阶段 A：先修正确性（不换模型）

1. 抽出 `AgentRun` 状态：`planning / executing / observing / verifying / completed / blocked / cancelled`。
2. 所有工具调用统一走一个 dispatcher；禁止模型直接拼接“终端回显”作为下一条命令。
3. 每一步写入 session 日志，并把结构化 observation 回传模型。
4. 增加完成门禁：没有证据或 final output 不完整时自动继续，达到上限才向用户说明阻塞原因。
5. 增加 `stop`、超时、最大步数、单步输出上限和进程组清理。

### 阶段 B：分离 Agent Service

保持 Electron 只负责展示和用户交互，Agent Service 负责状态机、上下文和审批，SSH adapter 负责远程终端。通过事件协议传递 `run.started`、`tool.requested`、`tool.progress`、`tool.result`、`approval.required`、`run.completed`、`run.failed`。这一步能解决“多个窗口互相影响”“刷新后无法恢复”“输出滚动和执行状态混在 UI 逻辑里”等问题。

### 阶段 C：评估复用底座

- 需要快速获得完整能力：先做 OpenHands SDK sidecar PoC。
- 需要与 Electron/本地进程紧密集成：评估 goose GDK/ACP；锁定 commit，先验证 API 稳定性。
- 需要最小依赖和完全可控：自建轻量 Rust/Node Agent Service，吸收 goose/Codex 的权限、状态机和上下文设计。

## 不建议的方案

- 为 `openclaw`、`nginx`、`docker` 等问题继续增加关键词或特殊命令分支。
- 让模型自由输出多条 shell 文本，再从自然语言中猜哪一段是命令。
- 把所有 stdout 原样塞回对话；这会放大提示符、乱码和误执行。
- 仅依赖 system prompt 要求“不要停”，却没有状态机、验证器和最大步数。
- 直接把 OpenHands/goose 的桌面 UI 嵌到 electerm；应复用内核能力，保留 electerm 的终端和会话体验。

## 官方资料索引

- OpenHands SDK 会话：[conversation.py](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/conversation/conversation.py)
- OpenHands 终端工具：[Terminal README](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-tools/openhands/tools/terminal/README.md)
- OpenHands 上下文压缩：[condenser](https://github.com/OpenHands/software-agent-sdk/tree/main/openhands-sdk/openhands/sdk/context/condenser)
- OpenHands 安全策略：[security](https://github.com/OpenHands/software-agent-sdk/tree/main/openhands-sdk/openhands/sdk/security)
- goose 架构：[goose architecture](https://github.com/aaif-goose/goose/blob/main/documentation/docs/goose-architecture/goose-architecture.md)
- goose 错误处理：[error handling](https://github.com/aaif-goose/goose/blob/main/documentation/docs/goose-architecture/error-handling.md)
- goose 权限：[goose permissions](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/managing-tools/goose-permissions.md)
- goose 工具审批：[ops_tool_approval.rs](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/state_machine/ops_tool_approval.rs)
- goose 最终输出：[final_output_tool.rs](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/final_output_tool.rs)
- goose 上下文管理：[goose-context-management](https://github.com/aaif-goose/goose/tree/main/crates/goose-context-management)
- Codex 执行策略：[exec_policy.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/exec_policy.rs)
- Codex 执行器：[exec.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/exec.rs)
- Codex 执行策略文档：[Exec policy](https://developers.openai.com/codex/exec-policy)
- mini-SWE-agent 核心循环：[default.py](https://github.com/SWE-agent/mini-swe-agent/blob/main/src/minisweagent/agents/default.py)
- mini-SWE-agent 本地执行：[local.py](https://github.com/SWE-agent/mini-swe-agent/blob/main/src/minisweagent/environments/local.py)
