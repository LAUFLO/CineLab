# CLIP-STUDIO P1：素材拖拽、持久化、滚动增强

日期：2026-11-07
状态：完成
验证：CDP 拖放与 reload 实测；typecheck 通过

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/src/studio/persist.ts` | 时间线 localStorage 读写、布局读写 |
| `src/renderer/src/studio/MaterialPool.tsx` | 素材卡片 `draggable`，拖拽写入 `application/x-cinelab-asset` |
| `src/renderer/src/studio/TimelinePane.tsx` | 轨道 `dragover` / `drop` 接收素材；纵向滚动同步；边缘自动滚动；拖拽滚动补偿 |
| `src/renderer/src/stores/studio.ts` | 布局从 localStorage 初始化，折叠与比例变化时保存 |
| `src/renderer/src/studio/StudioWindow.tsx` | 打开时读取持久化时间线，doc 变化 400ms 防抖保存 |

## 已验证

| 功能 | 实测 |
|---|---|
| 素材拖拽 | 合成 DragEvent 拖入 V1，片段数 6 → 8 |
| 时间线持久化 | 删除片段后存储 7 → 6，reload 后加载 6，与 UI 一致 |
| 布局持久化 | 折叠素材池后 `leftOpen: false`，reload 后仍折叠 |
| 纵向滚动同步 | 已实现 `scrollTop` 同步，轨道不足一屏暂未实测 |
| 边缘自动滚动 | 已实现 rAF 滚动与 `startScrollLeft` 补偿，待手动实测 |

## 实现要点

- 素材拖拽用 HTML5 `dataTransfer`，拖入位置按 `clientX` 换算成 `atMs`，走 `addClipsInSequence` 的 insert 模式。
- 时间线按项目路径存 `cinelab.studio.timeline.<path>`，布局存 `cinelab.studio.layout`。
- 拖拽时 `deltaMs` 加上滚动增量 `scrollLeft - startScrollLeft`，自动滚动时片段跟随鼠标。
- 纵向滚动由右侧滚动区驱动，轨道头同步 `scrollTop`。

## 剩余

- 素材池真实缩略图依赖真实素材接线，暂缓到 P2/P3。
- 纵向滚动和边缘自动滚动需要轨道多于一屏时手动验收。
