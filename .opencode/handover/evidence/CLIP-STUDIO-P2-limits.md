# CLIP-STUDIO P2：消除最后四条限制

日期：2026-11-07
状态：完成（四条均已处理）
验证：typecheck / build 通过；快速路径与逐帧路径均实测带音频导出；代理接入预览；seek 暂停实测

## 1. 视频片段自带音频混入

### 完整（逐帧）路径

- `exportTimeline` 收集音频时不再只看 `kind === 'audio'`，同时收集 `kind === 'video'`。
- 每个视频先 `probeMedia`，只有 `hasAudio` 才加入混音，按路径缓存探测结果，避免重复 ffprobe。
- 音频流用 `[输入:a:0]` 指定首条音轨，防止多音轨文件导致 filter graph 报错。
- 每段仍走 `atrim → asetpts → apad → volume → afade → adelay`，最后 `amix`。

实测（5 秒视频 + 文字 + 2 秒独立音频，强制逐帧）：

| 项 | 结果 |
|---|---|
| 视频 | 5.000 秒 / 150 帧 / 1080p |
| 音频 | AAC / 5.000 秒（视频音轨与独立音频 `amix`） |
| 文件 | 2.1MB |
| 导出耗时 | 7.9 秒 |

### 快速路径

- `exportFastPath` 每段补 `[i:a:0]` 音频链。
- 有音轨：`atrim → asetpts → apad → aresample=48k → aformat=fltp/stereo → volume → afade`。
- 无音轨或 `muted`：用 `anullsrc` + `atrim` 生成等长静音，保证 concat 音视频段对齐。
- `concat` 输入按 ffmpeg 要求**交错排列**：`[v0][a0][v1][a1]`，不能先全部视频再全部音频。
- 输出同时映射 `[outv]` / `[outa]`，AAC 192k。

实测（两段各 5 秒，源带 AAC 音轨，无独立音频轨）：

| 项 | 结果 |
|---|---|
| 视频 | 10.000 秒 / 300 帧 / 1080p |
| 音频 | AAC / 10.000 秒 / 470 帧 |
| 文件 | 3.8MB |
| 导出耗时 | 3.4 秒 |

## 2. 540p 代理接入预览

- `PreviewStage` 打开含视频的时间线后，后台逐个调用 `media.proxy(path)`。
- 代理生成后写入 `pools.proxies`（按 clip id），清掉旧的 video 元素并触发重绘。
- `ensureVideo` 优先使用代理地址，没有代理才回退原片。
- 代理按源文件路径 + 大小 + mtime 做 hash，缓存在项目 `.cache/proxy/<hash>.mp4`，重复打开直接复用。
- 代理加载失败时自动丢弃代理、回退原片，不会把片段标记为永久失败。
- 实测代理文件生成成功（6 秒视频 138KB），预览正常显示画面。

## 3. 媒体加载后的静止帧重绘

- 新增 `MEDIA_READY_EVENT = 'cinelab:media-ready'`。
- `ensureVideo` 监听 `loadeddata` / `seeked`，`ensureImage` 监听 `load`，触发全局事件。
- `PreviewStage` 监听事件并递增 `mediaVersion`，驱动 canvas 重绘。
- 解决两个问题：代理替换后首帧黑屏、静止 seek 后画面停留在旧帧。

## 4. seek 时暂停

- 标尺与轨道空白处的 `pointerdown` 在 seek 前检查 `playing`，为真则 `pause()`。
- 实测：播放中时间从 00:02 走到 00:04（按钮为“暂停”），点击标尺后回到 00:02 并变为“播放”；900ms 后仍停在 00:02。

## 5. 预览音频包含视频自带音轨

- 独立音频片段继续用 WebAudio `decodeAudioData` + `AudioBufferSourceNode`，支持 `playbackRate`。
- 视频片段通过 `media.probe` 检测 `hasAudio`，有音轨时创建 `HTMLAudioElement`，按时间线 `startMs / sourceStartMs / speed / volume` 调度播放。
- 轨道 `muted` 与片段 `muted` 都会被跳过。
- 实测：播放后 `HTMLMediaElement.play` 被调用 1 次（当前时刻只有第一段视频在播）。

## 已知限制（仍未做）

- 快速路径仍只覆盖「单视频轨纯拼接 + 视频自带音频」；独立音频轨、多视频轨、文字、转场、变速、效果仍回退逐帧导出。
- 代理串行生成，首次打开长素材会等待；生成期间预览先用原片。
- 预览音频在编辑文档变化时会从头重新调度；seek 已改为暂停，重新播放从新位置开始。
- 没有全局音量/静音控制。
