# AGENT-CANVAS-TOOLS-1 · 创建 / 连接 / 删除节点

日期：2026-11-08
状态：完成
范围：`canvas_add_node`、`canvas_connect`、`canvas_delete_node`
关联：`AGENT-TOOLS-1`、`docs/agent-architecture-plan.md`

## 1. 目标

在已有 `CanvasCommand` 层上开放更多画布工具，让 Agent 能：

- 创建文本/图片/视频/音频节点
- 连接两个节点
- 删除节点及其连线
- 同一轮新建的节点可以被继续连接或删除

## 2. 实现

### 2.1 新增工具

| 工具 | 权限 | 说明 |
|---|---|---|
| `canvas_add_node` | 写 | 创建文本/图片/视频/音频节点，指定标题和坐标 |
| `canvas_connect` | 写 | 连接两个选中或本轮新建的节点 |
| `canvas_delete_node` | 写 | 删除选中或本轮新建的节点及其连线 |

`canvas_add_node` 使用 `NODE_META` 的默认宽度、模板和标题；返回 `nodeId`。

### 2.2 权限与 scope

- 创建节点不需要预先选中。
- 改名、移动、连接、删除只允许操作 `scope.selectedNodeIds` 中的节点。
- 工具结果返回 `createdNodeIds` 后，runtime 把新节点加入本轮 scope，因此同一轮可以继续连接或删除。
- 只读模式下写工具不暴露，即使调用也会被拒绝。

### 2.3 渲染进程执行

`canvasBridge` 使用 `CanvasCommand`：

- `addNode`
- `connect`
- `removeNode`（级联删除连线）

仍然通过 `applyCommands(commands, call.turnId)`，同一轮只 `pushHistory()` 一次。

## 3. 验证

### 3.1 单元测试

- `src/main/agent/__tests__/tools.test.ts`
  - 只读拒绝写工具
  - 创建节点不需要选中
  - 连接要求两端都在 scope
  - 删除要求节点在 scope
- 既有 `canvas-commands.test.ts` 覆盖 add/connect/remove。

结果：

```text
27 test files, 157 tests passed
```

### 3.2 端到端

真实 Agnes 3.0 Flash：

```text
用户：创建一个标题为 开场镜头 的文本节点，放在 600, 300，
      然后把它连接到当前选中的节点
→ canvas_get
→ canvas_add_node（node-text-8aac55f8，开场镜头，600,300）
→ canvas_connect（node-spike-1 → node-text-8aac55f8）
→ 画布 2 节点、1 连线
→ 一次撤销
→ 恢复 1 节点、0 连线
```

删除：

```text
用户：创建一个标题为 临时节点 的文本节点放在 700, 400，然后删除它
→ canvas_add_node
→ canvas_delete_node（deletedEdgeIds: []）
→ 画布保持 1 节点
```

### 3.3 构建

- `corepack pnpm typecheck` 通过
- `corepack pnpm test` 通过
- `corepack pnpm build` 通过
- 主进程产物约 410KB

## 4. 已知限制

- 暂未开放 `canvas_remove_edge`。
- 暂未开放分组/解组工具。
- 新建图片/视频/音频节点只有空壳，不自动配置模型、提示词或生成参数。
- 连接使用默认 `flow` 边，不指定具体 handle。
- 删除是高风险操作，目前依赖回合撤销；后续可加二次确认。

## 5. 下一步

1. `canvas_group` / `canvas_ungroup`。
2. `StageCommand` 骨架。
3. 生成提案 `propose/submit`。
4. 删除/批量操作二次确认。
