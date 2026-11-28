# 03 剪辑室

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

## 这个模块负责什么

时间线、剪辑、转场、关键帧、字幕、音频处理与成片导出。

## 不负责什么

- 不做视频生成（见 02）。
- 不做拉片分析（见 05）。
- 不做导演台 3D 场景（见 04）。

## 数据模型

`TimelineDoc`：

- `id`、`name`、`video`（画幅/帧率/编码设置）、`background`；
- `tracks`（≤50）：`kind` 为 `video`、`audio`、`subtitle`；
- `clips`（≤5000）：`kind` 为 `video`、`image`、`audio`、`text`、`layer`、`transition`；
- `markers`（≤500）；`linkage` 控制音视频联动；
- `createdAt/updatedAt`。

`TimelineClip` 关键字段：`trackId`、`startMs`、`durationMs`、`sourceInMs`、`media`（`scope/path/nodeId/outputId/kind/width/height`）、`transform`（scale/offset/rotation/stretch）、`crop`、`filter`（亮度/对比/饱和/模糊/灰度/棕褐/色相/反相/暗角）、`text`（字体/字号/描边/阴影/背景）、`keyframes`（position/scale/rotation/opacity/volume）、`transitions`、`speed`、`volume`。

常量：`MIN_CLIP_MS = 1000/60`、图片默认 5s、文字默认 4s、转场默认 500ms/最短 100ms、`MAX_CLIPS = 5000`、`MAX_TRACKS = 50`。

## 命令层

`TimelineCommand` 是纯数据命令，覆盖：

- 片段：`addClip`、`addClips`、`addClipsInSequence`、`moveClips`、`trimClip`、`splitClips`、`splitAt`、`removeClips`、`removeRanges`、`updateClip`、`setClipSpeed`、`setClipTransform`、`detachAudio`
- 轨道：`addTrack`、`removeTrack`、`setTrackFlag`（visible/muted/locked）
- 时间线：`setTimelineVideo`、`setTimelineBackground`、`setLinkage`、`closeGaps`
- 标记：`addMarker`、`removeMarker`
- 批量：`batch`

`applyCommand(doc, command)` 与 `applyCommands(doc, commands)` 都是纯函数：先 `structuredClone`，再应用、`normalizeClips`、必要时匹配画布画幅，返回新文档，入参不变。

编辑模式 `EditMode = 'insert' | 'overwrite'`；编辑原语在 `timeline-edit.ts`：`trimClip`、`splitAt`、`cutRange`、`removeClips`、`removeRanges`、`moveClips`、`insertClips`、`closeGaps`、`normalizeClips`。

## 主进程

| 文件 | 职责 |
|---|---|
| `storage.ts` | `timelines/<id>.json` 读写与校验 |
| `export.ts` | ffmpeg 导出；先尝试 `stream-copy`，不满足再走滤镜/逐帧 |
| `fast-path.ts` | 单视频轨、首尾相接、无效果/文字时直接拼接 |
| `stream-copy.ts` | 码流签名一致时 `-c copy`，避免重编码 |
| `audio-mix.ts` | 多轨音量、淡入淡出、变速、音效滤镜 |
| `transcribe.ts` | 字幕转录（依赖组件与媒体探测） |
| `analysis.ts` | 静音/节拍等时间线分析 |
| `vtt.ts` | 字幕轨导出 WebVTT |

## 渲染进程

`src/renderer/src/studio/`：

- `StudioWindow.tsx`：剪辑室全屏窗口；
- `TimelineCanvas.tsx` / `TimelinePane.tsx`：时间线画布与轨道；
- `PreviewStage.tsx` / `PreviewPane.tsx`：预览与播放；
- `InspectorPane.tsx`：片段属性；
- `MaterialPool.tsx`：素材池；
- `BezierEditor.tsx`：贝塞尔缓动；
- `ClipMedia.tsx`：片段媒体渲染；
- `useTimelineAudio.ts`：音频预听；
- `docCache.ts` / `persist.ts` / `references.ts`：缓存、保存、上游引用。

Store：`stores/timeline.ts`、`stores/studio.ts`。

## 数据流

