# Goose 智能体底座调研

调研日期：2026-09-02。以下结论均来自 Goose 官方仓库与文档。

## 关键机制

- **持久化状态机循环**：`StateMachine::run` 每一步重新加载 session，根据已持久化会话决定下一个 operation，执行并写回 effects；仅在显式 `yield` 或没有适用步骤时结束。这避免“任意命令成功即提前结束”的状态丢失。源码：[goose-agent machine.rs](https://github.com/aaif-goose/goose/blob/main/crates/goose-agent/src/machine.rs)、[session.rs](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/state_machine/session.rs)。
- **工具调用闭环**：模型只能生成结构化工具调用，agent 执行 MCP 工具并将 ToolResult（包括错误）回传模型，模型可据此纠错/重试。架构：[goose-architecture.md](https://github.com/aaif-goose/goose/blob/main/documentation/docs/goose-architecture/goose-architecture.md)、[error-handling.md](https://github.com/aaif-goose/goose/blob/main/documentation/docs/goose-architecture/error-handling.md)。
- **完成门禁**：`recipe__final_output` 强制模型调用，结果按 JSON Schema 校验；失败信息回传模型继续修正。[final_output_tool.rs](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/final_output_tool.rs)
- **目标驱动继续执行**：`/goal` 在结束前要求模型检查目标是否完全满足，`/grind` 持续工作到 max turns；默认最大 1000 turns。[agent.rs](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/agent.rs)、[ops_maxturns.rs](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/state_machine/ops_maxturns.rs)
- **风险分级审批**：Auto、Manual Approval、Smart Approval、Chat Only 四种模式；工具级 Always Allow/Ask Before/Never Allow。低风险读取可自动放行，高风险写入/删除需确认。[goose-permissions.md](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/managing-tools/goose-permissions.md)、[tool-permissions.md](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/managing-tools/tool-permissions.md)
- **工具前后钩子**：PreToolUse 可在执行前阻止，执行后钩子可记录/验证；每次调用含 request id、工作目录和结构化结果。[ops_toolcalling.rs](https://github.com/aaif-goose/goose/blob/main/crates/goose/src/agents/state_machine/ops_toolcalling.rs)
- **上下文治理**：自动压缩旧消息和冗长命令输出；持久指令 MOIM 每轮重新注入（64KB上限），适合放服务器操作规范与完成条件。[GDK](https://github.com/aaif-goose/goose/blob/main/documentation/docs/gdk/index.md)、[persistent instructions](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/using-persistent-instructions.md)
- **结果展示**：Concise 模式默认折叠工具卡片、只展示工具名；Detailed 可展开完整参数/结果。[adjust-tool-output.md](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/managing-tools/adjust-tool-output.md)
- **安全审查**：独立 adversary reviewer 在工具执行前按原始任务、近期上下文与工具参数做 ALLOW/BLOCK；另有提示注入检测。[adversary-mode.md](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/security/adversary-mode.md)

## 对 electerm 的适配判断

Goose 的 Rust agent/GDK 可作为参考或通过 ACP 嵌入（GDK 当前 alpha，需锁定版本）。直接替换 electerm 的 Node/Electron agent 成本较高；建议先仿照其分层实现：持久化状态机、结构化工具循环、错误回传纠错、目标/最终输出门禁、风险审批和上下文压缩，再评估 ACP/GDK 集成。
