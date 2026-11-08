# CLIP-STUDIO P2：快速路径、代理、预览音频

日期：2026-11-07
状态：完成
验证：快速路径 3 秒视频 1.8 秒导出；typecheck/build 通过

## 交付

| 文件 | 内容 |
|---|---|
| `src/main/timeline/fast-path.ts` | 快速路径判定 |
| `src/main/timeline/export.ts` | `exportFastPath`、`apad` 补静音、音频混音 |
| `src/main/media/proxy.ts` | 540p 代理生成与缓存 |
| `src/main/ipc/media.ts` | `media:proxy` |
| `src/preload/index.ts` / `ipc-contract.ts` | `media.proxy` |
| `src/renderer/src/studio/PreviewStage.tsx` | WebAudio 预览混音 |

## 快速路径

满足全部条件才走：

- 只有一条视频轨
- 片段首尾相接、无空隙
- 全部是视频片段，无图片
- 无 transform / crop / opacity / blend
- 无变速、无转场、无文字
- 无音频片段

满足时直接 ffmpeg `trim + scale + pad + concat`，不走逐帧截图。

实测：3 秒 1080p 视频导出 **1.8 秒**，90 帧，1.1MB。逐帧路径同等长度约 15 秒。

## 音频

- 每段 `atrim` 后加 `apad=whole_dur=片段时长`，源音频短时补静音。
- 多段 `amix=inputs=N:normalize=0`。
- 输出用 `-t 时间线总时长`，不再被短音频截断。

## 代理

- `media:proxy(path)` 生成 540p H.264 代理到 `.cache/proxy/<hash>.mp4`。
- 缓存键包含源文件大小和修改时间。
- 返回项目内相对路径，可走 `cinelab-asset://`。
- 预览已在 `PreviewStage` 中接入：后台生成、生成后切换、失败自动回退原片。

## 预览音频

- 播放时创建 `AudioContext`，为每个音频片段 `fetch` + `decodeAudioData`。
- 按 `startMs` 调度，`sourceStartMs` 作为偏移，`volume` 接 `GainNode`。
- 暂停、播放结束、文档变化时停止所有源并关闭上下文。

## 已知限制

- 快速路径只覆盖「单视频轨纯拼接」；独立音频轨、多视频轨、文字、转场仍走逐帧。
- 代理首次生成串行执行；生成期间预览先用原片，生成后自动切换。
- 代理接入预览、视频自带音频、seek 暂停已在 `CLIP-STUDIO-P2-limits.md` 补齐。
