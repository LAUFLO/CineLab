# CLIP-STUDIO P1：剪辑室静态布局壳

日期：2026-11-07
状态：静态壳完成，交互未接线
验证：`corepack pnpm typecheck`、`corepack pnpm test`（54 用例）、`corepack pnpm build` 通过；CDP 截图确认

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/src/stores/studio.ts` | 打开/关闭、左右面板折叠、时间线比例、素材 tab |
| `src/renderer/src/studio/StudioWindow.tsx` | 浮窗容器、grid 布局、快捷键、Esc 关闭 |
| `src/renderer/src/studio/StudioTopBar.tsx` | 返回、名称、保存状态、时长、分辨率、面板切换、生成成片、关闭 |
| `src/renderer/src/studio/MaterialPool.tsx` | 三个 tab、示例素材卡、上传入口 |
| `src/renderer/src/studio/PreviewPane.tsx` | 16:9 预览占位、播放控制 |
| `src/renderer/src/studio/InspectorPane.tsx` | 基础 / 画面 / 声音 / 文字四组属性 |
| `src/renderer/src/studio/TimelinePane.tsx` | 工具栏、标尺、四条轨道、播放头、主轨标识 |
| `src/renderer/src/styles/studio.css` | 剪辑室全部样式，只使用主题变量 |
| `src/renderer/src/App.tsx`、`main.tsx` | 挂载剪辑室与样式 |

## 视觉验证

- 浮窗顶部留 48px 避开窗口拖拽区，左右下各 20px。
- 面板为浮块 + 6px 缝隙，圆角 10px，底板使用 `--canvas-bg`。
- 顶部栏、素材池、预览、检查器、时间线五个区域完整显示。
- 时间线：字幕在上、V2 在 V1 上、A1 在最下；V1 左侧主题色竖线与「主轨」标签。
- 折叠左右面板后预览区扩展，时间线位置不跳。
- 预览 16:9 占位使用容器查询单位，窄窗口和折叠状态都不溢出。

## 入口

- `Ctrl+Shift+E` 打开剪辑室。
- `Esc` 关闭。
- 后续替换为画布右键菜单、节点工具栏按钮和分镜组工具栏。

## 已知限制

- 全部为静态假数据，未接时间线文档。
- 除面板切换和关闭外，其余按钮禁用。
- 素材拖拽、时间线拖拽、裁剪、切割、吸附、缩放、播放头均未接线。
- 快捷键作用域隔离未做，剪辑室打开时画布快捷键仍可能响应。
- 节点工具栏瘦身未做。

## 下一步

P1 交互：把 `useTimelineStore` 接到 `timeline-commands`，实现素材拖入、片段拖拽/裁剪/切割、吸附、缩放、播放头，再做快捷键作用域与节点工具栏瘦身。
