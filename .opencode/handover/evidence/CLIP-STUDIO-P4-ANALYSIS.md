# P4 分析层：整条时间线自动字幕 / 镜头静音节拍 / 字幕导入 / 转场音频

日期：2026-11-08

## 完成内容

- 新增 `src/main/timeline/audio-mix.ts`
  - `collectAudioInputs` 收集音频轨与带音轨的视频
  - `buildAudioFilters` 统一处理裁剪、变速、音量关键帧、淡入淡出、延迟
  - 同轨下一片段有 `transitionIn` 时，上一片段尾部延长并淡出，下一片段淡入，实现音频交叉淡化
  - 导出、整条时间线转写共用同一混音器
- `transcribe.ts`
  - `TimelineTranscribeRequest` 改为 `clip` / `timeline` 两种模式
  - `transcribeClip` 继续支持选中视频/音频片段
  - `transcribeTimeline` 混合整条时间线为 16k 单声道 WAV，时间戳直接对应时间线
- 新增 `src/main/timeline/analysis.ts`
  - 镜头检测 `scdet=threshold=10`（视频滤镜）
  - 静音检测 `silencedetect=noise=-35dB:d=0.4`
  - 节拍检测：解码 16k PCM，20ms 窗口 RMS 峰值，最小间隔 250ms
  - 结果按片段 `speed` 映射回时间线时间
- 新增 `src/shared/subtitles.ts`
  - SRT / VTT 解析，支持 BOM、CRLF、cue 设置、HTML 标签、`MM:SS` 短时间码
- `timelineMarkerSchema` 增加 `durationMs`，静音区间可在标尺画成条带
- 时间线标尺渲染 marker（菱形 + 标签 + 区间宽度），点击跳转
- Inspector「AI 分析」区：镜头 / 静音 / 节拍按钮，结果批量 `addMarker`，只占一条撤销
- 时间线工具栏「导入字幕」：自动建字幕轨并批量创建字幕片段
- 修复镜头检测误用 `-af` 的问题，改为 `-vn -vf` 并关闭音频流

## 验证

- `corepack pnpm typecheck` 通过
- `corepack pnpm test`：13 个测试文件 74 个用例通过（字幕解析 4 个）
- `corepack pnpm build` 通过
- 整条时间线自动字幕：TTS 5 秒 → 0–4960ms 字幕
- 视频原声自动字幕：测试视频从 10 秒起 → 10000ms / 1000ms 字幕「请认识一下」
- 镜头检测：2 秒红 + 2 秒蓝测试视频在 2000ms 返回镜头标记
- 静音检测：3 个区间 marker；节拍检测：4 个 marker；reload 后全部保留
- SRT 导入 IPC：`import-test.srt` 返回 2 条 cue，时间与文本正确
- 转场音频交叉淡化：2.4 秒导出含 AAC 音轨；重叠区间 mean −32.1dB、max −12.8dB，无爆音

## 已知限制

- 字幕重叠时截短前一条未实现
- 节拍检测是能量峰值启发式，复杂音乐可能多检/漏检
- 镜头检测使用 `-ss` 输入 seek，切点靠近关键帧时可能有半帧误差
- 导入字幕对话框依赖系统文件选择；IPC 已支持直接传路径，便于测试与后续拖放
