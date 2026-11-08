# CLIP-STUDIO P1：快捷键作用域、检查器联动、工具栏瘦身

日期：2026-11-07
状态：完成
验证：typecheck、57 个测试、build 通过；CDP 截图确认检查器联动

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/src/studio/scope.ts` | `studioOpen()`：判断剪辑室是否打开 |
| `src/renderer/src/canvas/Canvas.tsx` | 两个键盘监听加作用域判断 |
| `src/renderer/src/canvas/TopBar.tsx` | Esc 监听加作用域判断 |
| `src/renderer/src/canvas/BottomBar.tsx` | Esc 监听加作用域判断 |
| `src/renderer/src/canvas/PromptBar.tsx` | 两个 Esc 监听加作用域判断 |
| `src/renderer/src/studio/InspectorPane.tsx` | 联动选中片段，显示真实字段；未选中显示时间线设置 |
| `src/renderer/src/canvas/nodes/NodeToolbar.tsx` | 删除尺寸展示，图标 15 → 14 |
| `src/renderer/src/styles/global.css` | 工具栏 40 → 36、按钮 32 → 28、字号 13 → 12、间距缩小 |

## 快捷键作用域

剪辑室打开时，画布以下快捷键不再响应：

- `Space` 空格拖拽
- `V` / `H` 工具切换
- `Ctrl+F` 搜索
- `Ctrl+Z` 撤销
- `Delete` 删除
- `Esc` 菜单关闭
- PromptBar 的 `Esc` 展开/拾取取消

实现方式：画布的全局监听开头调用 `studioOpen()`，检测到 `.studio-window` 存在就返回。剪辑室自己的快捷键不受影响。

## 检查器联动

选中片段时显示：

- 基础：名称、起点、时长、速度
- 画面：缩放、旋转、不透明度、混合（中文）
- 声音：音量、淡入、淡出
- 文字：内容、字号、颜色

未选中时显示时间线设置：名称、分辨率、帧率、片段数、轨道数。

## 节点工具栏瘦身

| 项目 | 调整 |
|---|---|
| 工具栏高度 | 40 → 36px |
| 按钮高度 | 32 → 28px |
| 按钮内边距 | 0 8 → 0 5px |
| 按钮间距 | 2 → 1px |
| 字号 | 13 → 12px |
| 主操作图标 | 15 → 14px |
| 尺寸展示 | 删除 |
| 主操作数量 | 保持 6 |
| 下载 / 入库 | 保持常驻 |

## 清单同步

`docs/clip-studio-backlog.md` 已勾选这三项。剩余 P1 项：跨轨道拖拽、ripple 裁剪、素材拖拽、时间线持久化、纵向滚动同步、边缘自动滚动、真实缩略图、布局持久化。