```
画布剪辑室节点
  → StudioWindow
  → timelineStore 命令
  → applyCommand(s)
  → TimelineDoc
  → timelines/<id>.json

导出：
StudioWindow → TimelineApi.export
  → main/timeline/export.ts
  → fast-path / stream-copy / 滤镜管线
  → ffmpeg → exports/*.mp4
  → 画布成片节点
```

## 当前状态

| 能力 | 状态 | 证据 |
|---|---|---|
| 时间线读写/命令 | 已实现 | `timeline-schema.test.ts`、`timeline-commands.test.ts` |
| 剪辑/裁剪/关键帧 | 已实现 | `timeline-edit.test.ts`、`timeline-keyframes.test.ts` |
| 转场/吸附/布局 | 已实现 | `timeline-transition.test.ts`、`timeline-snap.test.ts` |
| 字幕导入/导出 | 已实现 | `subtitles.test.ts`、`vtt.ts` |
| 音频处理 | 已实现 | `audio-fx.test.ts`、`audio-mix.ts` |
| 成片导出 | 已实现 | `main/timeline/export.ts` |
| 转录/分析 | 已实现 | `transcribe.ts`、`analysis.ts` |
| 全屏窗口拖动 | 已实现 | `StudioWindow` 顶部 40px `WindowDragStrip`，内容区 no-drag |

## 已知限制

- 时间线与导演台镜头是两套模型，联动时先确认字段映射。
- 导出依赖 ffmpeg 与项目 `exports` 目录；长片导出耗时。
- `MAX_CLIPS = 5000`、`MAX_TRACKS = 50`；超大工程要拆分。
- 转录依赖组件运行时，未安装时不可用。
- 字幕烧录字体按平台选择：Windows 用 `Microsoft YaHei`，macOS 用 `PingFang SC`。

## 常见改动入口

| 想改什么 | 先看 |
|---|---|
| 时间线数据/命令 | `src/shared/timeline-schema.ts`、`timeline-commands.ts` |
| 剪辑/裁剪/吸附 | `timeline-edit.ts`、`timeline-tools.ts`、`timeline-snap.ts` |
| 关键帧/转场 | `timeline-keyframes.ts`、`timeline-transition.ts` |
| 字幕 | `subtitles.ts`、`subtitle-presets.ts`、`main/timeline/vtt.ts` |
| 音频 | `audio-fx.ts`、`sound-schema.ts`、`main/timeline/audio-mix.ts` |
| 导出 | `main/timeline/export.ts`、`fast-path.ts`、`stream-copy.ts` |
| 时间线 UI | `src/renderer/src/studio/` |
| Store | `src/renderer/src/stores/timeline.ts`、`studio.ts` |

## 文件与导出（自动生成）

<!-- AUTO:files:start -->
| 文件 | 行数 |
|---|---|
| `src/main/timeline/analysis.ts` | 260 |
| `src/main/timeline/audio-mix.ts` | 196 |
| `src/main/timeline/export.ts` | 466 |
| `src/main/timeline/fast-path.ts` | 34 |
| `src/main/timeline/storage.ts` | 98 |
| `src/main/timeline/stream-copy.ts` | 136 |
| `src/main/timeline/transcribe.ts` | 346 |
| `src/main/timeline/vtt.ts` | 61 |
| `src/renderer/src/stores/studio.ts` | 63 |
| `src/renderer/src/stores/timeline.ts` | 132 |
| `src/renderer/src/studio/BezierEditor.tsx` | 122 |
| `src/renderer/src/studio/ClipMedia.tsx` | 115 |
| `src/renderer/src/studio/InspectorPane.tsx` | 1480 |
| `src/renderer/src/studio/MaterialPool.tsx` | 343 |
| `src/renderer/src/studio/PreviewPane.tsx` | 72 |
| `src/renderer/src/studio/PreviewStage.tsx` | 48 |
| `src/renderer/src/studio/StudioTopBar.tsx` | 109 |
| `src/renderer/src/studio/StudioWindow.tsx` | 278 |
| `src/renderer/src/studio/TimelineCanvas.tsx` | 105 |
| `src/renderer/src/studio/TimelinePane.tsx` | 1256 |
| `src/renderer/src/studio/assets.ts` | 99 |
| `src/renderer/src/studio/demo.ts` | 171 |
| `src/renderer/src/studio/docCache.ts` | 28 |
| `src/renderer/src/studio/nodes.ts` | 262 |
| `src/renderer/src/studio/persist.ts` | 59 |
| `src/renderer/src/studio/references.ts` | 103 |
| `src/renderer/src/studio/renderer.ts` | 532 |
| `src/renderer/src/studio/scope.ts` | 8 |
| `src/renderer/src/studio/timeline-plan-runner.ts` | 39 |
| `src/renderer/src/studio/timeline-render.ts` | 31 |
| `src/renderer/src/studio/useTimelineAudio.ts` | 148 |
| `src/shared/audio-fx.ts` | 55 |
| `src/shared/sound-schema.ts` | 24 |
| `src/shared/subtitle-presets.ts` | 86 |
| `src/shared/subtitles.ts` | 68 |
| `src/shared/timeline-commands.ts` | 447 |
| `src/shared/timeline-edit.ts` | 394 |
| `src/shared/timeline-history.ts` | 93 |
| `src/shared/timeline-keyframes.ts` | 194 |
| `src/shared/timeline-layout.ts` | 117 |
| `src/shared/timeline-schema.ts` | 396 |
| `src/shared/timeline-snap.ts` | 31 |
| `src/shared/timeline-tools.ts` | 297 |
| `src/shared/timeline-transition.ts` | 64 |
<!-- AUTO:files:end -->

