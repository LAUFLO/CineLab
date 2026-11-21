# 02 生成与模型

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

## 这个模块负责什么

模型供应商、模型能力、生成队列、参数预设与约束、参考输入、媒体处理、素材入库。

## 不负责什么

- 不做画布节点交互（见 01）。
- 不做时间线与剪辑（见 03）。
- 不做导演台预演（见 04）。

## 能力与模式

`Capability` 6 种：`image.t2i`、`image.i2i`、`text.chat`、`video.t2v`、`audio.tts`、`audio.music`。

`ModelModeId` 9 种归一化模式：`t2i`、`i2i`、`t2v`、`first-frame`、`first-last`、`reference`、`video-edit`、`video-extend`、`layer`。

`OperationSupport`：`native` / `prompted` / `none`，表示模型对视频操作（重拍、替换、续写）的原生支持程度。

设计原则：模式只描述「收什么、出什么」，字段映射交给适配器或 HTTP 模板；素材数量不在本地建模，超量直接展示接口错误。

## 供应商

| 适配器 | 文件 |
|---|---|
| OpenAI 兼容（图/文/音） | `providers/openai-compat.ts` |
| Kling | `providers/kling.ts`、`kling-auth.ts` |
| MiniMax | `providers/minimax.ts` |
| Sora | `providers/sora.ts` |
| 火山方舟 | `providers/volcengine.ts` |
| Agnes | `providers/agnes.ts` |
| 通用 HTTP 模板 | `providers/http-template.ts` |

公共件：`headers.ts`、`http.ts`、`model-body.ts`、`retry.ts`。

## 参数系统

`ParamDef` 支持 `select/number/text/boolean`，以及 v2 条件：

- `appliesTo`：只在某些模式出现；
- `when`：满足条件才显示；
- `force`：满足条件时锁定值；
- `forbid`：这些字段存在时不发送当前字段；
- `deny`：满足条件时禁用某些值。

`param-presets.ts` 提供常用预设，`param-constraints.ts` 做约束校验。

## 生成队列

`engine/queue.ts`：

- 默认并发 2，可设 1–4；
- `enqueue`、`cancel`、`cancelAll`；
- 每个任务带 `nodeId`、`run(signal, onProgress)`；
- 事件：`queued`、`cancelled`、进度、完成。

`engine/start-generation.ts` 按 capability 分发到对应适配器；参考图最多 32 张；视频分辨率表覆盖 16:9、9:16、1:1、4:3、3:4、21:9。

`engine/generation-error.ts` 把错误转成可读文案，优先识别配额问题（402/403 `insufficient_user_quota`），避免误报成 Key 无效。

## 媒体与素材

`main/media/`：

- `grid.ts` 宫格切分；`stitch.ts` 拼接；
- `frames.ts` 抽帧；`video.ts`/`video-ops.ts` 视频操作；
- `depth.ts`/`depth-tasks.ts` 深度捕获；
- `vision.ts`/`vision-tasks.ts` 视觉任务；模型资产是纯 Python 源码加权重，Windows/macOS 共用同一份包，不放平台二进制；字幕烧录字体按平台选择（Windows `Microsoft YaHei`，macOS `PingFang SC`）；
- `thumbnail.ts`/`proxy.ts` 缩略图与代理；
- `audio.ts`/`audio-peaks.ts`/`sound-library.ts` 音频；
- `paths.ts` 媒体路径解析；`ffmpeg.ts` 进程封装。

`main/assets/ingest.ts` 把生成结果写入项目资产并返回 `GeneratedAsset`。

## 数据流

```
Prompt Bar / 节点操作
  → GenerateApi.run
  → generationQueue
  → start-generation（按 capability 分发）
  → 供应商适配器
  → 输出文件 → ingestAsset
  → 画布节点 outputs（版本栈）
```

## 当前状态

