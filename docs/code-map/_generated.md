# 代码地图附录（自动生成）

> 由 `scripts/gen-code-map.mjs` 生成，不要手工修改。
> 更新：`corepack pnpm map:code`；校验：`corepack pnpm check:code-map`。

## 模块规模

| 编号 | 模块 | 文件 | 行数 |
|---|---|---|---|
| 01 | [画布](./01-canvas.md) | 74 | 25712 |
| 02 | [生成与模型](./02-generation.md) | 67 | 14635 |
| 03 | [剪辑室](./03-clip-studio.md) | 44 | 9453 |
| 04 | [导演台与白模预演](./04-director-stage.md) | 47 | 20219 |
| 05 | [逐帧拉片](./05-film-study.md) | 13 | 5803 |
| 06 | [CineBot 与 Agent](./06-agent.md) | 68 | 21068 |
| 07 | [存储、IPC 与安全](./07-storage-ipc.md) | 68 | 12396 |
| 10 | [UI 组件与面板](./10-ui.md) | 51 | 11007 |

> 只统计互斥归属的目录/文件；renderer 的节点组件统一归 01，其他模块在正文中引用。

## IPC 接口

| 接口 | 方法 |
|---|---|
| `ProjectApi` | `bootstrap`、`create`、`open`、`saveCanvas`、`recent`、`readCover`、`setCoverFromLocal`、`setCoverFromAsset`、`removeCover`、`pickCreate`、`pickOpen`、`reveal`、`rename`、`createCanvas`、`switchCanvas`、`renameCanvas`、`deleteCanvas`、`delete` |
| `SettingsApi` | `listProviders`、`saveProvider`、`deleteProvider`、`testConnection`、`fetchModels`、`modelsConfig`、`pendingModels`、`applyPendingModels`、`discardPendingModels`、`onModelsPending`、`openModelsFile`、`downloadModelSkill`、`copyText`、`getOperationBindings`、`saveOperationBindings`、`getPreferences`、`savePreferences`、`resetPreferences`、`exportPreferences`、`importPreferences`、`chooseProjectDir`、`openDataDir`、`onModelsChanged` |
| `GenerateApi` | `run`、`cancel`、`cancelAll`、`onEvent` |
| `LibraryApi` | `root`、`chooseRoot`、`resetRoot`、`revealRoot`、`tree`、`listAssets`、`listAllAssets`、`createFolder`、`renameFolder`、`deleteFolder`、`importAssets`、`addAsset`、`renameAsset`、`moveAsset`、`deleteAsset`、`setAssetTags`、`reveal`、`listCharacters`、`listStyles`、`saveStyle`、`deleteStyle`、`pickStyleCover`、`saveAssets`、`listTemplates`、`saveTemplate`、`deleteTemplate`、`thumbCacheInfo`、`clearThumbCache` |
| `ClipboardApi` | `read` |
| `ExportApi` | `project`、`canvasPng`、`asset`、`deleteFile`、`assets`、`concatVideos`、`pickFile` |
| `MediaApi` | `splitGrid`、`stitch`、`extractFrame`、`splitAv`、`startStemTask`、`cancelStemTask`、`onStemTaskEvent`、`cropVideo`、`probe`、`exists`、`existsMany`、`thumbnail`、`proxy`、`audioPeaks`、`listSounds`、`importSound`、`cropImage`、`cropImageRect`、`trimVideo`、`trimAudio`、`audioSpeed`、`removeSubtitles`、`detectSubtitleRect`、`captureDepth`、`startDepthCapture`、`cancelDepthCapture`、`onDepthCaptureEvent`、`startVisionTask`、`cancelVisionTask`、`onVisionTaskEvent` |
| `ComponentsApi` | `status`、`install`、`pause`、`remove`、`onEvent` |
| `TimelineApi` | `load`、`save`、`duplicate`、`exportVtt`、`export`、`cancelExport`、`onExportProgress`、`onTimelineChanged`、`transcribe`、`cancelTranscribe`、`onTranscribeProgress`、`analyze`、`importSubtitles` |
| `FilmStudyApi` | `extract`、`auto`、`cancel`、`load`、`save`、`exportMarkdown`、`exportAnalysisPackage`、`exportBundle`、`importAnalysis`、`extractSubtitles`、`importSubtitles`、`analyze`、`rerunShot`、`splitScenes`、`contactSheet`、`onProgress` |
| `AgentApi` | `chat`、`cancel`、`toolResult`、`confirm`、`sessionLoad`、`sessionList`、`sessionCreate`、`sessionRename`、`sessionDelete`、`sessionCompact`、`modelInfo`、`textModels`、`models`、`proposalCreate`、`proposalActive`、`proposalSubmit`、`proposalCancel`、`onEvent`、`onToolCall` |
| `SkillsApi` | `list`、`files`、`readFile`、`create`、`save`、`remove`、`uploadFiles`、`removeFile`、`clone`、`setOverride`、`pickImport`、`installImport`、`discardImport`、`openDirectory`、`openFile` |
| `StageApi` | `create`、`load`、`save`、`delete`、`duplicate`、`capture`、`exportPreview`、`cancelExport`、`onExportProgress` |
| `SceneApi` | `analyze`、`loadObjectPresets`、`saveObjectPresets`、`importObjectPresets`、`exportObjectPresets`、`uploadImage` |
| `LocalAdapterApi` | `list`、`reload`、`openDir`、`onChanged` |
| `McpApi` | `onCommand`、`sendResult`、`status`、`config`、`resetToken`、`revealConfig`、`copy` |

