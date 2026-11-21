# 05 逐帧拉片

日期：2026-11-19
状态：现行
适用版本：v0.3.2
最后核对：2026-11-19

## 这个模块负责什么

视频拉片、切镜、首/中/尾帧、逐镜理解、确定性取证、分场、角色/场景/风格/音频聚合、复刻建图、分镜表、单镜重跑。

拉片产物直接进入画布：镜头三节点（首帧 / 尾帧 / 文本）、分镜表、角色组、场景组、风格卡、音频组，以及按镜头复刻的普通视频节点。

## 不负责什么

- 不做时间线剪辑（见 03）。
- 不做导演台预演（见 04）。
- 不做 Agent 工具注册（见 06）。
- 不做生成提交；复刻只建图，点生成仍走生成队列。

## 数据结构

`FilmStudy`（v1 兼容层）保留 `frames`、`segments`、`subtitles`、`macroAnalysis` 等旧字段；v2 新增：

- `shots: FilmStudyShot[]`：`index`、`startTime/endTime/duration`、`firstFrame/midFrame/lastFrame`、`clip?`、景别/机位/运镜/光线、`visualDescription`、`actionSummary`、`emotion`、`dialogue`、`sfx`、`production`、`castIds`、`imagePrompt/videoPrompt`、`status`。
- `scenes: FilmStudyScene[]`：`id`、`name`、`shots: [a,b]`、`location/daypart/lighting/palette`、`basePath`。
- `cast: FilmStudyCast[]`：`id/name/role/importance`、`appearance`、`facePath/lookPaths/voicePath`、`shotIndexes`、`generatedRefPath`。
- `style?: FilmStudyStyle`：`look/palette/composition/camera/pacing/prompt`。
- `audio?: FilmStudyAudio`：`bgmPath`、`bgm`、`voicePaths`、`sfx`。
- `mapping?: FilmStudyMapping`：原片角色/场景 → `original` / `node` / `asset`，带 `path/nodeId/name`。

`FilmStudyV2` 的完整类型和校验在 `src/shared/film-study-v2.ts`；旧 study 不迁移。

## 流程

```
源视频节点
  → 拉片节点
  → 切镜（shot-detect.ts：硬切/跳切/溶解/划像/闪白）
  → 首/中/尾帧（auto.ts）
  → 逐镜理解（shots.ts，5 镜一批）
  → 确定性取证（production.ts）
  → VLM 复核低置信镜头（production-review.ts）
  → 角色表（cast.ts）+ 风格档案（style.ts）
  → 分场（scenes.ts，失败每 10 镜兜底）
  → 画布：镜头三节点、分镜表、角色/场景/风格/音频组
  → 复刻：RemakeMappingDialog → 视频节点 + 首/尾/文本连线
```

切镜在 4–8fps 缩略图上计算 64 桶直方图、帧间像素差、变化像素比例和亮度；渐变转场用半分辨率灰度缩略图判断。所有切点都会跳过「前后帧几乎一样」的候选（MAE < 20），避免同构图内的表情/位移被当成新镜头。

## 主进程

| 文件 | 职责 |
|---|---|
| `service.ts` | 抽帧、进度、取消、导出/打包、`study/<id>.json`、单镜重跑、重新分场 |
| `shot-detect.ts` | 切点检测、渐变转场、关键帧辅助 |
| `auto.ts` | 自动拉片编排：切镜、首/中/尾帧、逐镜、取证、角色、风格、分场、输出 |
| `shots.ts` | 5 镜一批逐镜理解；支持单镜重跑 |
| `production.ts` | 确定性取证与标签 |
| `production-review.ts` | 低置信镜头 VLM 复核与融合 |
| `scenes.ts` | VLM 分场与兜底 |
| `cast.ts` | 角色表聚合、抽帧头像占位 |
| `style.ts` | 视觉风格档案 |
| `analysis.ts` | 旧整片分析、SRT、分析包 |

## 渲染进程

