# 代码变更 → 文档影响

日期：2026-11-13
状态：现行
适用版本：v0.1.0
最后核对：2026-11-13

> 用途：PR 修改下列代码路径时，检查对应现行文档是否需要同步。它不替代 `check:docs`，只是把“应该改哪份文档”显式化。

## 映射

| 代码路径 | 需要检查的文档 |
|---|---|
| `src/main/ipc/` | `docs/architecture.md` |
| `src/main/project/` | `docs/architecture.md` |
| `src/shared/` 中的 schema / IPC 合同 | `docs/architecture.md`、`docs/models.md` |
| `src/main/agent/tools.ts` | `docs/agent-capabilities.md` |
| `src/main/agent/runtime.ts`、`src/main/agent/` | `docs/agent-architecture-plan.md`、`docs/agent-capabilities.md` |
| `src/renderer/src/styles/tokens.css`、`src/renderer/src/components/` | `docs/ui-spec.md` |
| `src/renderer/src/canvas/`、`src/renderer/src/studio/` | `docs/ui-spec.md` |
| `src/main/components/` | `docs/runtime-components-plan.md`（历史参考） |
| `.github/workflows/`、发布脚本 | `docs/branch-policy.md`、`CONTRIBUTING.md` |
| `package.json` 脚本或依赖 | `README.md`、`CONTRIBUTING.md` |

## 使用方式

1. PR 模板勾选已更新的现行文档。
2. 如果不需要更新，在“Not applicable”后写明原因。
3. 修改文档后运行 `corepack pnpm check:docs`。
