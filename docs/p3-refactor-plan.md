# P3 架构拆分计划

适用版本：v0.1.0
最后核对：2026-11-14

## 目标

降低单文件复杂度，保持现有行为和对外 API 不变。每一项单独提交，typecheck / test / build 通过后再进入下一项。

## 拆分顺序

| 顺序 | 文件 | 当前行数 | 目标 |
|---|---:|---:|---|
| 1 | `src/main/agent/tools.ts` | 3,287 | 按工具域拆到 `agent/tools/`，`index.ts` 只保留聚合、查询与通用校验 |
| 2 | `src/renderer/src/stores/canvas.ts` | 2,332 | 拆图结构、节点、连线、选择、分组、撤销等 slice |
| 3 | `src/renderer/src/canvas/PromptBar.tsx` | 1,681 | 拆提及菜单、模型菜单、参数面板、上传菜单和输入区 |
| 4 | `src/renderer/src/agent/AgentPanel.tsx` | 约 1,500 | 拆会话菜单、模型选择、消息列表和输入区 |

## 约束

- 不改工具名、参数 schema、权限模式、确认文案。
- 不改状态字段和持久化结构。
- 拆分文件优先按现有域边界，不引入新的抽象层。
- `tools.ts` 删除后由 `tools/index.ts` 承接，现有 `from './tools'` / `from '../tools'` 不需要改。
- 每步完成后跑 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。

## 后续

- Studio / Stage / three 懒加载。
- React Flow 视口裁剪、撤销栈增量、缩略图并发。
- protocol / project / library / IPC / runtime 测试。
- Playwright e2e 三条链路。
