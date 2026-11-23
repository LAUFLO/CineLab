# 04 导演台与白模预演

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

## 这个模块负责什么

3D 片场、机位、镜头、语义镜头、程序化世界、整片/每镜预演、人物动作、光照预设、场景图→白膜。

## 不负责什么

- 不做视频生成（见 02）。
- 不做时间线剪辑（见 03）。
- 不做拉片/自动分镜分析（见 05）。
- 不做 Agent 工具注册与提案（见 06）。

## 常见改动入口

| 想改什么 | 先看 |
|---|---|
| 场景/机位/镜头/成片数据 | `src/shared/stage-schema.ts` |
| 命令与撤销 | `src/shared/stage-commands.ts` |
| 语义镜头求解 | `src/shared/stage-shot-intent.ts` |
| 相机插值 | `src/shared/stage-timeline.ts` |
| 整片时间线 | `src/shared/stage-program.ts` |
| 光照预设 | `src/shared/stage-lighting.ts` |
| 人物动作 | `src/shared/stage-motions.ts`、`src/renderer/src/stage/stage-figure.ts` |
| 自动分镜 | `src/shared/stage-auto-coverage.ts` |
| 按对白分镜 | `src/shared/stage-dialogue.ts` |
| 镜头表 | `src/shared/stage-shot-list.ts` |
| 程序化世界 | `src/shared/previs/`、`src/renderer/src/stage/world-content.ts` |
| 场景图→白膜 | `src/main/scene/analyze.ts`、`src/shared/scene-draft.ts` |
| 预演导出 | `src/main/stage/export.ts`、`src/renderer/src/stage/stage-render.ts` |
| 导演台 UI | `src/renderer/src/stage/StageWindow.tsx`、`StageViewport.tsx` |
| Agent 工具 | `src/main/agent/tools/stage.ts` |

## 数据模型

`DirectorStageDoc`：

- `objects: StageObject[]`：human / box / sphere / plane / gltf / crowd；位置、旋转、缩放、姿势、颜色、可见性。
- `cameras: StageCamera[]`：位置、注视点、FOV、画幅。
- `shots: StageShot[]`：绑定机位、时长、画幅、机位关键帧、动作轨、`intent`（语义镜头）、`caption`（台词/备注）。
- `program?: StageProgram`：成片顺序与重叠。
- `lighting?: StageLightingOverride`：手调光照。
- `background`：纯色 / 全景图 / 模型。
- `world?: PrevisWorldRef`：程序化世界引用（独立文件 `stages/<id>.world.json`）。

`StageProgramEntry`：`shotId`、`startMs?`（缺省接上一条）、`front?`（重叠优先级）。
`StageProgram`：`version: 1`、`entries`。

关键常量（`STAGE_LIMITS`）：500 对象、24 机位、100 镜头、单镜 15 秒、相机 100 关键帧、动作 500 关键帧、成片 200 条。

## 数据流

```
画布导演台节点
  → StageWindow（全屏）
  → stageStore.applyCommands(StageCommand[])
  → StageDoc
  → main/stage/storage.ts
  → stages/<stageId>.json + stages/<stageId>.world.json

播放：
stageStore.playbackScope = 'shot' | 'program'
  → programAt(buildProgramTimeline(doc), programMs)
  → 当前 shot + shotTimeMs
  → StageViewport 采样相机

整片/每镜导出：
StageWindow → stage.exportPreview({ scope: 'program', items })
  → main/stage/export.ts exportStageProgram
  → 隐藏 BrowserWindow + stage-render.html
  → 整片视频 + 每镜片段 + 每镜关键帧 + 鸟瞰 + 镜头表/脚本
  → ingestAsset → 画布节点

单镜导出：
StageWindow → stage.exportPreview({ scope: 'shot', shotId })
  → exportStagePreview（旧路径，兼容）

场景图 → 白膜：
StageWindow → scene.analyze
  → VLM 输出场景 JSON
  → scene-draft 校验 → scene-calibrate 校准
  → PrevisWorldRef + StageObject[]
  → stageStore.applyCommands
```

## 对外接口

### IPC

- `stage.create / load / save / delete / duplicate`
- `stage.capture`（截图）
- `stage.exportPreview`（单镜或整片；`scope` 缺省 `shot`，支持 `items`、`frameDensity`）
- `stage.cancelExport`、`stage.onExportProgress`
- `scene.analyze`（场景图解析）

### Agent 工具

