# MEDIA-STYLE-UNIFY-1 · 视频控制条透明化与视频操作节点播放器统一

日期：2026-11-08

## 问题

1. 视频节点底部控制栏有整条黑色胶囊背景，视觉过重。
2. 智能续写 / 片段重拍 / 元素替换节点使用原生 `<video controls>`，与视频节点自定义播放器样式不一致。
3. 上述三个节点的开始/结束/新增时长滑块拖动时，会连同节点卡片一起被拖动。

## 改动

- `src/renderer/src/styles/global.css`
  - `.video-node__controls` 去掉背景、边框、`backdrop-filter` 和整条内边距，改为透明容器。
  - `.video-node__btn` 改为 26px 圆形独立半透明按钮（`--media-control-bg` 62% 混合），hover 加深；时间与帧号加文字阴影。
  - 删除 `.video-node__shade` 底部渐变压暗层。
  - `.video-op-node__preview` 改为 16:9 圆角容器，承载统一播放器。
- `src/renderer/src/canvas/nodes/VideoPlayer.tsx`
  - 新增可选 `onDurationChange` 回调；移除 `.video-node__shade` 节点。
- `src/renderer/src/canvas/nodes/VideoOpNodeView.tsx`
  - 原生 `<video controls>` 替换为 `<VideoPlayer>`，三个视频操作节点共用同一播放器样式。
  - `.video-op-node__form` 增加 `nodrag nopan`，滑块拖动不再触发 React Flow 节点拖动。
  - 通过 `onDurationChange` 兜底回填视频时长与结束时间。

## 验证

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：19 个测试文件、102 个用例全部通过。
- 隔离实例（`dev:isolated`，CDP 9222）+ 临时项目（复制 `CapabilityTest.cinelab` 后扩展为视频节点 + 三个视频操作节点）：
  - DOM 检查：3 个视频操作节点内 `.video-node` 播放器数量 = 3，`video[controls]` 数量 = 0。
  - 计算样式：`.video-node__controls` 背景 `rgba(0, 0, 0, 0)`、边框 0px、无阴影；按钮 `border-radius: 50%`、半透明深色底。
  - 滑块拖动实测：在「智能续写 → 新增时长」滑块上按下并向左拖动，值由 5 变为 4，节点屏幕位置保持不变（`video-style-4.png` 与 `video-style-3.png` 节点位置一致）。
- 截图：
  - `MEDIA-STYLE-UNIFY-1-overview.png`：视频节点 + 片段重拍 / 智能续写 / 元素替换三节点统一预览。
  - `MEDIA-STYLE-UNIFY-1-video.png`：视频节点控制条细节（透明、仅独立按钮 + 浮动进度条）。
  - `MEDIA-STYLE-UNIFY-1-extend.png`：智能续写节点预览与滑块。

## 注意

- 双击视频节点的全屏预览（`image-preview` portal）仍使用浏览器原生 controls，未纳入本次统一，避免改变全屏查看器布局。
- `--media-control-border` 目前仍在 `.video-node__center` 中使用，未删除变量。