## Agent 工具

| 工具 | id | 需确认 | 只读 |
|---|---|---|---|
| `canvas_get` | `canvas.get` |  | 是 |
| `canvas_remove_edge` | `canvas.removeEdge` | 是 |  |
| `canvas_update_text` | `canvas.updateText` | 是 |  |
| `canvas_update_title` | `canvas.updateTitle` |  |  |
| `canvas_move_node` | `canvas.moveNode` |  |  |
| `canvas_add_node` | `canvas.addNode` |  |  |
| `canvas_connect` | `canvas.connect` |  |  |
| `canvas_delete_node` | `canvas.deleteNode` | 是 |  |
| `canvas_group` | `canvas.group` |  |  |
| `canvas_ungroup` | `canvas.ungroup` |  |  |
| `canvas_node_operations` | `canvas.nodeOperations` |  | 是 |
| `canvas_node_operation` | `canvas.nodeOperation` |  |  |
| `capability_catalog` | `capability.catalog` |  | 是 |
| `capability_search` | `capability.search` |  | 是 |
| `film_study_get` | `film.studyGet` |  | 是 |
| `film_study_get_shot` | `film.studyGetShot` |  | 是 |
| `film_study_update_shot` | `film.studyUpdateShot` |  |  |
| `film_study_remake` | `film.studyRemake` | 是 |  |
| `film_study_split_scenes` | `film.studySplitScenes` | 是 |  |
| `film_study_map_cast` | `film.studyMapCast` |  |  |
| `film_study_build_timeline` | `film.studyBuildTimeline` | 是 |  |
| `film_study_auto` | `film.studyAuto` | 是 |  |
| `film_study_export` | `film.studyExport` |  |  |
| `film_study_update_segment` | `film.studyUpdateSegment` |  |  |
| `film_study_extract_subtitles` | `film.studyExtractSubtitles` | 是 |  |
| `generation_catalog` | `generation.catalog` |  | 是 |
| `library_search` | `library.search` |  | 是 |
| `generation_propose` | `generation.propose` |  |  |
| `preset_list` | `library.presetList` |  | 是 |
| `preset_search` | `library.presetSearch` |  | 是 |
| `preset_read` | `library.presetRead` |  | 是 |
| `style_list` | `library.styleList` |  | 是 |
| `style_search` | `library.styleSearch` |  | 是 |
| `style_read` | `library.styleRead` |  | 是 |
| `preset_create` | `library.presetCreate` | 是 |  |
| `preset_update` | `library.presetUpdate` | 是 |  |
| `preset_delete` | `library.presetDelete` | 是 |  |
| `style_create` | `library.styleCreate` | 是 |  |
| `style_update` | `library.styleUpdate` | 是 |  |
| `style_delete` | `library.styleDelete` | 是 |  |
| `asset_ingest` | `media.assetIngest` | 是 |  |
| `stem_separate` | `media.stemSeparate` | 是 |  |
| `project_create` | `project.create` | 是 |  |
| `project_open` | `project.open` | 是 |  |
| `project_export` | `project.export` | 是 |  |
| `skill_toggle` | `skill.toggle` | 是 |  |
| `skill_create` | `skill.create` | 是 |  |
| `skill_import` | `skill.import` | 是 |  |
| `skill_list` | `skill.list` |  | 是 |
| `skill_read` | `skill.read` |  | 是 |
| `stage_get` | `stage.get` |  | 是 |
| `stage_capabilities` | `stage.capabilities` |  | 是 |
| `stage_add_object` | `stage.addObject` |  |  |
| `stage_transform_object` | `stage.transformObject` |  |  |
| `stage_add_camera` | `stage.addCamera` |  |  |
| `stage_transform_camera` | `stage.transformCamera` |  |  |
| `stage_add_shot` | `stage.addShot` |  |  |
| `stage_update_shot` | `stage.updateShot` |  |  |
| `stage_remove_shot` | `stage.removeShot` | 是 |  |
| `stage_set_camera_track` | `stage.setCameraTrack` | 是 |  |
| `stage_set_background` | `stage.setBackground` |  |  |
| `stage_update_object` | `stage.updateObject` |  |  |
| `stage_export_preview` | `stage.exportPreview` | 是 |  |
| `stage_set_active_camera` | `stage.setActiveCamera` |  |  |
| `stage_remove_object` | `stage.removeObject` | 是 |  |
| `stage_set_shot_intent` | `stage.setShotIntent` |  |  |
| `stage_clear_shot_intent` | `stage.clearShotIntent` |  |  |
| `stage_auto_coverage` | `stage.autoCoverage` |  |  |
| `stage_dialogue_coverage` | `stage.dialogueCoverage` |  |  |
| `stage_set_world` | `stage.setWorld` |  |  |
| `stage_add_objects` | `stage.addObjects` |  |  |
| `stage_randomize_world` | `stage.randomizeWorld` |  |  |
| `stage_from_scene_image` | `stage.fromSceneImage` |  |  |
| `stage_capture` | `stage.capture` | 是 |  |
| `timeline_get` | `timeline.get` |  | 是 |
| `timeline_set_video` | `timeline.setVideo` |  |  |
| `timeline_select_clips` | `timeline.selectClips` |  | 是 |
| `timeline_move_clips` | `timeline.moveClips` |  |  |
| `timeline_trim_clip` | `timeline.trimClip` |  |  |
| `timeline_split_clips` | `timeline.splitClips` |  |  |
| `timeline_split_by_shots` | `timeline.splitByShots` | 是 |  |
| `timeline_beat_markers` | `timeline.beatMarkers` |  |  |
| `timeline_beat_split` | `timeline.beatSplit` | 是 |  |
| `timeline_remove_clips` | `timeline.removeClips` | 是 |  |
| `timeline_update_clip` | `timeline.updateClip` |  |  |
| `timeline_set_track` | `timeline.setTrack` |  |  |
| `timeline_add_marker` | `timeline.addMarker` |  |  |
| `timeline_auto_subtitles` | `timeline.autoSubtitles` |  |  |
| `timeline_remove_silence` | `timeline.removeSilence` | 是 |  |
| `timeline_set_transition` | `timeline.setTransition` |  |  |
| `timeline_export` | `timeline.export` | 是 |  |
| `timeline_export_subtitles` | `timeline.exportSubtitles` | 是 |  |