| 能力 | 状态 | 证据 |
|---|---|---|
| 多供应商配置与模型拉取 | 已实现 | `main/providers/`、`providers/*.test.ts` |
| 9 种归一化模式 | 已实现 | `model-modes.ts` |
| 参数预设/条件 | 已实现 | `param-presets.ts`、`param-constraints.ts` |
| 生成队列/取消/并发 | 已实现 | `engine/queue.ts` |
| 参考输入 | 已实现 | `reference-inputs.ts`、`model-inputs.test.ts` |
| 首尾帧载荷与校验 | 已实现；Agnes 首帧已真实复测 | `main/providers/media.ts`、`reference-inputs.ts`、`minimax.test.ts` |
| 协议族契约与 golden 请求体 | 已实现 | `shared/model-contracts.ts`、`golden-bodies.test.ts`、`capability-audit.test.ts` |
| http-template 完整 DSL（S3a/S3b） | 已实现 | `providers/http-template.ts`、`http-template-dsl.test.ts` |
| 本地适配器 registry / utilityProcess | 已实现（S2a/S2b） | `main/local-adapters/`、`shared/local-adapter.ts`、设置页本地适配器区块 |
| L4 sidecar（OpenAI / http-template） | 已实现（S4） | `main/local-adapters/registry.ts`、`docs/local-adapters.md` |
| 媒体处理 | 已实现 | `main/media/`、`concat.test.ts` |
| 错误文案 | 已实现 | `generation-error.test.ts` |

## 已知限制

- 模型能力由 `provider-schema.ts` 与模型清单决定；新增能力先改 schema 与适配器。
- 生成结果的计费/预扣在供应商适配层，不在 UI。
- 参考素材数量由供应商 API 决定，本地不做上限建模。
- 首尾帧变量 `refs.firstFrame` / `refs.lastFrame` 已改为纯 base64；旧自定义模板需手动迁移到 `firstFrameDataUrl` / `lastFrameDataUrl`。
- MiniMax H3 `role`、Agnes 尾帧和 http-template 新变量仍需真实 Key 复测（`REAL-API-VERIFY` gate）。Agnes 首帧已用真实 Key 生成 5.18 秒视频，首帧与输入图 SSIM 0.889。
- 官方模型保存时会校验协议族契约（字段、角色、模式），缺口会阻止保存；用户自定义模型只记录警告。
- Kling、火山和旧版 MiniMax 的尺寸/体积限制为通用推断（source confidence 为 medium），需按官方文档复核。
- 本地适配器当前支持 `type: code` 与 `type: sidecar`；`config` / `template` 与 MCP 应用级工具留待后续。
- sidecar 需要 `models.json`，`/models` 自动发现尚未实现。
- 打包后的 esbuild 二进制尚未在安装包中验证。
- 视频操作对模型支持程度不一，`OperationSupport` 只是声明，实际仍可能被供应商拒绝。

## 常见改动入口

| 想改什么 | 先看 |
|---|---|
| 供应商/模型配置 | `src/shared/provider-schema.ts`、`src/main/providers/` |
| 生成分发 | `src/main/engine/start-generation.ts` |
| 队列/并发 | `src/main/engine/queue.ts` |
| 参数预设/约束 | `src/shared/param-presets.ts`、`param-constraints.ts` |
| 参考输入 | `src/shared/reference-inputs.ts` |
| 媒体处理 | `src/main/media/` |
| 素材入库 | `src/main/assets/ingest.ts` |
| 前端状态 | `src/renderer/src/stores/generation.ts`、`generation-history.ts` |

## 文件与导出（自动生成）