- 读取：`stage_get`、`stage_capabilities`
- 对象：`stage_add_object`、`stage_update_object`、`stage_transform_object`、`stage_remove_object`
- 机位：`stage_add_camera`、`stage_transform_camera`、`stage_set_active_camera`
- 镜头：`stage_add_shot`、`stage_update_shot`、`stage_remove_shot`、`stage_set_camera_track`
- 语义镜头：`stage_set_shot_intent`、`stage_clear_shot_intent`
- 自动分镜：`stage_auto_coverage`、`stage_dialogue_coverage`
- 世界：`stage_set_world`、`stage_randomize_world`
- 场景图：`stage_from_scene_image`
- 导出：`stage_export_preview`

完整参数见 [_generated.md](_generated.md) 与 `docs/agent-capabilities.md`。

## 当前状态

| 能力 | 状态 | 证据 |
|---|---|---|
| StageDoc / 机位 / 镜头 / 关键帧 | 已实现 | `src/shared/stage-schema.ts` |
| Hermite 相机插值 | 已实现 | `src/shared/stage-timeline.ts`、`stage-timeline.test.ts` |
| 语义镜头求解 | 已实现 | `src/shared/stage-shot-intent.ts`、`stage-shot-intent.test.ts` |
| 程序化世界 | 已实现 | `src/shared/previs/`、`previs-world.test.ts` |
| 整片时间线/重叠优先级 | 已实现 | `src/shared/stage-program.ts`、`stage-program.test.ts` |
| 整片播放 | 已实现 | `stageStore.playbackScope/programMs`、`StageViewport` |
| 整片/每镜导出 | 已实现 | `src/main/stage/export.ts`、`StageExportItems` |
| 每镜关键帧/鸟瞰/镜头表/脚本 | 已实现 | `src/shared/stage-shot-list.ts`、`export.ts` |
| 10 个光照预设 | 已实现 | `src/shared/stage-lighting.ts`、`StageWindow` |
| 13 关节骨架 + 17 个动作 | 已实现 | `src/shared/stage-motions.ts`、`stage-figure.ts` |
| 自动分镜 | 已实现 | `src/shared/stage-auto-coverage.ts`、`StageTimeline` |
| 按对白分镜 | 已实现 | `src/shared/stage-dialogue.ts`、`StageTimeline` |
| 场景图→白膜 | 部分实现 | VLM 有；深度校准未接 |
| `gltf` 对象类型 | 部分实现 | wireframe 占位，未接 GLTFLoader |

## 已知限制

- `gltf` 类型仍不可用，选中时应提示，而不是静默用 wireframe 人形。
- 场景图的深度校准未接入，比例可能失准。
- 舞台对象没有影视资产库（只有基础几何/人群/程序化世界）。
- 整片导出逐帧渲染，时长与分辨率决定耗时；取消会清理临时文件。
- 成片最多 200 条 entry，单镜 15 秒。

## 下一步

`docs/stage-previs-upgrade-plan.md` 的 M1–M6 已实施。后续可选项：

1. glTF 加载（P2）；
2. 场景图深度校准（P2）；
3. 四视图/EDL（按需）；
4. 影视资产库（不做，保持盒子白模定位）。

## 文件与导出（自动生成）

