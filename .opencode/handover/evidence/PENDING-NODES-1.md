# 派生操作占位节点与手柄间距

日期：2026-11-07

## 1. 派生操作先建「生成中」节点

### 变更

`src/renderer/src/stores/canvas.ts` 新增：

```ts
addPendingNodes(kind, origin, count, titlePrefix, sourceNodeId?, layout?): string[]
```

- 创建 `status: 'running'` 的占位节点
- 支持单/多结果、宫格布局（columns/cellWidth）、可选分组
- 自动建立 source → 新节点连线（`type: 'flow'`, `role: 'auto'`）
- 完成后 `applyOutput(nodeId, asset, op)` 写回
- 失败 `patchNodeData(nodeId, { status: 'error', error })`，节点标红保留

### 覆盖范围

| 操作 | 行为 |
|---|---|
| 深度动作捕捉 | 提交后立即建视频占位节点，`depth-tasks.ts` 完成后 applyOutput |
| 抽帧（首/尾/当前） | 立即建图片占位节点 |
| 宫格切分 | 按 rows×cols 建占位节点并建宫格组 |
| 分离音视频 | 建视频+音频占位节点并建音视频组 |
| 分镜拼接 | 立即建图片占位节点 |
| 片段截取 / 裁剪 / 画面裁切 / 去字幕 | 当前节点标记 running，完成后写回，失败标红 |

提交：`9c35245 feat: unify dropdowns and show pending derived nodes`

## 2. 节点加号与边线间距

`src/renderer/src/styles/global.css`：

- 视觉圆 `::before` 从 `-20px` 外移到 `-26px`（距节点边线 6px）
- 加号图标同步外移到 `-22px`，保持圆心居中
- 连线锚点仍在节点边界，不受影响

提交：`9c35245`

## 验证

- `corepack pnpm typecheck` / `corepack pnpm build` 通过
- 独立实例截图确认加号间距与占位节点结构
- 打包态尚未逐项验证（K20）
