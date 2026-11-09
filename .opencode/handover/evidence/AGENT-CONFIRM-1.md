# AGENT-CONFIRM-1 · 删除 / 批量操作二次确认

日期：2026-11-09
状态：完成
范围：Agent 工具确认、确认事件、渲染确认卡、删除与批量阈值
关联：`docs/agent-architecture-plan.md` 4.4、`AGENT-CANVAS-TOOLS-1`、`CLIP-PROFILE-1`

## 1. 目标

高风险 Agent 工具必须先得到用户确认，确认前不执行、不产生副作用。

覆盖：

- 删除画布节点
- 删除时间线片段
- 删除导演台对象
- 一次修改超过 10 个时间线片段的批量操作

## 2. 工具标记

`AgentToolDefinition.requiresConfirm` 启用：

- `canvas_delete_node`
- `timeline_remove_clips`
- `stage_remove_object`

动态判断 `toolConfirmationReason(call)`：

| 工具 | 确认条件 |
|---|---|
| 删除类 | 总是确认 |
| `timeline_move_clips` | `clipIds.length > 10` |
| `timeline_split_clips` | `clipIds.length > 10` |

返回文案包含影响范围，例如「将删除 2 个时间线片段，成片时长会改变。」

## 3. 运行时

`src/main/agent/runtime.ts`：

- `ActiveTurn.confirmations` 保存待确认调用。
- 工具执行前：
  1. 权限校验
  2. `toolConfirmationReason`
  3. 需要确认时发送 `confirm_request` 事件并等待
  4. 批准后执行；拒绝返回工具错误「用户取消了该操作」
- 60 秒超时自动拒绝。
- 取消回合会让待确认调用失败并清理。
- 新增 `agent:confirm` IPC，接收 `turnId / callId / approved`。

## 4. 渲染层

- `AgentEvent` 新增 `confirm_request`。
- `agentStore`：
  - `pendingConfirm` / `confirming`
  - `confirmTool(approved)` 调用 IPC
  - `tool_end`、`turn_end` 自动清理确认卡
- `AgentPanel` 新增确认卡：
  - 工具名
  - 影响说明
  - 参数摘要
  - 「允许一次」/「取消」
- 确认卡样式使用 warning 边框，位于提案卡之前。

## 5. 验证

### 5.1 自动化

```text
34 test files, 243 tests passed
typecheck 通过
build 通过
```

新增测试：

- 删除节点、删除片段、删除导演台对象均要求确认。
- 2 个片段移动不确认；11 个片段移动要求确认。
- 只读工具不确认。

### 5.2 真实 Agent

```text
选中节点 A → 发送「删除选中的节点 A」
→ 模型调用 canvas_get
→ 模型调用 canvas_delete_node
→ 面板出现确认卡：
   需要确认 / canvas_delete_node
   将删除画布节点及其所有连线。
   { "nodeId": "node-text-4496a6db" }
   [允许一次] [取消]

点击「取消」
→ 工具显示「失败 用户取消了该操作」
→ 节点 A 仍在画布

再次请求并点击「允许一次」
→ 节点 A 被删除
→ 工具显示「完成」
→ 面板出现「本轮修改了 1 处」
→ 点击撤销，节点 A 恢复
```

截图：`.opencode/handover/evidence/AGENT-CONFIRM-1.png`

> Agnes 文本模型测试期间仍偶发 503，确认请求的取消与批准路径均已实际验证。

## 6. 已知限制

- 确认超时固定 60 秒，暂不可配置。
- 批量阈值固定 10，暂不可配置。
- 技能删除目前走设置页的两步确认，不属于 Agent 工具确认。
- 生成提交仍由提案卡确认，不走本确认通道。

## 7. 下一步

1. 剪辑高级工具：自动字幕、删静音、转场、导出。
2. 整体验收。
3. 推送前同步 origin/main。
