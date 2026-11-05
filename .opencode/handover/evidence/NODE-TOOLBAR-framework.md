# NODE-TOOLBAR-P0 工具栏框架验证记录

- 日期：2026-11-05
- 范围：仅渲染进程工具栏框架，未接入 ffmpeg 与媒体处理
- 状态：框架完成，P0 本地工具待接入

## 改动

新增：

- `src/renderer/src/canvas/nodes/node-operations.ts`
- `src/renderer/src/canvas/nodes/NodeToolbar.tsx`
- `src/renderer/src/canvas/nodes/ToolbarSettings.tsx`
- `src/renderer/src/stores/toolbar.ts`

修改：

- `src/renderer/src/canvas/nodes/CineNodeView.tsx`（替换内联工具栏）
- `src/renderer/src/components/Icon.tsx`（新增 7 个图标）
- `src/renderer/src/styles/global.css`（工具栏居中、菜单、配置浮窗）
- `src/renderer/src/App.tsx`（挂载 ToolbarSettings）
- `docs/node-toolbar-plan.md`（持久化口径与框架说明）

## 验证

1. `corepack pnpm typecheck`：通过（TS 5.9 回退，EXIT=0）。
2. 图片节点工具栏渲染：宫格切分 / 裁剪 / 更多 / 下载 / 展开。
3. 宫格切分菜单：4 / 9 / 16 / 25 宫格 / 自定义；点击后 toast「《9 宫格（3×3）》正在接入」。
4. 更多菜单：生成 / 编辑分组、P1 占位、扩图/重绘/擦除禁用态 tooltip 正确。
5. 禁用态点击：toast「蒙版编辑器未开放，暂不能重绘」。
6. 自定义工具栏：固定九宫格 → 已固定 3/6 → 工具栏出现九宫格；localStorage 写入。
7. 刷新页面：偏好保持。
8. 恢复默认：回到 2/6，localStorage 为 `{}`，工具栏恢复默认。
9. 视频操作注册表：片段截取 / 分离音视频 / 抽帧拉片 / 画面裁切 + 更多项；无音轨禁用文案正确。

## 未覆盖

- 视频节点工具栏真实渲染：当前项目视频节点无输出，未截图；渲染逻辑与图片共用。
- 自定义工具栏浮窗截图：CDP `Page.captureScreenshot` 偶发超时，已用 DOM 断言验证。
- ffmpeg / 媒体处理：按计划未接。

## 下一步

1. 接 `ffmpeg-static` + `ffprobe-static`，补资产元数据（duration / fps / hasAudio）。
2. 实现宫格切分与抽帧拉片，打通「操作 → 主进程 → 新节点」链路。
3. 再补裁剪、片段截取、分离音视频、画面裁切。
