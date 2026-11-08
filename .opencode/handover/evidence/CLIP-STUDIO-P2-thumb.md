# CLIP-STUDIO P2：素材池真实缩略图

日期：2026-11-07
状态：完成（含磁盘缓存、并发限制、黑场取帧、音频波形）
验证：CDP 截图确认视频首帧与音频波形

## 交付

| 文件 | 内容 |
|---|---|
| `src/main/media/thumbnail.ts` | 视频抽帧 / 音频波形、磁盘 + 内存缓存、最多 2 个 ffmpeg 并发 |
| `src/main/ipc/media.ts` | `media:thumbnail(path, atSeconds?, kind?)` |
| `src/preload/index.ts` | 暴露 `media.thumbnail` |
| `src/shared/ipc-contract.ts` | `MediaApi.thumbnail` |
| `src/renderer/src/studio/MaterialPool.tsx` | `AssetThumbnail`：图片直出、视频抽帧、音频波形 |
| `src/renderer/src/styles/studio.css` | 缩略图 `object-fit: cover` |

## 为什么不用前端抽帧

`cinelab-asset://` 加载的视频会污染 canvas，`toDataURL` 抛 `SecurityError: Tainted canvases may not be exported`。视频和音频缩略图必须在主进程用 ffmpeg 生成。

## 实现细节

| 项 | 实现 |
|---|---|
| 磁盘缓存 | `userData/thumb-cache/<sha256>.png`，命中直接读文件 |
| 内存缓存 | 进程内 Map，二级命中 |
| 并发限制 | 最多 2 个 ffmpeg，其余排队 |
| 黑场取帧 | 先 `probeMedia` 拿时长，取片头 10%、最多 2 秒 |
| 音频波形 | `showwavespic=s=320x90:colors=#8b8b90` |
| 输出格式 | 统一 PNG。`showwavespic` 带透明通道，写成 JPEG 会变黑 |

## 已验证

- 资产库 11 个卡片全部生成缩略图。
- 视频显示真实首帧（测试视频首帧是 CineLab logo）。
- 音频「演示音频」显示灰色波形图。

## 仍存在的限制

- 如果片头 10% 处也是黑场，无法自动识别，缩略图会偏暗。
- 磁盘缓存不自动清理，长期使用会累积；后续可在设置页加清理入口。
- 缩略图尺寸固定 320 宽，高分屏下略模糊。
