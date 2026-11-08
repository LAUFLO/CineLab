# CLIP-STUDIO P2：完整导出

日期：2026-11-07
状态：完成
验证：导出 26 秒 1080p MP4，ffprobe 确认 780 帧 / 26.000 秒

## 交付

| 文件 | 内容 |
|---|---|
| `src/renderer/timeline-render.html` | 独立渲染页入口 |
| `src/renderer/src/studio/timeline-render.ts` | 接收时间线、逐帧渲染、返回 JPEG data URL |
| `src/main/timeline/export.ts` | 隐藏窗口逐帧取图 + ffmpeg 编码 + 进度 |
| `src/main/ipc/timeline.ts` | `timeline:export` |
| `src/main/protocol.ts` | `cinelab-asset` 加 CORS 头与 `corsEnabled` |
| `src/preload/index.ts` / `ipc-contract.ts` | `timeline.export` / `onExportProgress` |
| `src/renderer/src/studio/StudioTopBar.tsx` | 「生成成片」按钮、进度百分比 |
| `electron.vite.config.ts` | renderer 多入口 |

## 关键突破：CORS

`cinelab-asset://` 加载的素材会污染 canvas，`toDataURL` 抛 `SecurityError`。给自定义 scheme 开启 `corsEnabled`，并在协议响应里加 `Access-Control-Allow-Origin: *`，媒体元素设置 `crossOrigin = 'anonymous'` 后，canvas 可以正常导出。

## 导出流程

1. 隐藏 `BrowserWindow` 加载 `timeline-render.html`。
2. 注入 `TimelineDoc`。
3. 逐帧 `window.__renderFrame(t)`：渲染、等待视频 seek、返回 JPEG data URL。
4. 主进程写临时帧序列。
5. ffmpeg 编码 H.264 + `faststart`。
6. 输出到项目 `exports/成片-<时间戳>.mp4`。
7. 进度通过 `timeline:export-progress` 回传，按钮显示百分比。

## 实测

- 26 秒 1080p 导出约 2 分钟，780 帧。
- ffprobe：1920×1080、30fps、26.000 秒、780 帧、16.1MB。
- 音频轨已混入：`atrim` + `volume` + `adelay` + `amix`。

## 音频混音

- 收集所有 `kind === 'audio' && !muted` 的片段，`resolveMediaPath` 解析项目内或全局库路径。
- 每段：`atrim=start:duration` → `asetpts` → `volume` → 可选 `afade` in/out → 可选 `adelay`。
- 多段用 `amix=inputs=N:normalize=0` 混合；单段 `anull`。
- 输出用 `-t 时间线总时长` 控制，不再用 `-shortest`，避免被短音频截断。

## 已知限制

- 串行逐帧，长片导出时间随帧数线性增长。
- 没有取消入口，导出中不能中断。
- 源音频短于片段时，音频只覆盖源长度，剩余静音；需要 `apad` 才能补满。
- 视频片段自带音频未混入，只处理独立音频轨。
- 4K 帧数据更大，导出会更慢，暂未实测。
- 隐藏渲染窗口在失败时依赖 `finally` 销毁；若主进程崩溃可能残留。
