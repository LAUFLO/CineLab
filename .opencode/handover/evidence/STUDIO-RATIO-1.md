# STUDIO-RATIO-1 · 剪辑室画幅跟随素材、预览不裁剪、手动切换画幅

日期：2026-11-09

## 问题

9:16 素材拖进剪辑室后，预览被裁成 16:9。

原因有三处：

1. `createTimeline` 默认固定 1920×1080，不会跟随素材比例。
2. 预览渲染 `renderer.ts` 用 `Math.max`（cover），非本比例素材被放大裁剪。
3. 导出的主进程 ffmpeg 用 `force_original_aspect_ratio=decrease` + pad（contain），与预览行为不一致。

## 修改

### 1. 首个素材自动匹配画幅

- `timelineMediaRef` 增加可选 `width / height`。
- 画布素材 `PoolAsset` 带上输出宽高，`assetToClip` 写入 clip.media。
- `applyCommand` / `applyCommands` 在时间线**原本为空**时，按第一个视频/图片素材比例设置画幅：
  - 竖屏（ratio < 0.85）→ 1080×1920
  - 方形（0.85–1.2）→ 1080×1080
  - 横屏保持 1920×1080
- 只在当前仍是默认 1920×1080 时生效，不覆盖用户手动设置的画幅；已有片段后不再自动改。

### 2. 预览改为等比适应

`renderer.ts` 的 `fit` 从 `Math.max` 改为 `Math.min`，素材完整显示，比例不一致时留黑边，不再裁剪。与导出 ffmpeg 的 contain 行为一致。

### 3. 手动切换画幅

剪辑室属性面板新增画幅快捷按钮：`16:9 / 9:16 / 1:1`，点击写入 `doc.video.width/height`，当前比例高亮。

## 验证

- 新增 `timeline-canvas.test.ts`：竖屏首素材 → 1080×1920；方形 → 1080×1080；横屏保持 1920×1080；已有片段不自动改；手动设置画幅不被覆盖。
- `typecheck`、27 文件 / 160 用例、`build` 通过。

## 说明

资产库 tab 的素材没有宽高元数据，暂不参与自动匹配；从画布素材拖入时会自动匹配。手动切换画幅对所有素材都可用。