<!-- AUTO:files:start -->
| 文件 | 行数 |
|---|---|
| `src/main/assets/ingest.ts` | 155 |
| `src/main/engine/generation-error.ts` | 55 |
| `src/main/engine/queue.ts` | 87 |
| `src/main/engine/start-generation.ts` | 437 |
| `src/main/local-adapters/build.ts` | 64 |
| `src/main/local-adapters/host-process.ts` | 166 |
| `src/main/local-adapters/host.ts` | 259 |
| `src/main/local-adapters/manifest.ts` | 285 |
| `src/main/local-adapters/registry.ts` | 459 |
| `src/main/local-adapters/runtime.ts` | 88 |
| `src/main/media/audio-peaks.ts` | 127 |
| `src/main/media/audio.ts` | 133 |
| `src/main/media/concat.ts` | 301 |
| `src/main/media/depth-tasks.ts` | 98 |
| `src/main/media/depth.ts` | 236 |
| `src/main/media/ffmpeg.ts` | 304 |
| `src/main/media/frames.ts` | 79 |
| `src/main/media/grid.ts` | 62 |
| `src/main/media/image.ts` | 86 |
| `src/main/media/paths.ts` | 44 |
| `src/main/media/proxy.ts` | 73 |
| `src/main/media/range.ts` | 32 |
| `src/main/media/sound-library.ts` | 49 |
| `src/main/media/stitch.ts` | 85 |
| `src/main/media/subtitle-detect.ts` | 204 |
| `src/main/media/thumbnail.ts` | 145 |
| `src/main/media/video-ops.ts` | 134 |
| `src/main/media/video.ts` | 245 |
| `src/main/media/vision-tasks.ts` | 102 |
| `src/main/media/vision.ts` | 457 |
| `src/main/providers/agnes.ts` | 205 |
| `src/main/providers/headers.ts` | 30 |
| `src/main/providers/http-template.ts` | 827 |
| `src/main/providers/http.ts` | 27 |
| `src/main/providers/kling-auth.ts` | 30 |
| `src/main/providers/kling.ts` | 174 |
| `src/main/providers/media.ts` | 49 |
| `src/main/providers/minimax.ts` | 297 |
| `src/main/providers/model-body.ts` | 252 |
| `src/main/providers/openai-compat.ts` | 789 |
| `src/main/providers/retry.ts` | 57 |
| `src/main/providers/sora.ts` | 232 |
| `src/main/providers/volcengine.ts` | 187 |
| `src/renderer/src/stores/generation-history.ts` | 151 |
| `src/renderer/src/stores/generation.ts` | 224 |
| `src/renderer/src/stores/vision-tasks.ts` | 95 |
| `src/shared/filters.ts` | 112 |
| `src/shared/generation.ts` | 141 |
| `src/shared/http-template.ts` | 110 |
| `src/shared/local-adapter.ts` | 14 |
| `src/shared/media.ts` | 233 |
| `src/shared/model-contracts.ts` | 395 |
| `src/shared/model-modes.ts` | 278 |
| `src/shared/param-constraints.ts` | 107 |
| `src/shared/param-presets.ts` | 304 |
| `src/shared/protocol-templates.ts` | 1341 |
| `src/shared/provider-presets.ts` | 313 |
| `src/shared/provider-schema.ts` | 1314 |
| `src/shared/reference-inputs.ts` | 146 |
<!-- AUTO:files:end -->

