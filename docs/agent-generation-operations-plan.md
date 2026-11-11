# CineBot Phase 4：模型类节点操作接入生成提案

日期：2026-11-11
状态：**已实施**
分支：`feat/agent-generation-ops`
关联：`docs/node-operation-bridge-plan.md`、`docs/agent-capabilities.md`

## 1. 目标

让节点工具栏里需要模型的操作也能由 CineBot 登记生成提案，同时保持两段式：

1. `generation_propose` 只登记，不扣费。
2. 用户在面板确认后才提交生成。

## 2. 工具变更

`generation_propose` 新增：

| 参数 | 作用 |
|---|---|
| `operationId` | 复用节点工具栏操作的提示词，例如 `character-sheet`、`grid-generate` |
| `itemId` | 选择菜单项，例如 `multi`、`front`、`golden` |
| `mask` | PNG data URL 蒙版，仅图片编辑使用 |

`prompt` 改为可选：传 `operationId` 时自动使用该操作的提示词。

## 3. 操作规格

`src/shared/node-operation-specs.ts` 增加 `generationProposable`：

- `grid-generate` / `time-shift` / `multi-angle` / `relight` / `portrait`：需要 itemId。
- `character-sheet` / `panorama` / `color-grade`：不需要 itemId。
- `inpaint` / `erase` / `element-edit`：需要蒙版交互，`generationProposable=false`，仍走界面。

`canvas_node_operations` 返回 `generationProposable`，模型可以据此选择 `canvas_node_operation` 或 `generation_propose`。

## 4. 执行链路

```text
Agent
  → canvas_node_operations 发现 operationId / itemId / generationProposable
  → generation_propose({ nodeId, modelKey, operationId, itemId })
  → 渲染进程用 buildOperationPrompt 解析操作提示词
  → 目标节点当前图片自动作为 reference
  → 主进程 createProposal 校验模型是否支持图片输入
  → 生成提案 pending
  → 用户确认后 submit
```

要点：

- 操作提示词只在 `node-operations.ts` 维护，Agent 不重复写提示词。
- `request.op` 写入 `operationId`，生成结果会带 `OutputRef.op`。
- 目标节点自己的当前输出会自动加入 refs（operationId 模式），保证“角色三视图 / 打光 / 扩图”等操作基于当前画面。
- 模型不支持图片输入时，主进程直接拒绝提案，不产生扣费。

## 5. 测试

- `src/main/agent/__tests__/tools.test.ts`：
  - operationId + itemId 合法组合
  - 缺少必需 itemId
  - 未知操作
  - 蒙版操作不能通过 generation_propose
  - mask PNG data URL 校验
- `src/shared/__tests__/node-operation-specs.test.ts`：
  - `generationProposable` 标记
- 真实模型烟测：
  - Agnes 3.0 Flash 调用 `generation_propose`
  - 目标模型 Agnes Image 2.5 Flash
  - `operationId=character-sheet`
  - 提案成功，`request.op=character-sheet`，prompt 为角色三视图提示词，refs 包含目标节点当前图片

## 6. 已知限制

- 三个蒙版操作仍需界面涂抹。
- `generation_propose` 不做真实生成，提交仍由用户确认。
- 真实图片生成队列和 Agnes 视频队列不在本次烟测范围。
