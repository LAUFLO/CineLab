# 05 拉片室

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

## 这个模块负责什么

视频拉片、自动分镜、分镜表、动态切片、BGM、分析包导入导出。

## 不负责什么

- 不做时间线剪辑（见 03）。
- 不做导演台预演（见 04）。
- 不做 Agent 工具注册（见 06）。

## 数据结构

`FilmStudy`：

- `schemaVersion: 1`、`id`、`sourceNodeId/sourcePath/sourceScope/sourceName`；
- `duration`、`fps`、`frameInterval`；
- `frames: FilmStudyFrame[]`（索引、时间、图片路径、备注）；
- `segments: FilmStudySegment[]`；
- `macroAnalysis?`、`storyLines?`、`audienceCurvePoints?`、`subtitles?`；
- `analysisModel?`、`autoAnalyzedAt?`、`aiImportedAt?`、`createdAt/updatedAt`。

`FilmStudySegment` 是核心：`startTime/endTime/title/type`、`segmentFunction/keyBeats/creativeIntent/techniques/audienceExperience`、`structureRole`、`shotSize/cameraAngle/cameraMove/lighting`、`visualDescription/imagePrompt`、`voiceOver/musicCue`、`coverFile`。

`FilmStudyOutputOptions`：`storyboard`（分镜组）、`sheet`（分镜表）、`motion`（动态切片）、`music`（BGM）。

## 流程

```
源视频节点
  → 抽帧（service.ts，0.25–60s 间隔，最多 3000 帧）
  → 镜头检测（shot-detect.ts，灰度直方图 + 像素差 + 亮度）
  → 自动分镜（auto.ts）
  → AI 描述（analysis.ts，可选视觉模型）
  → 输出：
      分镜组（每镜代表帧）
      分镜表（Markdown）
      动态切片（每镜一段视频）
      BGM（整条音轨）
```

镜头检测：`shot-detect.ts` 以 4–8fps 抽缩略图，计算 64 桶灰度直方图、帧间像素差、变化像素比例、平均亮度，输出 `DetectedCut`（`cut` / `jump` / `motion`，带分数）。`interval=0` 表示自动检测，其余为固定间隔。

## 主进程

| 文件 | 职责 |
|---|---|
| `service.ts` | 抽帧、进度、取消、导出/打包、`study/<id>.json` 与 `assets/study/<id>/frames` |
| `shot-detect.ts` | 镜头切点检测 |
| `auto.ts` | 自动拉片编排：检测、抽帧、AI 描述、输出节点 |
| `analysis.ts` | AI Schema、提示词、SRT 解析/生成、分析包与 README |

## 渲染进程

| 文件 | 作用 |
|---|---|
| `canvas/nodes/FilmNodeView.tsx` | 拉片节点卡片、开始/取消/重试 |
| `canvas/nodes/FilmStudyRoom.tsx` | 拉片室全屏（播放器 + 帧时间轴 + 笔记） |
| `canvas/nodes/FilmStudySheet.tsx` | 分镜表浮层（只读表格、复制提示词、导出 Markdown） |
| `canvas/nodes/StudyNodeCard.tsx` | 分镜组/分镜表节点 |
| `canvas/nodes/study-sheet.ts` | 分镜表 Markdown/表格生成 |
| `stores/film-study.ts` | 运行状态、打开房间/表格、撤销、保存 |

## 数据流

```
FilmNodeView
  → FilmStudyApi.auto
  → main/film-study/auto.ts
  → service（抽帧）→ shot-detect（切点）→ analysis（AI）
  → study/<id>.json
  → 画布：拉片节点、分镜组、分镜表、切片、BGM
```

## 当前状态

