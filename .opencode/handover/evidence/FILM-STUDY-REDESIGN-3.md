# FILM-STUDY-REDESIGN-3 · 拉片连线、工具栏菜单、节点布局与切片尺寸

日期：2026-11-08

## 问题与修复

### 1. 拉片节点与源视频、结果节点没有连线

根因：`CineNodeView` 在 `data.kind !== 'study'` 时才渲染左右 Handle，拉片节点完全没有 Handle。React Flow 找不到 source/target handle，边虽然存在于数据中但不会绘制（控制台大量 `Couldn't create edge ... handle id "null"`）。

修复：`CineNodeView.tsx` 移除该条件，所有 cine 节点（含 study）都渲染 left target / right source Handle。

验证：测试项目中 3 个拉片节点各有 2 个 Handle；canvas 中 16 条边（其中 13 条与拉片相关）全部渲染。

### 2. 工具栏「逐帧拉片」去掉精度下拉

拉片节点本身已有「分镜精度」，工具栏无需再选。

- `node-operations.ts` 删除 `STUDY_MENU`，`film-study` 移除 `menu`。
- `NodeToolbar.tsx` 点击「逐帧拉片」直接 `startFilmStudy(0)`（自动分镜），精度进入节点后再调。

### 3. 拉片节点内容布局

- `NODE_META.study` 高度 340 → 280。
- `.study-node-card` 间距 7 → 6，padding 收紧。
- 操作按钮不再 `margin-top: auto` 贴底，改为紧跟输出开关。
- `loadCanvas` 增加旧拉片节点迁移：默认高度 368（340+28）→ 308（280+28），避免旧项目保留大块空白。

### 4. 切片视频节点尺寸溢出

- 动态切片输出从 4 列 × 240 改为 3 列 × 320，控制条更宽松。
- `.video-node` 增加 `min-width: 0`，避免控制条内容把播放器撑出节点。
- `.video-node` 使用 `container-type: inline-size`，控制条按节点宽度自适应：
  - ≤ 360px：隐藏帧号，按钮 22px，时间 10px，间距 3px。
  - ≤ 250px：隐藏时间，仅保留按钮。
- 旧项目 240px 切片节点也自动适配，不再溢出卡片。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：24 个文件、145 个用例全部通过。
- `corepack pnpm build` 通过。
- 隔离实例 CDP：
  - 3 个拉片节点均渲染 2 个 Handle，16 条边全部显示。
  - 拉片节点高度从 368 迁移到 308，按钮紧跟内容。
  - 240px 切片节点控制条 `scrollWidth ≈ clientWidth`，不再溢出；时间和帧号自动隐藏。

## 截图

- `FILM-STUDY-REDESIGN-3-links.png`：拉片连线与切片控制条。
- `FILM-STUDY-REDESIGN-3-layout.png`：收紧后的拉片节点布局。
