# Implementation Plan: Electerm Agent Runtime Foundation

## Overview

Replace the fragile command-text/fallback behavior with a small, reusable agent runtime contract. The first release keeps the existing AI provider and SSH transport, but makes tool calls structured, stateful, cancellable, auditable, and unable to finish before evidence is available.

## Architecture Decisions

- Keep the runtime in the client layer initially so it can reuse the existing Electron IPC and SSH session APIs; leave room for a later sidecar.
- Treat the model as a planner and answer writer only. The runtime owns state transitions, command execution, risk policy, retries, and completion.
- Accept terminal commands only from structured tool-call arguments. Natural-language command extraction is retained only behind an explicit compatibility flag and is disabled by default.
- Persist the full task timeline in the existing AI history entry while sending bounded context to the provider.

## Task List

### Phase 1: Foundation

- [ ] Task 1: Add pure runtime protocol, state machine, risk policy, and completion gate.
- [ ] Task 2: Add regression tests for transitions, command boundary isolation, and final gating.
- [ ] Task 3: Integrate the runtime policy into the existing agent loop and remove speculative fallback execution by default.

### Checkpoint: Foundation

- [ ] Unit tests pass.
- [ ] Existing agent execution tests pass.
- [ ] Build/lint succeeds.

### Phase 2: Execution reliability

- [x] Task 4: Add durable task timeline and bounded context builder.
- [x] Task 5: Add explicit task events for UI (started, tool started/finished, approval, verification, final, blocked, cancelled).
- [ ] Task 6: Add retry/stuck detection based on repeated actions and unchanged observations.

### Phase 3: UI and rollout

- [ ] Task 7: Render event summaries and approval actions in the fixed action area.
- [ ] Task 8: Add feature flag and migration fallback for existing sessions.
- [ ] Task 9: Evaluate against a representative SSH task set and document results.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Providers omit tool calls | High | Structured repair turn, then explicit blocked state; never guess commands silently |
| Older sessions use PTY fallback | Medium | Keep compatibility path available but mark it legacy and sanitize output |
| Long-running commands | Medium | Preserve background tool and cancellation, enforce timeout metadata |
| Existing UI assumes free-form response text | Medium | Keep response field, add runtime metadata additively |

## Open Questions

- Whether to move the runtime into a Rust or Python sidecar after the Node proof of concept meets the task-set targets.