## 节点组件

| 文件 |
|---|
| `AiOperationDialog.tsx` |
| `AudioActionBar.tsx` |
| `AudioPlayer.tsx` |
| `CineNodeView.tsx` |
| `CropDialog.tsx` |
| `DepthCaptureDialog.tsx` |
| `FilmNodeView.tsx` |
| `FilmStudyInsights.tsx` |
| `FilmStudySheet.tsx` |
| `GroupNodeView.tsx` |
| `MaskEditorDialog.tsx` |
| `ModelConfigDialog.tsx` |
| `NodeToolbar.tsx` |
| `PanoramaViewer.tsx` |
| `RemakeMappingDialog.tsx` |
| `SphereDialog.tsx` |
| `StageNodeView.tsx` |
| `StudioNodeView.tsx` |
| `StudyNodeCard.tsx` |
| `SubtitleDialog.tsx` |
| `TextEditorDialog.tsx` |
| `ToolbarSettings.tsx` |
| `TrimDialog.tsx` |
| `VideoOpNodeView.tsx` |
| `VideoPlayer.tsx` |
| `VideoPreview.tsx` |

## 测试清单

- `src/main/__tests__/capability-audit.test.ts`
- `src/main/__tests__/protocol.test.ts`
- `src/main/agent/__tests__/capabilities.test.ts`
- `src/main/agent/__tests__/compact.test.ts`
- `src/main/agent/__tests__/model.test.ts`
- `src/main/agent/__tests__/proposals.test.ts`
- `src/main/agent/__tests__/session.test.ts`
- `src/main/agent/__tests__/skills-admin.test.ts`
- `src/main/agent/__tests__/skills-import.test.ts`
- `src/main/agent/__tests__/tools.test.ts`
- `src/main/agent/pi/__tests__/events.test.ts`
- `src/main/agent/pi/__tests__/model-runtime.test.ts`
- `src/main/agent/pi/__tests__/session-lock.test.ts`
- `src/main/agent/pi/__tests__/session.test.ts`
- `src/main/agent/pi/__tests__/tools.test.ts`
- `src/main/components/__tests__/manifest.test.ts`
- `src/main/components/__tests__/zip-extract.test.ts`
- `src/main/engine/__tests__/generation-error.test.ts`
- `src/main/export/__tests__/project-export.test.ts`
- `src/main/film-study/__tests__/analysis.test.ts`
- `src/main/film-study/__tests__/auto.test.ts`
- `src/main/film-study/__tests__/cast.test.ts`
- `src/main/film-study/__tests__/package.test.ts`
- `src/main/film-study/__tests__/production-review.test.ts`
- `src/main/film-study/__tests__/production.test.ts`
- `src/main/film-study/__tests__/scenes.test.ts`
- `src/main/film-study/__tests__/shot-detect.test.ts`
- `src/main/film-study/__tests__/shots.test.ts`
- `src/main/film-study/__tests__/style.test.ts`
- `src/main/ipc/__tests__/index.test.ts`
- `src/main/library/__tests__/store.test.ts`
- `src/main/library/__tests__/tag-utils.test.ts`
- `src/main/local-adapters/__tests__/build.test.ts`
- `src/main/local-adapters/__tests__/manifest.test.ts`
- `src/main/mcp/__tests__/catalog.test.ts`
- `src/main/media/__tests__/concat.test.ts`
- `src/main/media/__tests__/paths.test.ts`
- `src/main/media/__tests__/range.test.ts`
- `src/main/media/__tests__/stem-tasks.test.ts`
- `src/main/project/__tests__/manager.test.ts`
- `src/main/providers/__tests__/agnes.test.ts`
- `src/main/providers/__tests__/golden-bodies.test.ts`
- `src/main/providers/__tests__/headers.test.ts`
- `src/main/providers/__tests__/http-template-dsl.test.ts`
- `src/main/providers/__tests__/http-template.test.ts`
- `src/main/providers/__tests__/media.test.ts`
- `src/main/providers/__tests__/minimax.test.ts`
- `src/main/providers/__tests__/model-body.test.ts`
- `src/main/providers/__tests__/sora.test.ts`
- `src/main/providers/__tests__/volcengine.test.ts`
- `src/main/security/__tests__/external-url.test.ts`
- `src/main/security/__tests__/navigation.test.ts`
- `src/main/settings/__tests__/models-config.test.ts`
- `src/main/stage/__tests__/storage.test.ts`
- `src/main/update/__tests__/fallback.test.ts`
- `src/renderer/src/agent/__tests__/filmBridge.test.ts`
- `src/renderer/src/agent/__tests__/timelineBridge.test.ts`
- `src/renderer/src/canvas/__tests__/media-size.test.ts`
- `src/renderer/src/canvas/__tests__/promptbar-model.test.ts`
- `src/renderer/src/canvas/nodes/__tests__/node-operations.test.ts`
- `src/renderer/src/canvas/nodes/__tests__/study-sheet.test.ts`
- `src/renderer/src/canvas/nodes/__tests__/text-markdown.test.ts`
- `src/renderer/src/components/ui/native-controls.test.ts`
- `src/renderer/src/stores/__tests__/canvas.test.ts`
- `src/renderer/src/stores/__tests__/edge-references.test.ts`
- `src/shared/__tests__/agent-proposal.test.ts`
- `src/shared/__tests__/agent-tools.test.ts`
- `src/shared/__tests__/audio-fx.test.ts`
- `src/shared/__tests__/canvas-commands.test.ts`
- `src/shared/__tests__/canvas-schema.test.ts`
- `src/shared/__tests__/canvas-summary.test.ts`
- `src/shared/__tests__/capabilities.test.ts`
- `src/shared/__tests__/film-study-v2.test.ts`
- `src/shared/__tests__/filters.test.ts`
- `src/shared/__tests__/model-contracts.test.ts`
- `src/shared/__tests__/model-inputs.test.ts`
- `src/shared/__tests__/model-modes.test.ts`
- `src/shared/__tests__/node-operation-specs.test.ts`
- `src/shared/__tests__/preferences.test.ts`
- `src/shared/__tests__/previs-room.test.ts`
- `src/shared/__tests__/previs-world.test.ts`
- `src/shared/__tests__/prompt-preset.test.ts`
- `src/shared/__tests__/protocol-templates.test.ts`
- `src/shared/__tests__/reference-inputs.test.ts`
- `src/shared/__tests__/scene-draft.test.ts`
- `src/shared/__tests__/shortcuts.test.ts`
- `src/shared/__tests__/skills.test.ts`
- `src/shared/__tests__/stage-commands.test.ts`
- `src/shared/__tests__/stage-lighting.test.ts`
- `src/shared/__tests__/stage-preview.test.ts`
- `src/shared/__tests__/stage-program.test.ts`
- `src/shared/__tests__/stage-shot-intent.test.ts`
- `src/shared/__tests__/stage-timeline.test.ts`
- `src/shared/__tests__/style-prompt.test.ts`
- `src/shared/__tests__/style-schema.test.ts`
- `src/shared/__tests__/subtitles.test.ts`
- `src/shared/__tests__/timeline-canvas.test.ts`
- `src/shared/__tests__/timeline-commands.test.ts`
- `src/shared/__tests__/timeline-edit.test.ts`
- `src/shared/__tests__/timeline-history.test.ts`
- `src/shared/__tests__/timeline-keyframes.test.ts`
- `src/shared/__tests__/timeline-layout.test.ts`
- `src/shared/__tests__/timeline-schema.test.ts`
- `src/shared/__tests__/timeline-snap.test.ts`
- `src/shared/__tests__/timeline-tools.test.ts`
- `src/shared/__tests__/timeline-transition.test.ts`