<!-- AUTO:exports:start -->
| 文件 | 导出 |
|---|---|
| `src/main/timeline/analysis.ts` | `analyzeMedia` |
| `src/main/timeline/audio-mix.ts` | `AudioInput`、`AudioFilterPlan`、`collectAudioInputs`、`buildAudioFilters` |
| `src/main/timeline/export.ts` | `TimelineExportOptions`、`exportTimeline` |
| `src/main/timeline/fast-path.ts` | `fastPathClips` |
| `src/main/timeline/storage.ts` | `assertTimelineId`、`ensureTimelineDir`、`loadTimelineFile`、`saveTimelineFile`、`duplicateTimelineFile`、`deleteTimelineFile` |
| `src/main/timeline/stream-copy.ts` | `tryExportStreamCopy` |
| `src/main/timeline/transcribe.ts` | `transcribeClip`、`transcribeTimeline`、`hasActiveTranscriptions`、`transcribe` |
| `src/main/timeline/vtt.ts` | `exportVtt` |
| `src/renderer/src/stores/studio.ts` | `StudioTab`、`useStudioStore` |
| `src/renderer/src/stores/timeline.ts` | `TimelineTool`、`ClipReferenceIssue`、`useTimelineStore` |
| `src/renderer/src/studio/BezierEditor.tsx` | `BezierEditor` |
| `src/renderer/src/studio/ClipMedia.tsx` | `ClipMedia` |
| `src/renderer/src/studio/InspectorPane.tsx` | `InspectorPane` |
| `src/renderer/src/studio/MaterialPool.tsx` | `MaterialPool` |
| `src/renderer/src/studio/PreviewPane.tsx` | `PreviewPane` |
| `src/renderer/src/studio/PreviewStage.tsx` | `PreviewStage` |
| `src/renderer/src/studio/StudioTopBar.tsx` | `StudioTopBar` |
| `src/renderer/src/studio/StudioWindow.tsx` | `StudioWindow` |
| `src/renderer/src/studio/TimelineCanvas.tsx` | `TimelineCanvasProps`、`TimelineCanvas` |
| `src/renderer/src/studio/TimelinePane.tsx` | `TimelinePane` |
| `src/renderer/src/studio/assets.ts` | `PoolAsset`、`poolFromNodes`、`poolFromLibrary`、`assetToClip`、`formatDuration` |
| `src/renderer/src/studio/demo.ts` | `DemoAsset`、`DEMO_ASSETS`、`assetToClip`、`createDemoTimeline` |
| `src/renderer/src/studio/docCache.ts` | `getCachedTimeline`、`setCachedTimeline`、`invalidateTimelineCache` |
| `src/renderer/src/studio/nodes.ts` | `createStudioAt`、`createStudioAtViewportCenter`、`createStudioFromNode`、`createStudioFromNodes`、`uploadAssetsToStudio`、`uploadToStudio`、`syncStudioAfterSave` |
| `src/renderer/src/studio/persist.ts` | `StudioLayout`、`loadTimeline`、`clearLegacyTimeline`、`loadLayout`、`saveLayout` |
| `src/renderer/src/studio/references.ts` | `ClipReferenceIssues`、`analyzeClipReferences`、`referencesFromDoc`、`upstreamSignature` |
| `src/renderer/src/studio/renderer.ts` | `MEDIA_READY_EVENT`、`RendererPools`、`createPools`、`RenderInput`、`renderTimeline`、`waitForMedia`、`renderFrameToDataUrl` |
| `src/renderer/src/studio/scope.ts` | `studioOpen` |
| `src/renderer/src/studio/timeline-plan-runner.ts` | `ApplyTimelinePlanOptions`、`applyTimelinePlan` |
| `src/renderer/src/studio/useTimelineAudio.ts` | `useTimelineAudio` |
| `src/shared/audio-fx.ts` | `DEFAULT_AUDIO_FX`、`audioFxFilters` |
| `src/shared/sound-schema.ts` | `SoundAsset`、`SoundManifest`、`ImportedSound` |
| `src/shared/subtitle-presets.ts` | `SubtitlePreset`、`SUBTITLE_PRESETS` |
| `src/shared/subtitles.ts` | `SubtitleCue`、`parseSubtitle` |
| `src/shared/timeline-commands.ts` | `TimelineCommand`、`applyCommand`、`applyCommands`、`imageClip`、`subtitleClip`、`videoClip`、`TimelineSummary`、`summarizeTimeline` |
| `src/shared/timeline-edit.ts` | `EditMode`、`rippleShift`、`splitAt`、`insertClips`、`overwriteClips`、`cutRange`、`TimeRange`、`removeRanges`、`ClipMove`、`moveClips`、`trimClip`、`splitClips`、`removeClips`、`closeGaps`、`dependentsOf`、`linkageShift`、`normalizeClips` |
| `src/shared/timeline-history.ts` | `HISTORY_LIMIT`、`TimelineHistory`、`createHistory`、`pushHistory`、`HistoryStep`、`undo`、`redo`、`dispatch`、`HistoryState`、`createHistoryState`、`dispatchHistory`、`undoHistory`、`redoHistory` |
| `src/shared/timeline-keyframes.ts` | `EvaluatedClip`、`KeyEase`、`evaluateClipKeys`、`volumeExpression` |
| `src/shared/timeline-layout.ts` | `DEFAULT_ZOOM`、`MIN_ZOOM`、`MAX_ZOOM`、`ZOOM_STEP`、`EMPTY_VIEW_SPAN_MS`、`pxPerMs`、`msToPx`、`pxToMs`、`scrollLeftForAnchor`、`VisibleRange`、`visibleRange`、`clipsInRange`、`RulerSteps`、`rulerSteps`、`formatTimecode`、`docDurationMs` |
| `src/shared/timeline-schema.ts` | `TIMELINE_SCHEMA_VERSION`、`MIN_CLIP_MS`、`DEFAULT_IMAGE_DURATION_MS`、`DEFAULT_TEXT_DURATION_MS`、`DEFAULT_TRANSITION_MS`、`MIN_TRANSITION_MS`、`MAX_CLIPS`、`MAX_TRACKS`、`timelineTrackKindSchema`、`timelineClipKindSchema`、`timelineMediaRefSchema`、`clipTransformSchema`、`clipCropSchema`、`clipFilterSchema`、`textStrokeSchema`、`textShadowSchema`、`textBackgroundSchema`、`textStyleSchema`、`clipKeyPropertySchema`、`clipKeySchema`、`TIMELINE_TRANSITION_TYPES`、`transitionInSchema`、`audioFxSchema`、`timelineClipSchema` …（共 58 个） |
| `src/shared/timeline-snap.ts` | `snapValue`、`snapTargets` |
| `src/shared/timeline-tools.ts` | `TimelinePlan`、`RemoveSilenceOptions`、`buildRemoveSilencePlan`、`SplitByShotsOptions`、`buildSplitByShotsPlan`、`BeatMarkerOptions`、`buildBeatMarkerPlan`、`BeatSplitOptions`、`buildBeatSplitPlan` |
| `src/shared/timeline-transition.ts` | `TransitionState`、`transitionState` |
<!-- AUTO:exports:end -->
