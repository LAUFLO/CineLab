# STUDIO-POLISH-1 · 剪辑室五项体验修复

日期：2026-11-08

## 问题与修复

### 1. 画布多选工具栏出现在剪辑室上层

- 原因：`.multi-bar` 的 `z-index: 90` 高于 `.studio-overlay` 的 `85`，多选状态下打开剪辑室仍渲染在浮层之上。
- 修复：`src/renderer/src/canvas/MultiSelectBar.tsx` 读取 `useStudioStore(state.open)`，剪辑室打开时直接返回 `null`。

### 2. 剪辑室预览空状态文字贴边、竖排

- 原因：`.studio-preview__slot` 与 `PreviewStage` 的 canvas 同为 flex 子项，canvas 占宽后在 594px 容器里把 slot 压缩到约 58px，导致中文逐字换行并贴右。
- 修复：`src/renderer/src/styles/studio.css` 将 slot 改为绝对定位 `top/left: 50%` + `translate: -50% -50%`，不再参与 flex 挤压；`pointer-events: none` 避免挡住后续拖入。

### 3. 节点工具栏菜单被提示词输入框覆盖

- 原因：`.react-flow` 内联 `z-index: 0` 形成层叠上下文，菜单虽 `z-index: 80` 但整体低于 `.promptbar` 的 `50`。
- 修复：
  - `src/renderer/src/canvas/nodes/NodeToolbar.tsx` 在任意菜单打开时给 `document.body` 加 `is-node-menu-open`，关闭时移除。
  - `src/renderer/src/styles/global.css` 在菜单打开期间把 `.react-flow` 提升到 `z-index: 60 !important`，使节点与菜单优先于提示词栏。
- 实测：菜单打开时 `react-flow z-index=60`、body 类存在；点击外部关闭后恢复 `0` 且类移除。

### 4. 白色主题进入剪辑室后右上角按钮不清晰

- 原因：窗口控制图标与剪辑室顶栏右侧图标使用 `--text-2`，在浅色主题 + 剪辑室 55% 黑色遮罩的灰底上对比度不足。
- 修复：`src/renderer/src/styles/global.css` 将 `.window-controls .icon-btn` 统一为 `--text-1`；`src/renderer/src/styles/studio.css` 将 `.studio-top__right .studio-icon-btn` 改为 `--text-1`，并补 `.studio-top__hint` 为 `--text-2`。

### 5. 剪辑室节点内容未居中

- 修复：`src/renderer/src/styles/global.css` 的 `.studio-node__body` 增加 `align-items: center` 与 `text-align: center`，`.studio-node__open` 改为 `align-self: center`。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：19 个文件、102 个用例全部通过。
- `corepack pnpm build` 通过。
- 隔离实例 CDP 实测：
  - 多选两个节点时 `.multi-bar` 存在；打开剪辑室后 `.multi-bar` 消失、选中状态保留。
  - 剪辑室空状态文字居中显示（浅色主题截图）。
  - 菜单打开时与提示词栏重叠区域 `elementsFromPoint` 首位为菜单项；关闭后层级恢复。
  - 剪辑室节点「0 个片段 · 00:00」与「进入剪辑室」按钮水平居中。
- 截图：
  - `STUDIO-POLISH-1-multibar-before.png`：打开剪辑室前多选栏显示。
  - `STUDIO-POLISH-1-studio-light.png`：打开剪辑室后多选栏消失、空状态居中、浅色主题按钮清晰。
  - `STUDIO-POLISH-1-menu-priority.png`：更多菜单完整显示在提示词栏上方。
  - `STUDIO-POLISH-1-node-centered.png`：剪辑室节点内容居中。

## 注意

- 菜单打开期间整个 React Flow 图层临时高于提示词栏，关闭后立即恢复；这是为了保证下拉菜单不被截断。
- 未改动剪辑室时间线、渲染、导出等由其他会话维护的逻辑。
