# 01 画布

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

## 这个模块负责什么

无限画布、节点、连线、分组、节点工具栏、提示词栏、画布状态与项目画布文件。

## 不负责什么

- 不做模型调用与生成任务（见 02）。
- 不做时间线剪辑（见 03）。
- 不做导演台 3D 场景（见 04）。

## 节点类型

| 层 | 取值 |
|---|---|
| `NodeKind`（媒体节点） | `text`、`image`、`video`、`audio`、`study` |
| `CanvasNodeKind`（画布节点） | 以上 + `studio`、`film`、`video-op`、`stage` |
| 节点组件 | `CineNodeView`、`StudioNodeView`、`StageNodeView`、`FilmNodeView`、`VideoOpNodeView`、`GroupNodeView` |

`NODE_META` 定义每类节点的默认尺寸与快捷模板：文本 348×348、图片 360×348、视频 480×270、音频 200×127、剪辑室 480×340、成片 480×320、视频操作 420×200、导演台 420×280、拉片 400×250。

## 数据模型

### 媒体节点 `CineNodeData`

关键字段：`kind`、`title`、`status`（idle/queued/running/done/error）、`text`、`prompt`、`outputs: OutputRef[]`、`selectedOutputId`、`progress`、`error`、`templates`、`assetOnly`。`assetOnly` 表示素材/派生结果节点，隐藏 PromptBar，只保留 NodeToolbar。

`OutputRef` 是一次生成结果：`id`、`path`、`scope`、`kind`、`model`、`width/height/duration/fps`、`parentOutputId`、`layer`、`textRecognition`。

### 专用节点

| 节点 | 数据要点 |
|---|---|
| 剪辑室 `StudioNodeData` | `timelineId`、`references`（画布节点 → outputId）、`upstreamAck`、`filmStatus` |
| 成片 `FilmNodeData` | `studioNodeId`、`filmStatus`、`upstreamAck` |
| 导演台 `StageNodeData` | `stageId`、`activeCameraId`、`objectCount/cameraCount/shotCount` |
| 视频操作 `VideoOpNodeData` | `operation`、`sourceNodeId`、`resultNodeId`、`range`、`referencePath`、`modelKey` |
| 分组 `GroupNodeData` | `color`、`mode`（normal/storyboard）、`ratio`、`gridCols/gridRows`、`showIndex` |

### 项目画布

`CanvasData`：`viewport` + `nodes`（≤5000）+ `edges`（≤10000）；项目文件用 `canvases[]` + `activeCanvasId` 支持多画布。

## 命令层

`CanvasCommand` 只有 8 种：

```ts
updateTitle / updateText / updatePrompt / moveNode
addNode / removeNode / connect / removeEdge
```

`applyCanvasCommand` / `applyCanvasBatch` 是纯函数，返回新状态 + `CanvasCommandChange`（创建/更新/删除的节点与连线、previousTitles/Texts/Positions）。撤销、Agent 回合回滚、生成提案的占位节点都复用这套 change。

Store 切片：`viewport`、`graph`、`assets`、`groups`、`history`；`HISTORY_LIMIT = 60`。

## 连线与引用

- 左侧 `+` 只作为 target 接收连线，右侧 `+` 才发起下游生成（AGENTS.md 硬性约定）。
- 删除连线后，`clearEdgeReferences` 清理下游节点的 `sourceNodeId/sourcePath/sourceScope/sourceName`，且只在该上游没有任何剩余连线时清理。
- 分组使用 `childrenOf`、`absolutePosition`、`remapNodeReferences`、`remapEdges` 处理子节点坐标与引用。
- 分组颜色菜单为 5×2 圆形色点，当前色带选中环，不使用横向滚动条；色板为蓝、青、蓝绿、粉、棕、黄、橙、红、紫、灰。旧项目的绿/黄绿仍按原色显示。
- PromptBar 的 AutoLink 与 `@` 文本匹配按标题最长优先且不重叠，避免派生文本节点标题包含上游素材标题时误加参考图。

## 节点操作

`node-operation-specs.ts` 定义 17 个操作：