<!-- AUTO:files:start -->
| 文件 | 行数 |
|---|---|
| `src/main/scene/analyze.ts` | 200 |
| `src/main/scene/object-presets.ts` | 71 |
| `src/main/stage/export.ts` | 816 |
| `src/main/stage/storage.ts` | 168 |
| `src/renderer/src/stage/ShotInspector.tsx` | 292 |
| `src/renderer/src/stage/StageInspector.tsx` | 413 |
| `src/renderer/src/stage/StageTimeline.tsx` | 730 |
| `src/renderer/src/stage/StageViewport.tsx` | 702 |
| `src/renderer/src/stage/StageWindow.tsx` | 966 |
| `src/renderer/src/stage/WorldSettingsDialog.tsx` | 528 |
| `src/renderer/src/stage/preview-runner.ts` | 202 |
| `src/renderer/src/stage/stage-active.ts` | 10 |
| `src/renderer/src/stage/stage-figure.ts` | 143 |
| `src/renderer/src/stage/stage-from-scene.ts` | 95 |
| `src/renderer/src/stage/stage-render.ts` | 389 |
| `src/renderer/src/stage/stage-scene.ts` | 91 |
| `src/renderer/src/stage/stage-world-scene.ts` | 38 |
| `src/renderer/src/stage/stageStore.ts` | 814 |
| `src/renderer/src/stage/world-content.ts` | 1615 |
| `src/renderer/src/stage/world-palette.ts` | 70 |
| `src/renderer/src/stage/world-themes.ts` | 444 |
| `src/renderer/src/stage/world-vehicles.ts` | 92 |
| `src/shared/previs/coords.ts` | 43 |
| `src/shared/previs/interior.ts` | 221 |
| `src/shared/previs/motion-spline.ts` | 85 |
| `src/shared/previs/plan-core.ts` | 3229 |
| `src/shared/previs/room.ts` | 490 |
| `src/shared/previs/set-builder.ts` | 222 |
| `src/shared/previs/vehicles.ts` | 708 |
| `src/shared/previs/world-gen.ts` | 1360 |
| `src/shared/previs/world-plan.ts` | 661 |
| `src/shared/previs/world-water.ts` | 201 |
| `src/shared/scene-analyze.ts` | 25 |
| `src/shared/scene-calibrate.ts` | 71 |
| `src/shared/scene-draft.ts` | 129 |
| `src/shared/scene-object-presets.ts` | 162 |
| `src/shared/stage-auto-coverage.ts` | 205 |
| `src/shared/stage-commands.ts` | 989 |
| `src/shared/stage-dialogue.ts` | 142 |
| `src/shared/stage-lighting.ts` | 275 |
| `src/shared/stage-motions.ts` | 444 |
| `src/shared/stage-preview.ts` | 52 |
| `src/shared/stage-program.ts` | 105 |
| `src/shared/stage-schema.ts` | 682 |
| `src/shared/stage-shot-intent.ts` | 433 |
| `src/shared/stage-shot-list.ts` | 187 |
| `src/shared/stage-timeline.ts` | 209 |
<!-- AUTO:files:end -->

