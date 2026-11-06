# DEPTH-CAPTURE P3 · 参数面板与节点集成

日期：2026-11-06
方案：`docs/depth-capture-plan.md`

## 已完成

### 新增文件

| 文件 | 职责 |
|---|---|
| `src/renderer/src/canvas/nodes/DepthCaptureDialog.tsx` | 档位、帧率、预计耗时、组件状态检查 |
| `src/renderer/src/panels/ComponentsSection.tsx` | 设置面板的深度组件管理 |
| `src/renderer/src/stores/depth-tasks.ts` | 全局任务事件订阅、完成后自动建节点 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `src/renderer/src/canvas/nodes/node-operations.ts` | `motion-capture` 标记 `implemented: true` |
| `src/renderer/src/canvas/nodes/NodeToolbar.tsx` | 深度对话框状态、发起任务、激活分发、渲染 |
| `src/renderer/src/panels/SettingsPanel.tsx` | 新增「深度组件」导航与区块 |
| `src/renderer/src/App.tsx` | 启动时订阅 `depth-task:event` |
| `src/renderer/src/styles/global.css` | 组件卡片与进度条样式 |

## 交互

- 设置 → 深度组件：显示两个组件的状态、版本、体积、进度；支持下载 / 暂停 / 继续 / 删除
- 视频节点 → 更多 → 深度动作捕捉
- 对话框：源时长、档位、帧率、预计耗时；组件未安装时禁用「开始提取」
- 确认后调用 `media:depth-capture-start`，关闭对话框，后台执行
- 完成后 `depth-task:event` 触发，自动创建视频节点并连线到源节点

## 验证

- `corepack pnpm typecheck` 通过
- CDP 实测（dev:isolated，9222）：
  - 设置导航出现「深度组件」
  - 组件区块显示「深度运行时 / VDA Small 模型 · 未安装 · 下载」
  - 视频节点「更多」菜单出现「深度动作捕捉」
  - 对话框显示源时长 3.0 秒、三档位、两种帧率、预计耗时
  - 组件未安装时「开始提取」为 disabled，取消可用
  - 对话框可正常关闭

## 未验证

- 真实组件下载（需要 P4 构建组件包）
- 任务完成后自动建节点的完整 IPC 链路
- 取消任务
- 中文路径下的真实 worker 调用
