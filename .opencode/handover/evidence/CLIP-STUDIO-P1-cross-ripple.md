# CLIP-STUDIO P1：跨轨拖拽与 ripple 裁剪

日期：2026-11-07
状态：完成
验证：CDP 真实鼠标拖拽；typecheck 通过

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/src/studio/TimelinePane.tsx` | 拖拽时按鼠标 Y 计算目标轨道；跨轨幽灵预览；`Alt` 拖边缘传 ripple |
| `src/renderer/src/styles/studio.css` | `.studio-clip.is-dragging` 幽灵样式 |

## 跨轨拖拽

- 拖拽时按 `event.clientY` 与各轨道累加高度判断目标轨道。
- 原轨道上的片段隐藏，目标轨道显示半透明幽灵片段。
- 松手后 `moveClips` 使用目标轨道；insert 模式会推开目标轨道后续片段。
- 实测：V1 片段数 3 → 2，V2 片段数 1 → 2，「镜头 01」成功移到 V2。

## Alt ripple 裁剪

- `pointerdown` 时记录 `event.altKey`。
- 松手时 `trimClip` 带上 `ripple: true`，后续片段跟随移动。
- 实测：`镜头 02` 宽度 324 → 244px，`镜头 03` 自动前移，总时长保持 00:32。

## 清单同步

`docs/clip-studio-backlog.md` 已勾选这两项。P1 剩余：素材拖拽、时间线持久化、纵向滚动同步、边缘自动滚动、真实缩略图、布局持久化。