| 能力 | 状态 | 证据 |
|---|---|---|
| 抽帧/进度/取消 | 已实现 | `service.ts`、`package.test.ts` |
| 镜头检测 | 已实现 | `shot-detect.ts`、`shot-detect.test.ts` |
| 自动分镜/分析 | 已实现 | `auto.ts`、`auto.test.ts` |
| 分镜表/分析包 | 已实现 | `analysis.test.ts`、`FilmStudySheet.tsx` |
| 动态切片/BGM | 已实现 | `FilmStudyAutoResult.motionClips`、`music` 输出 |
| 拉片室/浮层 | 已实现 | `FilmStudyRoom.tsx`、`FilmStudySheet.tsx` |

## 已知限制

- 拉片分析依赖视觉模型配置；未配置时只能做镜头检测，AI 字段为空。
- 抽帧上限 3000 帧、间隔 0.25–60s；超长视频需要分段或加大间隔。
- 分镜表是分析结果，不是导演台的可拍摄分镜；需要预演时转到 04。
- 动态切片按分镜顺序生成，切片边界来自检测结果，可能需手工微调。

## 常见改动入口

| 想改什么 | 先看 |
|---|---|
| 抽帧/导出/打包 | `src/main/film-study/service.ts` |
| 镜头检测 | `src/main/film-study/shot-detect.ts` |
| 自动拉片编排 | `src/main/film-study/auto.ts` |
| AI 提示词/Schema/SRT | `src/main/film-study/analysis.ts` |
| 拉片数据 | `src/shared/film-study.ts` |
| 拉片节点/房间/表格 | `src/renderer/src/canvas/nodes/Film*.tsx`、`StudyNodeCard.tsx` |
| Store | `src/renderer/src/stores/film-study.ts` |
| Agent 工具 | `src/main/agent/tools/film.ts` |

## 文件与导出（自动生成）

<!-- AUTO:files:start -->
| 文件 | 行数 |
|---|---|
| `src/main/film-study/analysis.ts` | 362 |
| `src/main/film-study/auto.ts` | 710 |
| `src/main/film-study/service.ts` | 753 |
| `src/main/film-study/shot-detect.ts` | 308 |
| `src/renderer/src/stores/film-study.ts` | 531 |
| `src/shared/film-study.ts` | 199 |
<!-- AUTO:files:end -->

<!-- AUTO:exports:start -->
| 文件 | 导出 |
|---|---|
| `src/main/film-study/analysis.ts` | `AI_SCHEMA`、`packageFrameName`、`buildAiPrompt`、`buildAiReadme`、`buildAiProject`、`normalizeFilmStudyAnalysis`、`parseSrt`、`buildSrt` |
| `src/main/film-study/auto.ts` | `cancelAutoFilmStudy`、`detectCuts`、`splitByCuts`、`splitByInterval`、`mergeToLimit`、`autoFilmStudy` |
| `src/main/film-study/service.ts` | `cancelFilmStudy`、`loadFilmStudy`、`saveFilmStudy`、`createFilmStudyContactSheet`、`exportFilmStudyAnalysisPackage`、`importFilmStudyAnalysis`、`extractFilmStudySubtitles`、`importFilmStudySubtitles`、`analyzeFilmStudy`、`exportFilmStudyBundle`、`buildFilmStudyMarkdown`、`extractFilmStudy` |
| `src/main/film-study/shot-detect.ts` | `FrameStats`、`CutKind`、`DetectedCut`、`analyzeVideoFrames`、`detectShotCuts`、`detectMotionPeaks`、`buildCandidateTimes` |
| `src/renderer/src/stores/film-study.ts` | `useFilmStudyStore` |
| `src/shared/film-study.ts` | `FilmStudyFrame`、`FilmStudySegment`、`FilmStudyMacroAnalysis`、`FilmStudyStoryLine`、`FilmStudyAudiencePoint`、`FilmStudySubtitle`、`FilmStudySummary`、`FilmStudy`、`FilmStudyOutputOptions`、`FilmStudyAutoRequest`、`FilmStudyAutoAsset`、`FilmStudyAutoResult`、`FilmStudyExtractRequest`、`FilmStudyExtractResult`、`FilmStudyExportResult`、`FilmStudyProgress` |
<!-- AUTO:exports:end -->
