# 节点操作桥与能力注册表方案

日期：2026-11-10
状态：历史（2026-11-13 归档）
分支：`feat/node-operation-bridge`
适用版本：`main` @ `b76a064`
关联：`docs/agent-capability-plan.md`、`docs/agent-capabilities.md`

## 1. 目标

让 CineBot 能发现并执行节点工具栏操作，同时保持 UI 和 Agent 共用同一个执行器。

核心原则：

- `NodeToolbar` 和 Agent 都调用 `node-operation-runner.ts`。
- 操作定义仍然只在 `node-operations.ts` 维护。
- 需要模型或蒙版交互的操作显式标记 `agentExecutable: false`，Agent 统一走 `generation_propose`。
- 所有写操作进入同一回合的画布撤销记录。

## 2. 目录与模块

```text
src/shared/node-operation-specs.ts          # Agent 可执行性、item、参数定义与校验
src/renderer/src/canvas/nodes/node-operation-runner.ts
                                            # 统一执行器：UI + Agent
src/renderer/src/canvas/nodes/NodeToolbar.tsx
                                            # 只负责菜单和 dialog 宿主
src/main/agent/capabilities/types.ts        # 能力投影类型
src/main/agent/capabilities/registry.ts     # 能力注册表投影
```

工具定义仍保留在 `src/main/agent/tools.ts`，`capabilities/registry.ts` 只做只读投影，避免一次性大改导致执行链断裂。

## 3. 两种执行模式

```ts
executeNodeOperation(
  { nodeId, operationId, itemId?, params?, turnId? },
  uiHost?  // UI 传入；Agent 不传
)
```

- **UI 模式**：传入 `uiHost`，执行器通过 `effect` 打开 dialog、显示 toast、设置 running。
- **Agent 模式**：不传 `uiHost`，只执行可无人值守的操作；需要 dialog 时返回 `needsUi`，需要模型时返回 `needsGeneration`。

## 4. 操作支持矩阵

### Agent 可直接执行（17）

| 操作 | itemId | 参数 | 确认 |
|---|---|---|---|
| `grid-split` | 2x2 / 3x3 / 4x4 / 5x5 | 无 | 否 |
| `crop` | 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / free | free 需要 rect | 否 |
| `motion-capture` | 无 | quality / fps | 是 |
| `clip-trim` | 无 | start / end（秒） | 否 |
| `split-av` | 无 | 无 | 否 |
| `frame-study` | first / last / current | current 可传 time | 否 |
| `film-study` | 无 | interval | 是 |
| `video-crop` | 16:9 / 9:16 / 1:1 / source | 无 | 否 |
| `subtitle` | smart / box | box 需要 rect | 是 |
| `layer-split` | 无 | 无 | 是 |
| `matting` | 无 | 无 | 是 |
| `object-remove` | 无 | rect | 是 |
| `outpaint` | 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9 | 无 | 是 |
| `cutout` | 无 | 无 | 是 |
| `shot-retake` | 无 | 无 | 否 |
| `element-replace` | 无 | 无 | 否 |
| `extend` | 无 | 无 | 否 |

### 需要模型或蒙版交互（11）

`grid-generate`、`character-sheet`、`time-shift`、`multi-angle`、`panorama`、`color-grade`、`relight`、`portrait`、`inpaint`、`erase`、`element-edit`。

这些操作在 `canvas_node_operations` 中仍会返回提示词和菜单项，但 `agentExecutable=false`。Agent 应使用 `generation_propose`，把提示词写给目标节点；蒙版操作保留给 UI。

## 5. Agent 工具

### `canvas_node_operations`

只读，返回：

- 节点摘要：`id / title / kind / outputKind / hasAudio`
- 操作列表：`id / label / section / implemented / agentExecutable / requiresConfirm / menu / params / prompt / reason`

### `canvas_node_operation`

写操作，参数：

```json
{
  "nodeId": "node-a",
  "operationId": "grid-split",
  "itemId": "3x3",
  "params": {}
}
```

参数校验在主进程和渲染执行器各做一次。主进程负责 ID、scope、操作是否存在、静态参数；渲染进程负责节点类型、操作禁用条件、文件与组件状态。

### `capability_catalog`

只读，返回当前空间、可用工具、选中节点操作、时间线摘要、导演台镜头、拉片摘要。

## 6. 回合撤销

- Agent 执行节点操作时传入 `turnId`。
- 执行前 `beginToolTurn` 压一条画布历史，期间的 `addPendingNodes`、`applyOutput`、`addVideoOpNode`、`createGroupFromNodes` 都合并进同一条。
- 执行后按节点/连线 diff 生成 `AgentTurnChange`，面板显示“撤销这一轮”。
- UI 不传 `turnId`，保持原有的逐操作撤销行为。

## 7. UI 集成

`NodeToolbar.activate` 只负责：

1. 检查禁用条件。
2. 关闭菜单。
3. 调用 `executeNodeOperation`，传入 dialog/toast/running host。
4. 处理 dialog 的确认回调（裁剪、截取、去字幕、深度、AI 生成仍由组件状态管理）。

这样新增一个节点操作时：

1. 在 `node-operations.ts` 增加定义。
2. 在 `node-operation-specs.ts` 声明 Agent 可执行性和参数。
3. 在 `node-operation-runner.ts` 增加执行分支。

Agent 自动获得发现和执行能力，不需要新增工具。

## 8. 验证

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- 隔离实例验证：
  - `canvas_node_operations` 返回节点操作和参数。
  - `canvas_node_operation` 执行宫格切分、抽帧、裁剪等。
  - 同一轮多个操作只产生一条撤销。
- 单元测试：
  - `src/shared/__tests__/node-operation-specs.test.ts`
  - `src/main/agent/__tests__/capabilities.test.ts`
  - `src/main/agent/__tests__/tools.test.ts` 新增工具校验与确认用例
