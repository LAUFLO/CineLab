# DEPTH-CAPTURE P2 · 本地任务队列

日期：2026-11-06
方案：`docs/depth-capture-plan.md`

## 已完成

### 新增文件

| 文件 | 职责 |
|---|---|
| `src/main/media/depth-tasks.ts` | 任务注册、进度广播、取消、批量取消、任务列表 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `src/shared/media.ts` | 新增 `DepthTaskStatus`、`DepthTaskEvent`、`DepthTaskStartResult` |
| `src/shared/ipc-contract.ts` | `MediaApi` 新增 `startDepthCapture` / `cancelDepthCapture` / `onDepthCaptureEvent` |
| `src/main/ipc/media.ts` | 新增 `media:depth-capture-start` / `media:depth-capture-cancel` |
| `src/preload/index.ts` | 暴露任务启动、取消、事件订阅 |

### 行为

- `startDepthTask` 立即返回 `taskId`，后台执行，不阻塞 IPC
- 进度通过 `depth-task:event` 广播到所有窗口
- 事件包含 `taskId`、`status`、`percent`、`message`、`result`、`error`
- 取消通过 `AbortController` → `captureDepth` → `killTree`
- 任务完成后 60 秒从内存移除
- 保留同步 `captureDepth` 作为内部/测试入口

## 验证

- `corepack pnpm typecheck` 通过

## 未验证

- 真实任务端到端（等待组件环境）
- 取消是否彻底杀死 Python + ffmpeg 进程树
- 渲染进程订阅事件

## 下一步

- P3：参数面板、节点集成、组件状态 UI
- P4：组件构建、端到端验证、打包
