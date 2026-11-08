# AGENT-TOOLS-1 · 工具注册表与 CanvasCommand

日期：2026-11-08
状态：完成
范围：Agent 工具注册表、CanvasCommand 画布命令层、回合级撤销
关联：`docs/agent-architecture-plan.md`、`docs/agent-full-scope.md`

## 1. 目标

把 spike 的硬编码工具升级为正式工具层：

- 工具注册表：按 profile、权限模式过滤。
- `CanvasCommand`：纯函数画布命令，支持 batch、预览、变更记录。
- 一轮 Agent 的多个画布命令只产生一条撤销记录。

## 2. 实现

### 2.1 工具注册表

新增 `src/shared/agent-tools.ts`：

- `AgentToolDefinition`：`id`、`name`、`profiles`、`readOnly`、`scope`、`modes`、`parameters`、`replay`
- `filterAgentTools()`：按 profile + permission mode 过滤
- `toModelTools()`：只输出模型需要的 `name/description/parameters`

`src/main/agent/tools.ts` 改为注册表：

| 工具 | 权限 | 说明 |
|---|---|---|
| `canvas_get` | 只读 | 读取画布摘要和选中节点 |
| `canvas_update_title` | 写 | 修改选中节点标题 |
| `canvas_move_node` | 写 | 移动选中节点到指定坐标 |

只读模式下只向模型暴露 `canvas_get`；写工具即使被模型调用也会被主进程拒绝。

### 2.2 CanvasCommand

新增 `src/shared/canvas-commands.ts`：

```ts
type CanvasCommand =
  | { type: 'updateTitle'; nodeId; title }
  | { type: 'moveNode'; nodeId; position }
  | { type: 'addNode'; node }
  | { type: 'removeNode'; nodeId }
  | { type: 'connect'; edge }
  | { type: 'removeEdge'; edgeId }
```

- `applyCanvasCommand()`：纯函数，返回新状态、变更和警告。
- `applyCanvasBatch()`：顺序执行并合并变更。
- 变更记录包含：新建/更新/删除节点、增删连线、原标题、原位置。

`addNode` / `removeNode` / `connect` / `removeEdge` 已实现并有测试，但暂未暴露为模型工具，后续按需开放。

### 2.3 回合级撤销

- `useCanvasStore.applyCommands(commands, turnId)`：
  - 第一个命令时 `pushHistory()` 一次。
  - 同一 `turnId` 的后续命令不再 push。
  - `endCommandTurn(turnId)` 在回合结束时清理。
- `canvasBridge` 执行工具时传入 `call.turnId`。
- 撤销按钮仍然调用一次 `canvasStore.undo()`。

## 3. 验证

### 3.1 单元测试

- `src/shared/__tests__/canvas-commands.test.ts`
  - 标题 + 移动 batch
  - 同一节点多次改名保留原始标题
  - 删除节点级联删除连线
  - 新增节点 + 连线
  - 缺失节点返回警告
- `src/shared/__tests__/agent-tools.test.ts`
  - 按 profile / mode 过滤
  - 画布 profile 看不到时间线工具
  - 模型工具只保留必要字段

结果：

```text
25 test files, 148 tests passed
```

### 3.2 端到端

真实 Agnes 3.0 Flash：

```text
把选中节点改名为 批量撤销测试，并移动到坐标 500, 300
→ canvas_get
→ canvas_update_title（命令层测试 → 批量撤销测试）
→ canvas_move_node（160,140 → 500,300）
→ 一次撤销
→ 标题恢复「命令层测试」，位置恢复 (160,140)
```

一条撤销同时恢复标题和位置，任务包 A 验收通过。

### 3.3 构建

- `corepack pnpm typecheck` 通过
- `corepack pnpm test` 通过
- `corepack pnpm build` 通过
- 主进程产物约 396KB

## 4. 已知限制

- `addNode` / `removeNode` / `connect` / `removeEdge` 只有命令层，未注册为模型工具。
- 工具注册表目前只有 `canvas` profile。
- 生成提案、上下文预算、技能目录、StageCommand 尚未实现。
- 剪辑室旧助手已删除，`clip` profile 待重新实现。

## 5. 下一步

1. 技能目录骨架：三级目录、SKILL.md 解析、`skill.list/read`。
2. 按需开放更多画布工具：建节点、连线、删除、分组。
3. `StageCommand` 骨架。
4. 生成提案 `propose/submit`。