`character-sheet`、`clip-trim`、`color-grade`、`element-edit`、`element-replace`、`film-study`、`frame-study`、`grid-generate`、`grid-split`、`layer-split`、`motion-capture`、`multi-angle`、`object-remove`、`shot-retake`、`split-av`、`time-shift`、`video-crop`。

`split-av` 按节点类型返回不同菜单：视频节点为 `分离音视频 / 人声提取 / 背景音提取`，音频节点为 `音频分离 / 人声提取 / 背景音提取`；Agent 需要传 `itemId`。人声/背景音由 `stems.ts` 异步执行，普通分离仍走 ffmpeg。

每个操作带 `NodeOperationAgentSpec`：

- `executable`：Agent 能否无人值守执行；
- `requiresConfirm`：是否需要用户确认；
- `generationProposable`：能否走 `generation_propose` 携带 `operationId`；
- `itemRequired/itemOptions`：必须从菜单选一项；
- `params`：number/string/boolean/rect 参数。

`crop`、`grid-generate`、`character-sheet` 等会新建节点并连线的操作，与写回版本栈的操作分开（`nodeOperationOutputTarget`）。

## 数据流

```
UI（Canvas.tsx / PromptBar / NodeToolbar）
  → Zustand store（stores/canvas.ts + slices）
  → applyCanvasCommand
  → nodes/edges
  → project.saveCanvas

CineBot
  → canvas 工具
  → 同一套 command / generation_propose
  → 受影响节点与连线
```

## 当前状态

| 能力 | 状态 | 证据 |
|---|---|---|
| 节点、连线、分组、多选、对齐 | 已实现 | `src/shared/canvas-commands.ts`、`canvas-commands.test.ts` |
| 项目画布打开/保存/多画布 | 已实现 | `src/shared/project-schema.ts`、`src/main/project/` |
| 节点工具栏与 17 个操作 | 已实现 | `node-operation-specs.ts`、`NodeToolbar.tsx` |
| 版本栈与上游引用 | 已实现 | `CineNodeData.outputs`、`edge-references.ts` |
| Agent 操作节点 | 已实现 | `canvas.ts` 工具、`nodeOperationAgentSpec` |
| 分镜组/宫格 | 已实现 | `StoryboardToolbar.tsx`、`GroupNodeData` |

## 已知限制

- 画布节点上限 5000、连线上限 10000；大项目要注意。
- 撤销上限 60 步。
- 部分节点操作（蒙版类、需要对话框的）不能无人值守执行，只能走 UI 或生成提案。
- 生成逻辑不在此模块，节点只负责输入/输出与展示。

## 常见改动入口

| 想改什么 | 先看 |
|---|---|
| 节点数据/画布结构 | `src/shared/canvas-schema.ts` |
| 命令与撤销 | `src/shared/canvas-commands.ts`、`stores/canvas/slices/history.ts` |
| 节点操作规范 | `src/shared/node-operation-specs.ts` |
| 画布 UI/连线 | `src/renderer/src/canvas/Canvas.tsx`、`edges/FlowEdge.tsx` |
| 节点工具栏 | `src/renderer/src/canvas/nodes/NodeToolbar.tsx` |
| 提示词栏 | `src/renderer/src/canvas/PromptBar.tsx`、`promptbar/` |
| Store | `src/renderer/src/stores/canvas.ts`、`canvas-model.ts`、`canvas/slices/` |

## 文件与导出（自动生成）

