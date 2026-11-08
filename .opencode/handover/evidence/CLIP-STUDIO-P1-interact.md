# CLIP-STUDIO P1：时间线交互第一批

日期：2026-11-07
状态：完成
验证：typecheck、54 个测试、build 通过；CDP 真实鼠标事件验证

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/src/stores/timeline.ts` | 时间线文档、撤销历史、选中、播放头、工具、吸附、磁性 |
| `src/renderer/src/studio/demo.ts` | 32 秒演示时间线与 6 个演示素材 |
| `src/renderer/src/studio/TimelinePane.tsx` | 从 TimelineDoc 渲染标尺、轨道、片段、播放头 |
| `src/renderer/src/studio/MaterialPool.tsx` | 双击素材追加到主轨 |
| `src/renderer/src/studio/PreviewPane.tsx` | 播放头时间与总时长联动 |
| `src/renderer/src/studio/StudioTopBar.tsx` | 时长、分辨率联动 |

## 已验证交互

| 操作 | 结果 |
|---|---|
| 点击标尺 | 播放头跳到点击位置（实测 522px ≈ 45%） |
| 点击片段 | 选中，亮边高亮，播放头不动 |
| 双击素材卡片 | 追加到主轨末尾，总时长 00:32 → 00:36 |
| 撤销 | 回到 7 个片段 / 00:32 |
| 重做 | 回到 8 个片段 / 00:36 |
| 选择 / 切割工具 | 工具栏状态切换 |
| 吸附 / 磁性 | 工具栏状态切换 |

## 数据流

```
素材卡片双击
  → assetToClip
  → dispatch({ op: 'addClip' })
  → applyCommand（纯函数，返回新文档）
  → pushHistory（旧文档入栈）
  → TimelinePane 按 startMs / durationMs 重新渲染
```

撤销与重做走 `timeline-history`，与画布一致为快照模式。

## 已知限制

- 片段拖拽、裁剪、切割未接线。
- 缩放按钮禁用，时间线目前是「整片适配」宽度，没有横向滚动。
- 快捷键未接（空格、Delete、Ctrl+Z）。
- 检查器仍是静态字段，未联动选中片段。
- 时间线未持久化，关闭剪辑室后演示数据重置。
- 素材拖入仍是双击，不是拖拽。

## 下一步

P1 剩余：片段拖拽/裁剪/切割、缩放与横向滚动、快捷键作用域、检查器联动、节点工具栏瘦身。