| 文件 | 作用 |
|---|---|
| `canvas/nodes/StudyNodeCard.tsx` | 拉片节点卡片：封面、摘要、四段进度、七个产物按钮 |
| `canvas/nodes/FilmStudySheet.tsx` | 分镜表浮层 |
| `canvas/nodes/study-sheet.ts` | 镜头 Markdown、分镜表、风格档案、复刻提示词 |
| `canvas/nodes/RemakeMappingDialog.tsx` | 选角/选景映射 |
| `stores/film-study.ts` | 运行状态、拉片产物、单镜重跑、复刻建图、保存/撤销 |

## 数据流

```
StudyNodeCard → FilmStudyApi.auto
  → main/film-study/auto.ts
  → service（抽帧）→ shot-detect（切点）→ shots（逐镜）→ production（取证）
  → cast/style → scenes
  → study/<id>.json
  → 画布：拉片节点、镜头三节点、分镜表、角色/场景/风格/音频组
  → remakeShot / remakeShots → 普通视频节点 + 连线
```

## 当前状态

| 能力 | 状态 | 证据 |
|---|---|---|
| 切镜（硬切/跳切/溶解/划像/闪白） | 已实现 | `shot-detect.ts`、`shot-detect.test.ts` |
| 首/中/尾帧 | 已实现 | `auto.ts`、`shot_time` 单测 |
| 逐镜理解 | 已实现 | `shots.ts`、`shots.test.ts` |
| 确定性取证 | 已实现 | `production.ts`、`production.test.ts` |
| VLM 复核 | 已实现 | `production-review.ts`、`production-review.test.ts` |
| 分场 | 已实现 | `scenes.ts`、`scenes.test.ts` |
| 角色/风格/音频聚合 | 已实现（角色头像为中间帧占位） | `cast.ts`、`style.ts` |
| 镜头三节点/分镜表 | 已实现 | `StudyNodeCard.tsx`、`study-sheet.ts` |
| 单镜重跑 | 已实现 | `service.ts`、`NodeContextMenu.tsx` |
| 选角/选景与复刻建图 | 已实现 | `RemakeMappingDialog.tsx`、`stores/film-study.ts` |
| 整片复刻 | 已实现（逐镜建图，不自动分组） | `remakeAll` |

## 已知限制

- 逐镜理解、角色表、风格档案依赖视觉模型；未配置时这些字段为空。
- 取证对实拍 / AI / 3D 的区分置信度较低，主要靠 R2 的 VLM 复核；复核也需要模型。
- 角色头像当前取角色首次出现镜头的中间帧，未做裁脸。
- 角色声音样本、音效清单、字幕 OCR、音频分轨尚未接入。
- 切镜阈值的「前后帧 MAE」用一条 AI 战争片标定，建议用真人对话、快剪、动态漫再校准。
- 文件名里的「N 镜」是生成分镜数，不等于成片镜头数。

## 常见改动入口

| 想改什么 | 先看 |
|---|---|
| 切镜/转场 | `src/main/film-study/shot-detect.ts` |
| 抽帧/单镜重跑/分场接口 | `src/main/film-study/service.ts` |
| 自动拉片编排 | `src/main/film-study/auto.ts` |
| 逐镜提示词/Schema | `src/main/film-study/shots.ts` |
| 取证规则 | `src/main/film-study/production.ts` |
| 复核融合 | `src/main/film-study/production-review.ts` |
| 角色/风格/分场 | `src/main/film-study/cast.ts`、`style.ts`、`scenes.ts` |
| 拉片数据 | `src/shared/film-study.ts`、`src/shared/film-study-v2.ts` |
| 拉片卡片/分镜表/复刻面板 | `src/renderer/src/canvas/nodes/StudyNodeCard.tsx`、`study-sheet.ts`、`RemakeMappingDialog.tsx` |
| Store | `src/renderer/src/stores/film-study.ts` |
| Agent 工具 | `src/main/agent/tools/film.ts` |

## 文件与导出（自动生成）