<!-- AUTO:files:start -->
| 文件 | 行数 |
|---|---|
| `src/renderer/src/canvas/AddNodeMenu.tsx` | 260 |
| `src/renderer/src/canvas/AlignmentGuides.tsx` | 29 |
| `src/renderer/src/canvas/BottomBar.tsx` | 139 |
| `src/renderer/src/canvas/Canvas.tsx` | 714 |
| `src/renderer/src/canvas/CanvasContextMenu.tsx` | 135 |
| `src/renderer/src/canvas/EdgeContextMenu.tsx` | 40 |
| `src/renderer/src/canvas/GroupToolbar.tsx` | 245 |
| `src/renderer/src/canvas/MultiSelectBar.tsx` | 343 |
| `src/renderer/src/canvas/NodeContextMenu.tsx` | 497 |
| `src/renderer/src/canvas/PromptBar.tsx` | 2224 |
| `src/renderer/src/canvas/StatusBar.tsx` | 100 |
| `src/renderer/src/canvas/StoryboardToolbar.tsx` | 359 |
| `src/renderer/src/canvas/TopBar.tsx` | 500 |
| `src/renderer/src/canvas/UpstreamWatcher.tsx` | 33 |
| `src/renderer/src/canvas/alignment.ts` | 113 |
| `src/renderer/src/canvas/context-actions.ts` | 229 |
| `src/renderer/src/canvas/delete-actions.ts` | 91 |
| `src/renderer/src/canvas/edges/FlowEdge.tsx` | 72 |
| `src/renderer/src/canvas/media-size.ts` | 45 |
| `src/renderer/src/canvas/nodes/AiOperationDialog.tsx` | 289 |
| `src/renderer/src/canvas/nodes/AudioActionBar.tsx` | 225 |
| `src/renderer/src/canvas/nodes/AudioPlayer.tsx` | 379 |
| `src/renderer/src/canvas/nodes/CineNodeView.tsx` | 779 |
| `src/renderer/src/canvas/nodes/CropDialog.tsx` | 154 |
| `src/renderer/src/canvas/nodes/DepthCaptureDialog.tsx` | 136 |
| `src/renderer/src/canvas/nodes/FilmNodeView.tsx` | 58 |
| `src/renderer/src/canvas/nodes/FilmStudyInsights.tsx` | 273 |
| `src/renderer/src/canvas/nodes/FilmStudySheet.tsx` | 204 |
| `src/renderer/src/canvas/nodes/GroupNodeView.tsx` | 131 |
| `src/renderer/src/canvas/nodes/MaskEditorDialog.tsx` | 377 |
| `src/renderer/src/canvas/nodes/ModelConfigDialog.tsx` | 1628 |
| `src/renderer/src/canvas/nodes/NodeToolbar.tsx` | 1193 |
| `src/renderer/src/canvas/nodes/PanoramaViewer.tsx` | 200 |
| `src/renderer/src/canvas/nodes/RemakeMappingDialog.tsx` | 155 |
| `src/renderer/src/canvas/nodes/SphereDialog.tsx` | 393 |
| `src/renderer/src/canvas/nodes/StageNodeView.tsx` | 122 |
| `src/renderer/src/canvas/nodes/StudioNodeView.tsx` | 809 |
| `src/renderer/src/canvas/nodes/StudyNodeCard.tsx` | 382 |
| `src/renderer/src/canvas/nodes/SubtitleDialog.tsx` | 161 |
| `src/renderer/src/canvas/nodes/TextEditorDialog.tsx` | 176 |
| `src/renderer/src/canvas/nodes/ToolbarSettings.tsx` | 139 |
| `src/renderer/src/canvas/nodes/TrimDialog.tsx` | 119 |
| `src/renderer/src/canvas/nodes/VideoOpNodeView.tsx` | 868 |
| `src/renderer/src/canvas/nodes/VideoPlayer.tsx` | 328 |
| `src/renderer/src/canvas/nodes/VideoPreview.tsx` | 184 |
| `src/renderer/src/canvas/nodes/film-study-runner.ts` | 62 |
| `src/renderer/src/canvas/nodes/node-operation-runner.ts` | 1492 |
| `src/renderer/src/canvas/nodes/node-operations.ts` | 612 |
| `src/renderer/src/canvas/nodes/playbackBudget.ts` | 97 |
| `src/renderer/src/canvas/nodes/study-sheet.ts` | 300 |
| `src/renderer/src/canvas/nodes/text-markdown.ts` | 101 |
| `src/renderer/src/canvas/nodes/useBoxEditor.ts` | 131 |
| `src/renderer/src/canvas/promptbar-model.tsx` | 201 |
| `src/renderer/src/canvas/promptbar/MentionMenu.tsx` | 165 |
| `src/renderer/src/canvas/promptbar/ModelMenu.tsx` | 95 |
| `src/renderer/src/canvas/promptbar/ParamPanel.tsx` | 232 |
| `src/renderer/src/canvas/promptbar/UploadMenu.tsx` | 45 |
| `src/renderer/src/stores/canvas-model.ts` | 345 |
| `src/renderer/src/stores/canvas.ts` | 211 |
| `src/renderer/src/stores/canvas/slices/assets.ts` | 524 |
| `src/renderer/src/stores/canvas/slices/graph.ts` | 618 |
| `src/renderer/src/stores/canvas/slices/groups.ts` | 776 |
| `src/renderer/src/stores/canvas/slices/history.ts` | 488 |
| `src/renderer/src/stores/canvas/slices/viewport.ts` | 21 |
| `src/renderer/src/stores/edge-references.ts` | 94 |
| `src/renderer/src/stores/toolbar.ts` | 70 |
| `src/shared/canvas-commands.ts` | 303 |
| `src/shared/canvas-schema.ts` | 326 |
| `src/shared/canvas-summary.ts` | 54 |
| `src/shared/components.ts` | 59 |
| `src/shared/node-operation-specs.ts` | 441 |
| `src/shared/operation-schema.ts` | 64 |
<!-- AUTO:files:end -->

