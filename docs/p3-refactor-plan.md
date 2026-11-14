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

## 进度

| 项 | 状态 | 结果 |
|---|---|---|
| `tools.ts` | done | 3,287 → `tools/index.ts` 162 行 + 8 个域文件；工具定义和参数校验都按域拆分 |
| `canvas.ts` | done | 2,502 → `canvas.ts` 204 行 + `canvas-model.ts` 341 行 + 5 个 slice；新增 4 个 store 测试 |
| `PromptBar.tsx` | partial | 纯函数与类型拆到 `promptbar-model.tsx`；菜单和参数面板拆分待续 |
| `AgentPanel.tsx` | todo | 会话菜单、模型选择、消息列表和输入区待拆 |
| Studio / Stage / three 懒加载 | done | 首屏 index gzip 364KB + canvas 115KB；three 252KB 延迟加载 |
| 性能优化 | todo | React Flow 视口裁剪、撤销栈增量、缩略图并发 |
| 测试与 e2e | done | 新增 library store、asset protocol、IPC 注册测试；Playwright 覆盖项目中心、创建项目/画布、资产库、CineBot 四条链路 |

## 覆盖率基线

日期：2026-11-14
命令：`pnpm test:coverage`

| 指标 | 当前 | 阈值 |
|---|---:|---:|
| Statements | 34.72%（3,641 / 10,484） | 30% |
| Branches | 36.20%（2,661 / 7,350） | 30% |
| Functions | 35.59%（593 / 1,666） | 30% |
| Lines | 36.56%（3,379 / 9,242） | 30% |

统计范围：`src/shared/**/*.ts`、`src/main/**/*.ts`，排除 `__tests__` 和类型声明。

下一步：每月提升 2–3 个百分点，优先补 protocol、library、IPC 和 runtime 的边界分支。

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
- Playwright e2e 三条链路：`pnpm test:e2e`（先构建 `out/`，使用临时 userData）。