<!-- AUTO:files:start -->
| 文件 | 行数 |
|---|---|
| `src/main/film-study/analysis.ts` | 362 |
| `src/main/film-study/auto.ts` | 881 |
| `src/main/film-study/cast.ts` | 266 |
| `src/main/film-study/production-review.ts` | 304 |
| `src/main/film-study/production.ts` | 239 |
| `src/main/film-study/scenes.ts` | 245 |
| `src/main/film-study/service.ts` | 868 |
| `src/main/film-study/shot-detect.ts` | 529 |
| `src/main/film-study/shots.ts` | 297 |
| `src/main/film-study/style.ts` | 190 |
| `src/renderer/src/stores/film-study.ts` | 965 |
| `src/shared/film-study-v2.ts` | 429 |
| `src/shared/film-study.ts` | 219 |
<!-- AUTO:files:end -->

<!-- AUTO:exports:start -->
| 文件 | 导出 |
|---|---|
| `src/main/film-study/analysis.ts` | `AI_SCHEMA`、`packageFrameName`、`buildAiPrompt`、`buildAiReadme`、`buildAiProject`、`normalizeFilmStudyAnalysis`、`parseSrt`、`buildSrt` |
| `src/main/film-study/auto.ts` | `cancelAutoFilmStudy`、`detectCuts`、`splitByCuts`、`splitByInterval`、`mergeToLimit`、`shotFrameTimes`、`autoFilmStudy` |
| `src/main/film-study/cast.ts` | `buildCastPrompt`、`parseCast`、`attachCastFrames`、`aggregateCast` |
| `src/main/film-study/production-review.ts` | `VlmVerdict`、`buildReviewPrompt`、`parseReview`、`fuseProduction`、`reviewProduction` |
| `src/main/film-study/production.ts` | `ShotFeatures`、`ProductionResult`、`computeShotFeatures`、`classifyProduction`、`analyzeProduction` |
| `src/main/film-study/scenes.ts` | `buildScenePrompt`、`fallbackScenes`、`parseScenes`、`splitScenes` |
| `src/main/film-study/service.ts` | `cancelFilmStudy`、`loadFilmStudy`、`saveFilmStudy`、`createFilmStudyContactSheet`、`exportFilmStudyAnalysisPackage`、`importFilmStudyAnalysis`、`extractFilmStudySubtitles`、`importFilmStudySubtitles`、`analyzeFilmStudy`、`resplitFilmStudyScenes`、`exportFilmStudyBundle`、`buildFilmStudyMarkdown`、`extractFilmStudy` |
| `src/main/film-study/shot-detect.ts` | `FrameStats`、`CutKind`、`DetectedCut`、`GradualTransition`、`analyzeVideoFrames`、`detectGradualTransitions`、`detectShotCuts`、`detectMotionPeaks`、`buildCandidateTimes` |
| `src/main/film-study/shots.ts` | `buildShotPrompt`、`parseShotAnalysis`、`analyzeShots` |
| `src/main/film-study/style.ts` | `buildStylePrompt`、`parseStyle`、`aggregateStyle` |
| `src/renderer/src/stores/film-study.ts` | `useFilmStudyStore` |
| `src/shared/film-study-v2.ts` | `FILM_STUDY_V2_SCHEMA`、`FilmStudyFrame`、`FilmStudyShot`、`FilmStudyScene`、`FilmStudyCast`、`FilmStudyStyle`、`FilmStudyAudio`、`FilmStudyMappingTarget`、`FilmStudyMapping`、`FilmStudyV2`、`FilmStudyV2Input`、`isFilmStudyV2`、`parseFilmStudyV2`、`emptyFilmStudyV2`、`sortScenes` |
| `src/shared/film-study.ts` | `FilmStudyFrame`、`FilmStudySegment`、`FilmStudyMacroAnalysis`、`FilmStudyStoryLine`、`FilmStudyAudiencePoint`、`FilmStudySubtitle`、`FilmStudySummary`、`FilmStudy`、`FilmStudyOutputOptions`、`FilmStudyAutoRequest`、`FilmStudyAutoAsset`、`FilmStudyAutoResult`、`FilmStudyExtractRequest`、`FilmStudyExtractResult`、`FilmStudyExportResult`、`FilmStudyProgress` |
<!-- AUTO:exports:end -->