<!-- AUTO:exports:start -->
| 文件 | 导出 |
|---|---|
| `src/renderer/src/canvas/AddNodeMenu.tsx` | `AddNodeMenu` |
| `src/renderer/src/canvas/AlignmentGuides.tsx` | `AlignmentGuide`、`AlignmentGuides` |
| `src/renderer/src/canvas/BottomBar.tsx` | `BottomBar` |
| `src/renderer/src/canvas/Canvas.tsx` | `Canvas` |
| `src/renderer/src/canvas/CanvasContextMenu.tsx` | `CanvasContextMenu` |
| `src/renderer/src/canvas/EdgeContextMenu.tsx` | `EdgeContextMenu` |
| `src/renderer/src/canvas/GroupToolbar.tsx` | `GroupToolbar` |
| `src/renderer/src/canvas/MultiSelectBar.tsx` | `MultiSelectBar` |
| `src/renderer/src/canvas/NodeContextMenu.tsx` | `NodeContextMenu` |
| `src/renderer/src/canvas/PromptBar.tsx` | `PromptBar` |
| `src/renderer/src/canvas/StatusBar.tsx` | `StatusBar` |
| `src/renderer/src/canvas/StoryboardToolbar.tsx` | `StoryboardToolbar` |
| `src/renderer/src/canvas/TopBar.tsx` | `TopBar` |
| `src/renderer/src/canvas/UpstreamWatcher.tsx` | `UpstreamWatcher` |
| `src/renderer/src/canvas/alignment.ts` | `NodeBounds`、`AlignmentMatch`、`AlignmentResult`、`boundsOfNode`、`boundsOfNodes`、`computeAlignment` |
| `src/renderer/src/canvas/context-actions.ts` | `uploadMaterialsAt`、`copySelection`、`duplicateSelectionDeep`、`pasteAt` |
| `src/renderer/src/canvas/delete-actions.ts` | `requestDeleteSelection` |
| `src/renderer/src/canvas/edges/FlowEdge.tsx` | `FlowEdge` |
| `src/renderer/src/canvas/media-size.ts` | `MediaSize`、`probeMediaSize`、`fitNodeToMedia` |
| `src/renderer/src/canvas/nodes/AiOperationDialog.tsx` | `AiOperationDialog` |
| `src/renderer/src/canvas/nodes/AudioActionBar.tsx` | `AudioActionMode`、`AudioActionBar` |
| `src/renderer/src/canvas/nodes/AudioPlayer.tsx` | `timeLabel`、`AudioPlayer` |
| `src/renderer/src/canvas/nodes/CineNodeView.tsx` | `CineNodeView` |
| `src/renderer/src/canvas/nodes/CropDialog.tsx` | `CropDialog` |
| `src/renderer/src/canvas/nodes/DepthCaptureDialog.tsx` | `DepthCaptureDialog` |
| `src/renderer/src/canvas/nodes/FilmNodeView.tsx` | `FilmNodeView` |
| `src/renderer/src/canvas/nodes/FilmStudyInsights.tsx` | `StructurePanel`、`EmotionPanel` |
| `src/renderer/src/canvas/nodes/FilmStudySheet.tsx` | `FilmStudySheet` |
| `src/renderer/src/canvas/nodes/GroupNodeView.tsx` | `GroupNodeView` |
| `src/renderer/src/canvas/nodes/MaskEditorDialog.tsx` | `MaskEditorDialog` |
| `src/renderer/src/canvas/nodes/ModelConfigDialog.tsx` | `ModelConfigValue`、`ModelConfigDialog` |
| `src/renderer/src/canvas/nodes/NodeToolbar.tsx` | `NodeToolbar` |
| `src/renderer/src/canvas/nodes/PanoramaViewer.tsx` | `PanoramaViewer` |
| `src/renderer/src/canvas/nodes/RemakeMappingDialog.tsx` | `RemakeMappingDialog` |
| `src/renderer/src/canvas/nodes/SphereDialog.tsx` | `SphereDialog` |
| `src/renderer/src/canvas/nodes/StageNodeView.tsx` | `StageNodeView` |
| `src/renderer/src/canvas/nodes/StudioNodeView.tsx` | `StudioNodeView` |
| `src/renderer/src/canvas/nodes/StudyNodeCard.tsx` | `StudyNodeCard` |
| `src/renderer/src/canvas/nodes/SubtitleDialog.tsx` | `SubtitleDialog` |
| `src/renderer/src/canvas/nodes/TextEditorDialog.tsx` | `TextEditorDialog` |
| `src/renderer/src/canvas/nodes/ToolbarSettings.tsx` | `ToolbarSettings` |
| `src/renderer/src/canvas/nodes/TrimDialog.tsx` | `TrimDialog` |
| `src/renderer/src/canvas/nodes/VideoOpNodeView.tsx` | `VideoOpNodeView` |
| `src/renderer/src/canvas/nodes/VideoPlayer.tsx` | `VideoPlayerHandle`、`VideoPlayer` |
| `src/renderer/src/canvas/nodes/VideoPreview.tsx` | `VideoPreview` |
| `src/renderer/src/canvas/nodes/film-study-runner.ts` | `createStudyNodeFromVideo`、`runFilmStudyAuto` |
| `src/renderer/src/canvas/nodes/node-operation-runner.ts` | `NodeOperationUiEffect`、`NodeOperationUiHost`、`NodeOperationRequest`、`NodeOperationResult`、`NodeOperationSummary`、`NodeOperationsSummary`、`listNodeOperations`、`executeNodeOperation`、`operationNeedsConfirm` |
| `src/renderer/src/canvas/nodes/node-operations.ts` | `OperationContext`、`OperationMenuItem`、`OperationRequirementType`、`OperationRequires`、`OperationSection`、`NodeOutputTarget`、`NodeOperation`、`OPERATION_SECTIONS`、`NODE_OPERATIONS`、`buildOperationPrompt`、`operationsForKind`、`defaultPrimaryForKind`、`runNodeOperation` |
| `src/renderer/src/canvas/nodes/playbackBudget.ts` | `acquireVideoPlayback`、`releaseVideoPlayback`、`isVideoPlaybackActive`、`acquireAudioPlayback`、`releaseAudioPlayback`、`isAudioPlaybackActive`、`pauseAllPlayback` |
| `src/renderer/src/canvas/nodes/study-sheet.ts` | `studyClock`、`segmentDuration`、`segmentMetaLine`、`buildStudySheetMarkdown`、`buildStudyTableMarkdown`、`buildShotMarkdown`、`buildRemakePrompt`、`buildStyleMarkdown`、`ShotGroup`、`groupShotsByScene`、`segmentCopyText` |
| `src/renderer/src/canvas/nodes/text-markdown.ts` | `MARKDOWN_CLASS`、`renderMarkdown` |
| `src/renderer/src/canvas/nodes/useBoxEditor.ts` | `Box`、`DragMode`、`useBoxEditor` |
| `src/renderer/src/canvas/promptbar-model.tsx` | `WIDTH`、`HEIGHT`、`PLACEHOLDER`、`ModelOption`、`defaultParams`、`paramGroupName`、`paramLabel`、`ratioOf`、`MentionGroupName`、`RefKind`、`MentionKind`、`PickedRef`、`MentionItem`、`VIDEO_PATH`、`MAX_TEXT_CONTEXT`、`TextContext`、`Span`、`TitleSpan`、`matchTitleSpans`、`buildPromptWithContext`、`isVideoPath`、`MENTION_GROUPS`、`escapeRegExp`、`renderMentionText` |
| `src/renderer/src/canvas/promptbar/MentionMenu.tsx` | `MentionMenu` |
| `src/renderer/src/canvas/promptbar/ModelMenu.tsx` | `ModelMenu` |
| `src/renderer/src/canvas/promptbar/ParamPanel.tsx` | `ParamPanel` |
| `src/renderer/src/canvas/promptbar/UploadMenu.tsx` | `UploadMenu` |
| `src/renderer/src/stores/canvas-model.ts` | `CineNode`、`StudioNode`、`StageNode`、`FilmNode`、`VideoOpNode`、`GroupNode`、`CanvasNode`、`CineEdge`、`commandTurns`、`isGroupNode`、`isMediaNode`、`isStudioNode`、`isStageNode`、`isFilmNode`、`isVideoOpNode`、`nodeSize`、`nodeOutputs`、`selectedNodeOutput`、`Snapshot`、`NodeClipboard`、`HISTORY_LIMIT`、`cloneSnapshot`、`GroupArrangeMode`、`externalWrite` …（共 37 个） |
| `src/renderer/src/stores/canvas.ts` | `CanvasStore`、`useCanvasStore` |
| `src/renderer/src/stores/canvas/slices/assets.ts` | `createAssetsSlice` |
| `src/renderer/src/stores/canvas/slices/graph.ts` | `createGraphSlice` |
| `src/renderer/src/stores/canvas/slices/groups.ts` | `createGroupsSlice` |
| `src/renderer/src/stores/canvas/slices/history.ts` | `createHistorySlice` |
| `src/renderer/src/stores/canvas/slices/viewport.ts` | `createViewportSlice` |
| `src/renderer/src/stores/edge-references.ts` | `clearEdgeReferences` |
| `src/renderer/src/stores/toolbar.ts` | `PinnedMap`、`useToolbarStore`、`TOOLBAR_MAX_PRIMARY` |
| `src/shared/canvas-commands.ts` | `CanvasCommandNode`、`CanvasCommandEdge`、`CanvasCommand`、`CanvasCommandChange`、`CanvasCommandState`、`CanvasCommandResult`、`emptyCanvasChange`、`applyCanvasCommand`、`applyCanvasBatch` |
| `src/shared/canvas-schema.ts` | `NodeKind`、`CanvasNodeKind`、`FilmStatus`、`NodeStatus`、`OutputRef`、`CineNodeData`、`StudioNodeData`、`FilmNodeData`、`StageNodeData`、`VideoOpNodeData`、`GroupColor`、`GROUP_COLORS`、`GROUP_LABELS`、`GroupMode`、`GroupRatio`、`GROUP_RATIOS`、`GROUP_RATIO_LABEL`、`GROUP_RATIO_VALUE`、`STORYBOARD_MAX_NODES`、`STORYBOARD_CELL_WIDTH`、`STORYBOARD_GAP`、`GRID_SPLIT_CELL_WIDTH`、`GroupNodeData`、`GROUP_HEADER_HEIGHT` …（共 30 个） |
| `src/shared/canvas-summary.ts` | `CanvasNodeSummary`、`CanvasEdgeSummary`、`summarizeCanvasNode`、`summarizeCanvasEdge` |
| `src/shared/components.ts` | `ComponentKind`、`ComponentState`、`ComponentManifest`、`ComponentStatus`、`ComponentEvent`、`ComponentInstallResult` |
| `src/shared/node-operation-specs.ts` | `NodeOperationAgentSpec`、`NodeOperationParamType`、`NodeOperationParamSpec`、`NodeOperationKindSpec`、`NodeOperationOutputTarget`、`isResultOutputOp`、`isResultOutput`、`nodeOperationOutputTarget`、`NODE_OPERATION_AGENT_SPECS`、`nodeOperationAgentSpec`、`isAgentOperationParamSpec`、`validateNodeOperationParams` |
| `src/shared/operation-schema.ts` | `VideoOperationId`、`VideoOperationDef`、`VIDEO_OPERATIONS`、`OperationBindings`、`isVideoOperation` |
<!-- AUTO:exports:end -->