<!-- AUTO:exports:start -->
| 文件 | 导出 |
|---|---|
| `src/main/scene/analyze.ts` | `analyzeScene` |
| `src/main/scene/object-presets.ts` | `loadUserObjectPresets`、`saveUserObjectPresets`、`importUserObjectPresets`、`exportUserObjectPresets` |
| `src/main/stage/export.ts` | `exportStagePreview`、`exportStageProgram` |
| `src/main/stage/storage.ts` | `assertStageId`、`stageDirectory`、`ensureStageDir`、`createStageFile`、`loadStageFile`、`saveStageFile`、`duplicateStageFile`、`deleteStageFile` |
| `src/renderer/src/stage/ShotInspector.tsx` | `ShotInspector` |
| `src/renderer/src/stage/StageInspector.tsx` | `StageInspector` |
| `src/renderer/src/stage/StageTimeline.tsx` | `StageTimeline` |
| `src/renderer/src/stage/StageViewport.tsx` | `StageViewport` |
| `src/renderer/src/stage/StageWindow.tsx` | `StageWindow` |
| `src/renderer/src/stage/WorldSettingsDialog.tsx` | `WorldSettingsDialog` |
| `src/renderer/src/stage/preview-runner.ts` | `StagePreviewExportResult`、`exportStagePreviewToCanvas` |
| `src/renderer/src/stage/stage-active.ts` | `setActiveStageNode`、`activeStageNodeId` |
| `src/renderer/src/stage/stage-figure.ts` | `createStageFigure`、`applyStageFigurePose` |
| `src/renderer/src/stage/stage-from-scene.ts` | `GenerateStageFromSceneInput`、`GenerateStageFromSceneResult`、`generateStageFromScene` |
| `src/renderer/src/stage/stage-scene.ts` | `createHuman`、`createStageObject`、`disposeObject3D` |
| `src/renderer/src/stage/stage-world-scene.ts` | `StageWorldRender`、`createStageWorldRender` |
| `src/renderer/src/stage/stageStore.ts` | `StagePlaybackScope`、`StageViewMode`、`StageTransformMode`、`StageViewCapture`、`syncStageNodeSummary`、`useStageStore` |
| `src/renderer/src/stage/world-content.ts` | `v3`、`World3dSource`、`World3dLive`、`World3dPickInfo`、`World3dContent`、`WORLD3D_SIT_DROP_M`、`buildWorld3dFigure`、`buildWorld3dContent` |
| `src/renderer/src/stage/world-palette.ts` | `DS3D_BACKGROUND`、`DS3D_PRIMARY`、`DS3D_COLORS`、`ds3dFigureHex`、`ds3dBuildingIsBlue`、`ds3dBuildingShade` |
| `src/renderer/src/stage/world-themes.ts` | `World3dThemeLook`、`WORLD3D_THEME_LOOK`、`World3dThemeKit`、`createWorld3dTheme` |
| `src/renderer/src/stage/world-vehicles.ts` | `buildWorld3dVehicle`、`world3dVehicleHeadings` |
| `src/shared/previs/coords.ts` | `previsToThree`、`threeToPrevis`、`stageToWorld`、`worldToStage` |
| `src/shared/previs/interior.ts` | `PREVIS_INTERIOR_MAX`、`PREVIS_INTERIOR_WALL_M`、`PREVIS_INTERIOR_HEIGHT_M`、`PREVIS_INTERIOR_TERRACE_M`、`PrevisInteriorRef`、`previsInteriorAnchor`、`previsInteriorSpec`、`normalizePrevisInteriors`、`setPrevisInterior`、`PrevisInteriorLayout`、`previsInteriorLayouts`、`previsInteriorRoomPlan`、`PREVIS_WALK_IN_OUTSIDE_M`、`previsInteriorWalkInPlan`、`isPrevisWalkInPlan`、`previsInteriorBuildingOf`、`previsPlanSeats` |
| `src/shared/previs/motion-spline.ts` | `samplePrevisPathSmooth`、`samplePrevisPath`、`samplePrevisPathSmoothHeading`、`previsPathLine` |
| `src/shared/previs/plan-core.ts` | `PREVIS_PROP_KINDS`、`PrevisPropKind`、`PrevisProp`、`PrevisSet`、`PrevisCharacterKey`、`PrevisCharacter`、`PREVIS_VEHICLE_KINDS`、`PrevisVehicleKind`、`PrevisVehicleKey`、`PrevisVehicle`、`PrevisRide`、`PrevisPoint3`、`PrevisCameraKey`、`PrevisCameraRelation`、`PrevisCameraDistance`、`PrevisCameraHeight`、`PrevisCameraAim`、`PrevisCameraShot`、`PrevisContact`、`PrevisBeat`、`PrevisPlan`、`PrevisIssueLevel`、`PrevisIssue`、`PREVIS_WALK_COMFORT_MPS` …（共 88 个） |
| `src/shared/previs/room.ts` | `PREVIS_ROOM_TYPES`、`PrevisRoomType`、`PrevisRoomSpec`、`previsRoomTypeFromText`、`normalizePrevisRoomSpec`、`previsRoomFurniture`、`createPrevisRoomPlan`、`previsRoomSpecOf`、`isPrevisRoomPlan`、`PrevisRoomContext`、`PrevisWalkIn`、`PREVIS_WALK_IN_WALL_IDS`、`previsWalkInOf`、`previsRoomContextFromPlan`、`buildPrevisRoomPromptSection`、`applyPrevisRoomToPlan`、`settlePrevisCameraInRoom`、`threadPrevisWalkIn` |
| `src/shared/previs/set-builder.ts` | `buildPrevisPropShape`、`buildPrevisSet`、`previsOverviewCamera` |
| `src/shared/previs/vehicles.ts` | `PrevisVehicleWorld`、`PREVIS_VEHICLE_SIZE`、`previsVehicleKindFromText`、`previsStoryHasVehicles`、`buildPrevisVehiclePromptSection`、`rescuePrevisVehicleCharacters`、`previsVehicleHeadingTrack`、`settlePrevisVehicles`、`keepPrevisCameraOffVehicles`、`retargetPrevisShotsToRides`、`previsVehicleIntentGaps` |
| `src/shared/previs/world-gen.ts` | `PREVIS_WORLD_GENERATOR_VERSIONS`、`PrevisWorldGeneratorVersion`、`PREVIS_WORLD_STYLES`、`PrevisWorldStyle`、`PREVIS_WORLD_LAYOUTS`、`PrevisWorldLayout`、`PREVIS_WORLD_DENSITIES`、`PrevisWorldDensity`、`PREVIS_WORLD_TIMES`、`PrevisWorldTimeOfDay`、`PrevisWorldHeading`、`PREVIS_WORLD_EXTENT_DEFAULT_M`、`PREVIS_WORLD_EXTENT_NEW_M`、`PREVIS_WORLD_EXTENT_MIN_M`、`PREVIS_WORLD_EXTENT_MAX_M`、`PREVIS_WORLD_ROAD_HALF_M`、`PREVIS_WORLD_SIDEWALK_M`、`PrevisWorldStageAnchor`、`PrevisWorldOverride`、`PrevisWorldSurface`、`PrevisWorldShopFront`、`PREVIS_WORLD_STYLED_PROP_KINDS`、`PrevisWorldStyledPropKind`、`PrevisWorldStyleParams` …（共 61 个） |
| `src/shared/previs/world-plan.ts` | `PREVIS_WORLD_STAGE`、`PrevisWorldGeometry`、`previsWorldGeometry`、`PrevisWorldHints`、`inferPrevisWorldHints`、`choosePrevisWorldStageAnchor`、`previsWorldFixedProps`、`PrevisWorldContext`、`PrevisWorldRequest`、`createPrevisWorldContext`、`previsWorldContextFromPlan`、`applyPrevisWorldToPlan`、`buildPrevisWorldPromptSection`、`keepPrevisCameraOutOfWorld`、`keepPrevisPeopleOutOfWater`、`settlePrevisCameraInWorld` |
| `src/shared/previs/world-water.ts` | `PrevisWorldBox`、`PREVIS_WORLD_WATER_KINDS`、`PrevisWorldWaterKind`、`PrevisWorldWaterRef`、`PrevisWorldBridge`、`PrevisWorldQuay`、`normalizePrevisWorldWaterRef`、`applyPrevisWorldWater` |
| `src/shared/scene-analyze.ts` | `SceneAnalyzeInput`、`SceneAnalyzeResult` |
| `src/shared/scene-calibrate.ts` | `DepthStats`、`CalibratedScene`、`calibrateScene` |
| `src/shared/scene-draft.ts` | `SceneSetKind`、`SceneSizeClass`、`SceneDepthLayer`、`SceneFacing`、`SceneHeightHint`、`ScenePitchHint`、`SceneDraftObject`、`SceneDraftRoom`、`SceneDraftCamera`、`SceneDraft`、`SCENE_MAX_OBJECTS`、`parseSceneDraft` |
| `src/shared/scene-object-presets.ts` | `SceneObjectShape`、`SceneObjectPreset`、`builtinObjectPresets`、`normalizeObjectPreset`、`mergeObjectPresets`、`findObjectPreset`、`FALLBACK_OBJECT_PRESET` |
| `src/shared/stage-auto-coverage.ts` | `AutoCoverageMode`、`AutoCoverageOptions`、`AutoCoveragePlan`、`buildAutoCoverage` |
| `src/shared/stage-commands.ts` | `StageCommand`、`StageEffect`、`StageChange`、`StageCommandResult`、`StageApplyResult`、`emptyStageChange`、`applyStageCommand`、`applyStageCommands`、`StageHistoryState`、`STAGE_HISTORY_LIMIT`、`createStageHistory`、`pushStageHistory`、`undoStageHistory`、`redoStageHistory` |
| `src/shared/stage-dialogue.ts` | `DialogueLine`、`parseDialogue`、`buildDialogueCoverage` |
| `src/shared/stage-lighting.ts` | `StageTimeOfDay`、`StageLighting`、`StageLightingPreset`、`resolveStageLighting`、`STAGE_LIGHTING_PRESETS`、`applyLightingPreset` |
| `src/shared/stage-motions.ts` | `STAGE_BONES`、`StageBone`、`StagePoseName`、`BoneRotation`、`MotionFrame`、`StageMotion`、`STAGE_MOTIONS`、`sampleStageMotion`、`motionRateForSpeed`、`isStagePoseName` |
| `src/shared/stage-preview.ts` | `StagePreviewResolution`、`StagePreviewSize`、`stagePreviewSize`、`stagePreviewFrameCount`、`previewSizeForShot`、`evenSize` |
| `src/shared/stage-program.ts` | `ProgramSegment`、`ProgramTimeline`、`buildProgramTimeline`、`programAt`、`segmentShotTime`、`formatTimecode` |
| `src/shared/stage-schema.ts` | `StageVec3`、`StageAspect`、`StageEasing`、`CameraTrackSmoothing`、`StageObjectType`、`StageBackgroundKind`、`StageTransform`、`StageObject`、`StageCamera`、`CameraKeyframe`、`ActionKeyframe`、`ActionTrack`、`StageCameraRelation`、`StageCameraDistance`、`StageCameraHeight`、`StageCameraAim`、`StageShotFraming`、`StageShotIntentKey`、`StageShotIntent`、`StageShot`、`StageProgramEntry`、`StageProgram`、`StageLightingOverride`、`StageBackground` …（共 39 个） |
| `src/shared/stage-shot-intent.ts` | `StageShotSolveResult`、`solveStageShotIntent` |
| `src/shared/stage-shot-list.ts` | `StageShotRow`、`buildShotList`、`shotListToCsv`、`shotListToMarkdown` |
| `src/shared/stage-timeline.ts` | `SampledCamera`、`easingProgress`、`sampleCameraTrack` |
<!-- AUTO:exports:end -->
