# AGENT-GENERATION-OPS-1 · 模型类节点操作接入生成提案

日期：2026-11-11
分支：`feat/agent-generation-ops`
基线：`main` @ `4ea4403`（PR #6 合并后）

## 范围

- `generation_propose` 新增 `operationId` / `itemId` / `mask`。
- 8 个模型类节点操作标记 `generationProposable`。
- 操作提示词复用 `node-operations.ts`，不再让模型手写。
- 目标节点当前图片自动作为 reference。
- 主进程提案允许 PNG mask，并校验模型是否支持图片输入。

## 实现要点

- `src/shared/node-operation-specs.ts`：新增 `generationProposable` 和 item 约束。
- `src/renderer/src/canvas/nodes/node-operation-runner.ts`：操作发现返回 `generationProposable`。
- `src/renderer/src/agent/canvasBridge.ts`：
  - `generation_propose` 解析 `operationId` / `itemId`
  - 用 `buildOperationPrompt` 生成提示词
  - 目标节点当前图片加入 refs
  - `request.op` 写入操作 ID
- `src/main/agent/tools.ts`：参数校验（operationId、itemId、mask、prompt 二选一）。
- `src/main/agent/proposals.ts`：允许 PNG mask；图片模型校验。
- `src/main/agent/runtime.ts`：系统提示更新。

## 支持矩阵

| 操作 | generationProposable | itemId |
|---|---|---|
| `grid-generate` | 是 | multi / story |
| `character-sheet` | 是 | 无 |
| `time-shift` | 是 | after / before |
| `multi-angle` | 是 | front / left / right / high / low / back / custom |
| `panorama` | 是 | 无 |
| `color-grade` | 是 | 无 |
| `relight` | 是 | top / left / right / back / golden / blue / custom |
| `portrait` | 是 | natural / standard / strong |
| `inpaint` / `erase` / `element-edit` | 否 | 需要蒙版交互 |

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：42 个文件、312 个用例全部通过。
- `corepack pnpm build` 通过。
- 真实模型烟测（隔离 userData，复制 models/settings/Local State）：
  - 文本模型：Agnes 3.0 Flash
  - 图片模型：Agnes Image 2.5 Flash
  - 指令：为 `image-smoke` 登记 `character-sheet` 提案
  - 实际工具调用：`canvas_get` → `canvas_node_operations` → `generation_propose`
  - 提案创建成功：
    - `request.op = character-sheet`
    - `request.prompt` 为角色三视图提示词
    - `request.refs[0] = { path: assets/smoke.png, role: reference, scope: project }`
    - 状态 `pending`，未提交生成
  - 第一次用 MOSS 图像模型时因模型不支持参考图片被主进程拒绝，说明校验生效；改用 Agnes Image 2.5 Flash 后成功。

## 已知限制

- `inpaint` / `erase` / `element-edit` 仍需界面涂抹蒙版。
- 提案提交仍由用户确认，真实生成队列不在本次烟测范围。
