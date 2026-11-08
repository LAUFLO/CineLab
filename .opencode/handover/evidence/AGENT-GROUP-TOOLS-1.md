# AGENT-GROUP-TOOLS-1 · 分组 / 解散分组

日期：2026-11-08
状态：完成
范围：`canvas_group`、`canvas_ungroup`
关联：`AGENT-CANVAS-TOOLS-1`、`CanvasCommand`

## 1. 目标

让 Agent 能把多个顶层节点打组，或解散一个分组。

## 2. 实现

### 2.1 新增工具

| 工具 | 权限 | 说明 |
|---|---|---|
| `canvas_group` | 写 | 把 2-20 个选中或本轮新建的顶层非分组节点打组 |
| `canvas_ungroup` | 写 | 解散选中或本轮新建的分组，子节点恢复为顶层 |

### 2.2 复用现有分组逻辑

- `groupSelection(turnId?)`：原有布局、组框尺寸、子节点相对坐标逻辑不变；传入 `turnId` 时加入回合历史，不重复 `pushHistory`。
- `ungroup(groupId, turnId?)`：同样支持回合历史。
- 现有 UI 调用不传 `turnId`，行为不变。

### 2.3 权限与 scope

- 打组要求 2-20 个节点，全部在 `selectedNodeIds` 中。
- 只允许顶层非分组节点打组。
- 解散要求分组本身在 `selectedNodeIds` 中。
- 打组产生的组节点会通过 `createdNodeIds` 加入本轮 scope，同一轮可以继续改名或解散。

### 2.4 选中节点摘要

`canvas_get` 的 `selectedNodes` 不再只过滤 `cine` 节点，分组节点也会返回：

```json
{ "id": "group_...", "title": "分组 1", "kind": "group" }
```

否则模型看不到已选中的分组，无法调用 `canvas_ungroup`。

## 3. 验证

### 3.1 单元测试

`src/main/agent/__tests__/tools.test.ts` 新增：

- 打组至少需要两个节点
- 节点 ID 不能重复
- 两端都必须在 scope
- 解散要求分组在 scope

结果：

```text
27 test files, 159 tests passed
```

### 3.2 端到端

打组：

```text
创建两个文本节点 A 和 B，放在 600,300 和 900,300，然后把它们分成一组
→ canvas_add_node ×2
→ canvas_group（group_mw7ykwe3_1）
→ 画布 4 节点、1 分组
```

解散：

```text
解散当前选中的分组
→ canvas_get（selectedNodes 包含 group_mw7ykwe3_1）
→ canvas_ungroup
→ 画布 3 节点、0 分组，A/B 恢复为顶层
```

一轮打组撤销：

```text
创建 C/D 并分组 → 画布 6 节点、1 分组
→ 一次撤销
→ 画布 3 节点、0 分组
```

### 3.3 构建

- `typecheck` 通过
- `test` 通过
- `build` 通过，主进程约 412KB

## 4. 已知限制

- 只支持顶层非分组节点打组，不支持嵌套分组。
- 不支持合并多个分组（`mergeSelection` 未接入）。
- 不支持重命名分组、改颜色、宫格排列。
- 解散后子节点不自动选中。
- 分组/解散依赖选中或本轮创建，跨轮需要用户先选中。

## 5. 下一步

1. `StageCommand` 骨架。
2. 生成提案 `propose/submit`。
3. 删除/批量操作二次确认。
4. 剪辑助手 `clip` profile 重新实现。
