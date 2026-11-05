# 分镜组（镜头组）实现与验证

日期：2026-11-05
代码状态：已实现，未提交

## 功能范围

- 仅图片节点可打为分镜组，数量 2–25
- 多选工具栏「打组」变下拉：打组 / 合并分镜组
- 分镜组工具栏：比例、宫格、拼接(2K)、序号、清空、转普通组、解组
- 子节点左下角显示 01–25 序号，可切换显示
- 分镜组使用虚线组框

## 技术实现

| 层 | 内容 |
|---|---|
| `shared/canvas-schema.ts` | `GroupMode`、`GroupRatio`、`GROUP_RATIO_VALUE`、`STORYBOARD_MAX_NODES`、`STORYBOARD_CELL_WIDTH`；`GroupNodeData` 增加 `mode/ratio/gridCols/gridRows/showIndex` |
| `shared/project-schema.ts` | group 节点 schema 增加上述可选字段，旧画布兼容 |
| `stores/canvas.ts` | `createStoryboard`、`arrangeStoryboard`、`setGroupMode`、`setStoryboardGrid`、`setStoryboardRatio`、`toggleStoryboardIndex`、`clearGroupChildren` |
| `canvas/StoryboardToolbar.tsx` | 分镜组工具栏，定位与普通组工具栏一致（居中、14px 间距） |
| `canvas/MultiSelectBar.tsx` | 图片多选时打组下拉 |
| `canvas/nodes/GroupNodeView.tsx` | `group-node--storyboard` 虚线样式 |
| `canvas/nodes/CineNodeView.tsx` | 读取父组计算序号并渲染 `.cnode__index` |
| `shared/media.ts` / `main/media/stitch.ts` / `main/ipc/media.ts` / preload | 新增 `media:stitch`：按宫格与比例用 ffmpeg xstack 拼接，输出 2K PNG |

## 自动化验证（隔离实例 9222）

| 项 | 结果 |
|---|---|
| 两张图片节点创建分镜组 | 通过（mode=storyboard，2×1，16:9） |
| 单元格尺寸 | 480×298（内容 480×270 + 标题 28） |
| 组框尺寸 | 1032×358，符合 padding/gap |
| 序号 | 显示 01、02 |
| 工具栏按钮 | 16:9 / 宫格 2×1 / 拼接(2K) / 序号 / 清空 / 转普通组 / 解组 |
| 拼接 | 生成 2048×1152 PNG，落盘 `assets/img/*.png`，并创建「分镜拼接 1」节点 |
| 转普通组 | mode 变为 normal，工具栏切换为普通组工具栏 |
| 清空 | 确认弹窗「删除组内全部 2 个节点」，确认后子节点清空、组保留 |
| 解组 | 组删除，子节点保留 |

## 已知限制

- 拼接只处理项目内相对路径的图片输出，全局资产库路径未接入
- 拼接按组内节点数组顺序取图，暂不支持拖拽调整顺序
- 「序号」目前只切换显示，未实现手动重排
- 宫格选项固定 8 种，暂不支持自定义行列
- 分镜组暂不支持嵌套组