<!-- AUTO:exports:start -->
| 文件 | 导出 |
|---|---|
| `src/main/assets/ingest.ts` | `IngestInput`、`ingestAsset`、`thumbnailPathFor` |
| `src/main/engine/generation-error.ts` | `formatGenerationError` |
| `src/main/engine/queue.ts` | `QueueJob`、`generationQueue` |
| `src/main/engine/start-generation.ts` | `startGeneration` |
| `src/main/local-adapters/build.ts` | `LocalAdapterBuildResult`、`resolveLocalAdapterEntry`、`buildLocalAdapter` |
| `src/main/local-adapters/host.ts` | `LocalAdapterOutput`、`LocalAdapterGenerateOptions`、`LocalAdapterHost` |
| `src/main/local-adapters/manifest.ts` | `LocalAdapterType`、`SidecarHealthConfig`、`LocalAdapterManifest`、`LocalAdapterProviderConfig`、`LocalAdapterData`、`parseManifest`、`parseModelsFile`、`readLocalAdapter` |
| `src/main/local-adapters/registry.ts` | `LocalProviderRuntime`、`localAdapterLogs`、`localAdaptersDir`、`listLocalAdapterStatuses`、`localAdapterProviders`、`localProviderRuntime`、`sidecarProviderRuntime`、`localModelIds`、`localAdapterRecord`、`startLocalAdapterRegistry`、`stopLocalAdapterRegistry`、`reloadLocalAdapter` |
| `src/main/local-adapters/runtime.ts` | `generateWithLocalAdapter` |
| `src/main/media/audio-peaks.ts` | `computeAudioPeaks` |
| `src/main/media/audio.ts` | `buildAtempoFilter`、`trimAudio`、`changeAudioSpeed` |
| `src/main/media/concat.ts` | `ConcatResolution`、`ConcatQuality`、`ConcatOptions`、`concatVideoFiles`、`concatVideos` |
| `src/main/media/depth-tasks.ts` | `startDepthTask`、`cancelDepthTask`、`cancelAllDepthTasks`、`listDepthTasks` |
| `src/main/media/depth.ts` | `DepthCaptureOptions`、`captureDepth` |
| `src/main/media/ffmpeg.ts` | `ffmpegBinary`、`ffprobeBinary`、`RunFfmpegOptions`、`runFfmpeg`、`runFfmpegCapture`、`runFfmpegBuffer`、`probeMedia` |
| `src/main/media/frames.ts` | `extractFrame` |
| `src/main/media/grid.ts` | `splitGrid` |
| `src/main/media/image.ts` | `cropImage`、`cropImageRect` |
| `src/main/media/paths.ts` | `resolveInside`、`resolveMediaPath` |
| `src/main/media/proxy.ts` | `ensureProxy` |
| `src/main/media/range.ts` | `ByteRange`、`parseByteRange` |
| `src/main/media/sound-library.ts` | `listSounds`、`importSound` |
| `src/main/media/stitch.ts` | `stitchGrid` |
| `src/main/media/subtitle-detect.ts` | `SubtitleRect`、`detectSubtitleRect` |
| `src/main/media/thumbnail.ts` | `mediaThumbnail` |
| `src/main/media/video-ops.ts` | `applyVideoSegmentResult` |
| `src/main/media/video.ts` | `trimVideo`、`splitAv`、`cropVideo`、`removeSubtitles` |
| `src/main/media/vision-tasks.ts` | `startVisionTask`、`cancelVisionTask`、`cancelAllVisionTasks`、`listVisionTasks` |
| `src/main/media/vision.ts` | `VisionOptions`、`runVisionTask` |
| `src/main/providers/agnes.ts` | `buildAgnesBody`、`generateVideoAgnes` |
| `src/main/providers/headers.ts` | `resolveCustomHeaders`、`mergeHeaders` |
| `src/main/providers/http-template.ts` | `ImageRef`、`resolveTemplateRef`、`generateVideoHttpTemplate` |
| `src/main/providers/http.ts` | `httpFetch` |
| `src/main/providers/kling-auth.ts` | `createKlingJwt`、`klingAuthorization` |
| `src/main/providers/kling.ts` | `buildKlingBody`、`generateVideoKling` |
| `src/main/providers/media.ts` | `LoadedRef`、`LoadedRefInput`、`normalizeMime`、`dataUrlToBase64`、`toLoadedRef` |
| `src/main/providers/minimax.ts` | `generateVideoMinimax` |
| `src/main/providers/model-body.ts` | `ModelBodyRef`、`ModelBodyContext`、`applyModelRequestBody`、`applyModelRequestForm` |
| `src/main/providers/openai-compat.ts` | `ProviderRuntime`、`AdapterContext`、`ProviderOutput`、`ImageOutput`、`ReferenceImage`、`generateImage`、`generateSpeech`、`ChatMessage`、`chatCompletion`、`generateText`、`generateMusic` |
| `src/main/providers/retry.ts` | `isRetryable`、`sleep`、`withRetry` |
| `src/main/providers/sora.ts` | `generateVideoSora` |
| `src/main/providers/volcengine.ts` | `ImageRef`、`ArkVideoInput`、`generateVideoArk` |
| `src/renderer/src/stores/generation-history.ts` | `GenerationHistoryStatus`、`GenerationHistoryEntry`、`useGenerationHistoryStore` |
| `src/renderer/src/stores/generation.ts` | `useGenerationStore` |
| `src/renderer/src/stores/vision-tasks.ts` | `trackVisionTask`、`subscribeVisionTasks` |
| `src/shared/filters.ts` | `DEFAULT_FILTER`、`FilterPreset`、`FILTER_PRESETS`、`canvasFilterString`、`hasActiveFilter` |
| `src/shared/generation.ts` | `OutputKind`、`ReferenceMedia`、`ReferenceRole`、`VideoRange`、`VideoOperationOptions`、`ReferenceInput`、`LayerBounds`、`LayerBox`、`AssetLayer`、`TextRecognitionStyle`、`TextRecognitionRun`、`TextRecognitionLine`、`TextRecognition`、`GeneratedAsset`、`GenerateRequest`、`GenerationEvent`、`GenerateHandle` |
| `src/shared/http-template.ts` | `HttpTemplateMode`、`HttpTemplateSignType`、`HttpTemplateSign`、`HttpTemplateAuth`、`HttpTemplateMultipartFile`、`HttpTemplateMultipart`、`HttpTemplateSubmit`、`HttpTemplateCondition`、`HttpTemplateConditionalField`、`HttpTemplatePoll`、`HttpTemplate`、`LEGACY_KEYFRAME_VARIABLE_WARNING`、`hasLegacyKeyframeVariables` |
| `src/shared/local-adapter.ts` | `LocalAdapterStatusKind`、`LocalAdapterStatus` |
| `src/shared/media.ts` | `AudioPeaksRequest`、`GridSplitRequest`、`GridSplitResult`、`StitchRequest`、`StitchResult`、`FrameMode`、`ExtractFrameRequest`、`ExtractFrameResult`、`SplitAvRequest`、`SplitAvResult`、`CropVideoRequest`、`CropVideoResult`、`AudioTrimRequest`、`AudioTrimResult`、`AudioSpeedRequest`、`AudioSpeedResult`、`MediaProbe`、`SubtitleRect`、`CropImageRequest`、`CropImageResult`、`CropImageRectRequest`、`RemoveSubtitlesRequest`、`RemoveSubtitlesResult`、`TrimVideoRequest` …（共 37 个） |
| `src/shared/model-contracts.ts` | `ContractTransport`、`ModelContractFields`、`ModelContractTransports`、`ModelContractRoles`、`ModelContractLimits`、`ModelContractSource`、`ModelContract`、`ContractGap`、`AGNES_VIDEO_CONTRACT`、`KLING_VIDEO_CONTRACT`、`MINIMAX_VIDEO_CONTRACT`、`MINIMAX_LEGACY_CONTRACT`、`VOLCENGINE_VIDEO_CONTRACT`、`SORA_VIDEO_CONTRACT`、`OPENAI_COMPAT_CONTRACT`、`HTTP_TEMPLATE_CONTRACT`、`OFFICIAL_CONTRACTS`、`contractForAdapter`、`isOfficialModel`、`contractGapsForAdapter` |
| `src/shared/model-modes.ts` | `ModelModeId`、`MediaKind`、`SlotRole`、`InputSlot`、`OperationSupport`、`ModelModeConfig`、`ModelModeDefinition`、`MODEL_MODE_DEFINITIONS`、`MODEL_MODE_LABEL`、`OPERATION_SUPPORT_LABEL`、`isModelModeId`、`getModelModeDefinition`、`normalizeModeConfig`、`normalizeModelModes`、`modeMediaKinds`、`modeSupportsOperation`、`modeOperationIds`、`highestOperationSupport` |
| `src/shared/param-constraints.ts` | `ParamEvalContext`、`EvaluatedParam`、`evaluateParam`、`applyParamConstraints` |
| `src/shared/param-presets.ts` | `ParamTemplate`、`PARAM_TEMPLATES`、`paramTemplatesFor` |
| `src/shared/protocol-templates.ts` | `ProtocolTemplate`、`ModelRule`、`PROTOCOL_TEMPLATES`、`MODEL_RULES`、`findProtocolTemplate`、`matchModelRule`、`mergeModeConfigs`、`mergeParamDefs`、`applyProtocolTemplate` |
| `src/shared/provider-presets.ts` | `ProviderPreset`、`HOT_PROVIDER_IDS`、`PROVIDER_PRESETS`、`findProviderPresetById`、`findProviderPresetByBaseUrl`、`recommendedModelsForPreset` |
| `src/shared/provider-schema.ts` | `Capability`、`MediaInput`、`MEDIA_INPUTS`、`MEDIA_INPUT_LABEL`、`ProviderType`、`ParamOption`、`ParamCondition`、`ParamForce`、`ParamDeny`、`ParamDef`、`ModelFeature`、`ConfigSource`、`ModelDef`、`ModelInferenceInput`、`inferModelInputs`、`inferModelModes`、`modelModeConfigs`、`modelModeIds`、`modelSupportsMode`、`modelModeMediaKinds`、`modelOperationSupport`、`ModeContext`、`modelModeCompatibility`、`inferActiveMode` …（共 37 个） |
| `src/shared/reference-inputs.ts` | `ReferenceInputContext`、`referenceInputErrors`、`referenceInputError` |
<!-- AUTO:exports:end -->
