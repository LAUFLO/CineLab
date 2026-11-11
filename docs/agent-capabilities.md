# CineBot 能力清单

日期：2026-11-11
状态：**Phase 1–4 已实施**
适用版本：`main` @ `b76a064`
关联：`docs/agent-capability-plan.md`、`docs/agent-architecture-plan.md`

当前注册 56 个工具，覆盖画布、剪辑室、导演台、拉片、生成提案、资产库和技能。
本文件记录已开放给 CineBot 的能力、参数校验、确认规则和回合撤销方式。
所有写操作都走命令层；UI 和 Agent 共用执行器。

## 0. 全部工具索引

### 画布（12）

`canvas_get`、`canvas_update_title`、`canvas_update_text`、`canvas_move_node`、`canvas_add_node`、`canvas_connect`、`canvas_remove_edge`、`canvas_delete_node`、`canvas_group`、`canvas_ungroup`、`canvas_node_operations`、`canvas_node_operation`

### 生成与资产（3）

`generation_catalog`、`generation_propose`、`library_search`

### 导演台（15）

`stage_get`、`stage_capabilities`、`stage_add_object`、`stage_transform_object`、`stage_add_camera`、`stage_transform_camera`、`stage_add_shot`、`stage_update_shot`、`stage_remove_shot`、`stage_set_camera_track`、`stage_set_background`、`stage_update_object`、`stage_export_preview`、`stage_set_active_camera`、`stage_remove_object`

### 剪辑室（17）

`timeline_get`、`timeline_select_clips`、`timeline_set_video`、`timeline_move_clips`、`timeline_trim_clip`、`timeline_split_clips`、`timeline_split_by_shots`、`timeline_beat_markers`、`timeline_beat_split`、`timeline_remove_clips`、`timeline_update_clip`、`timeline_set_track`、`timeline_add_marker`、`timeline_auto_subtitles`、`timeline_remove_silence`、`timeline_set_transition`、`timeline_export`

### 拉片（5）

`film_study_get`、`film_study_auto`、`film_study_update_segment`、`film_study_extract_subtitles`、`film_study_export`

### 能力与技能（4）

`capability_catalog`、`capability_search`、`skill_list`、`skill_read`

## 1. 画布

| 工具 | 能力 ID | 只读 | 确认 | 回合撤销 | 共用执行器 |
|---|---|---|---|---|---|
| `canvas_remove_edge` | `canvas.removeEdge` | 否 | 是 | 画布历史 | `useCanvasStore.removeEdges(ids, turnId)`，UI 边菜单同源 |
| `canvas_update_text` | `canvas.updateText` | 否 | 是 | 画布历史 | `CanvasCommand.updateText`，文本编辑器同源 |

参数校验：

- `canvas_remove_edge`：需要 `edgeId`，或 `sourceNodeId + targetNodeId`；两端必须在 scope 内；运行时校验连线存在且与选中节点相关。
- `canvas_update_text`：`nodeId` 必须选中；`text` 必须为字符串，最多 100000 字符；只允许文本节点。

`canvas_get` 现在额外返回最多 200 条连线摘要（`id / source / target / role`），便于查找 `edgeId`。

## 2. 剪辑室

| 工具 | 能力 ID | 只读 | 确认 | 回合撤销 |
|---|---|---|---|---|
| `timeline_set_video` | `timeline.setVideo` | 否 | 否 | 时间线历史 |
| `timeline_split_by_shots` | `timeline.splitByShots` | 否 | 是 | 时间线历史 |
| `timeline_beat_markers` | `timeline.beatMarkers` | 否 | 否 | 时间线历史 |
| `timeline_beat_split` | `timeline.beatSplit` | 否 | 是 | 时间线历史 |

实现说明：

- 画幅、分辨率、帧率、背景走 `TimelineCommand.setTimelineVideo` / `setTimelineBackground`。
- 镜头切分、节拍标记、节拍切分复用 `src/shared/timeline-tools.ts` 中的 `buildSplitByShotsPlan`、`buildBeatMarkerPlan`、`buildBeatSplitPlan`。
- UI 的自动粗剪确认卡和 Agent 工具共用 `src/renderer/src/studio/timeline-plan-runner.ts`。
- 同一轮 Agent 的多条时间线命令通过 `turnId` 合并为一条撤销记录。
- `timeline_set_video` 的宽高必须成对、为偶数且在 16-7680 / 16-4320 范围内；`fps` 为 1-120。
- 镜头切分要求未静音视频片段，节拍源要求未静音音频或视频片段。

## 3. 导演台

| 工具 | 能力 ID | 只读 | 确认 | 回合撤销 |
|---|---|---|---|---|
| `stage_transform_camera` | `stage.transformCamera` | 否 | 否 | 场景历史 |
| `stage_add_shot` | `stage.addShot` | 否 | 否 | 场景历史 |
| `stage_update_shot` | `stage.updateShot` | 否 | 否 | 场景历史 |
| `stage_remove_shot` | `stage.removeShot` | 否 | 是 | 场景历史 |
| `stage_set_camera_track` | `stage.setCameraTrack` | 否 | 是 | 场景历史 |
| `stage_set_background` | `stage.setBackground` | 否 | 否 | 场景历史 |
| `stage_update_object` | `stage.updateObject` | 否 | 否 | 场景历史 |
| `stage_export_preview` | `stage.exportPreview` | 否 | 是 | 画布历史（导出节点） |

实现说明：

- 机位变换复用 `StageCommand.updateCamera`，UI 检查器同源。
- 镜头增删改、机位关键帧、背景分别复用 `StageCommand.addShot / updateShot / removeShot / setCameraTrack / setBackground`。
- 对象姿势、颜色和可见性复用 `StageCommand.setPose / setColor / setVisible`。
- 导出白模预演复用 `src/renderer/src/stage/preview-runner.ts`，UI 的 StageWindow 和 Agent 同源。
- Agent 写场景前会自动打开导演台，确保修改可见并进入场景撤销历史。
- 同一轮场景命令通过 `turnId` 合并为一条撤销记录；本轮撤销时 `agentStore.undoLastTurn` 会同时回退画布与场景。
- 导出参数：`shotId` 必填；`resolution` 为 `720p / 1080p`；`fps` 为 `24 / 30`。

## 4. 拉片

拉片不是独立工作台：主入口是视频节点上的「逐帧拉片」，结果直接回画布。工具同样按节点动作设计。

| 工具 | 能力 ID | 只读 | 确认 | 回合撤销 |
|---|---|---|---|---|
| `film_study_get` | `film.studyGet` | 是 | 否 | 不适用 |
| `film_study_auto` | `film.studyAuto` | 否 | 是 | 画布历史（拉片节点 + 输出节点） |
| `film_study_update_segment` | `film.studyUpdateSegment` | 否 | 否 | 拉片快照 + 时间线式撤销提示 |
| `film_study_extract_subtitles` | `film.studyExtractSubtitles` | 否 | 是 | 拉片快照 |
| `film_study_export` | `film.studyExport` | 否 | 否（保存对话框确认） | 不适用 |

实现说明：

- `nodeId` 可以是拉片节点，也可以是它上游的视频节点；`studyId` 可直接指定。
- `film_study_auto` 复用 `src/renderer/src/canvas/nodes/film-study-runner.ts` 创建拉片节点，并复用 `useFilmStudyStore.runAuto` 执行自动拉片。
- 拉片期间创建的拉片节点、分镜组、分镜表、动态切片和 BGM 节点通过 `beginToolTurn` 合并为一条画布撤销记录。
- `film_study_update_segment` 可修改标题、时间、类型、结构角色、景别、机位、运镜、光线、画面描述、提示词、人声、音乐和备注；修改前把整份 study 快照存入 `useFilmStudyStore.rememberFilmTurn`，本轮撤销时恢复。
- `film_study_extract_subtitles` 调用本地字幕运行时提取内嵌字幕；执行前确认，修改同样进入拉片快照。
- 输出选项：`storyboard / sheet / motion / music`，默认生成分镜组和分镜表。
- 导出格式：`markdown / analysis / bundle`，使用原生保存对话框，用户可取消。

## 5. 测试覆盖

- `src/shared/__tests__/canvas-commands.test.ts`：`updateText`、非文本节点拒绝、`removeEdge`。
- `src/shared/__tests__/stage-commands.test.ts`：镜头增删改、机位关键帧、背景、预览效果。
- `src/shared/__tests__/node-operation-specs.test.ts`：节点操作参数和可执行性。
- `src/main/agent/__tests__/capabilities.test.ts`：能力注册表投影和能力搜索。
- `src/main/agent/__tests__/tools.test.ts`：新工具的参数校验、只读过滤、确认规则、时间线写工具标记。
- 现有 `timeline-tools.test.ts` 覆盖镜头切分和节拍计划生成。

## 6. 节点操作桥

| 工具 | 能力 ID | 只读 | 确认 | 回合撤销 |
|---|---|---|---|---|
| `canvas_node_operations` | `canvas.nodeOperations` | 是 | 否 | 不适用 |
| `canvas_node_operation` | `canvas.nodeOperation` | 否 | 按操作 | 画布历史 |

实现说明：

- `src/shared/node-operation-specs.ts` 声明每个操作是否 Agent 可执行、需要的 itemId、参数和确认规则。
- `src/renderer/src/canvas/nodes/node-operation-runner.ts` 是 UI 和 Agent 共用的执行器；UI 传入 dialog host，Agent 不传。
- Agent 可直接执行 17 个操作：宫格切分、裁剪、深度动作捕捉、片段截取、分离音视频、抽帧、逐帧拉片、画面裁切、去字幕、图层分离、视频抠像、主体消除、扩图、抠图、片段重拍、元素替换、智能续写。
- 需要模型或蒙版交互的 11 个操作显式标记 `agentExecutable: false`，提示词仍会通过 `canvas_node_operations` 返回。
- 其中 8 个模型类操作标记 `generationProposable: true`，Agent 用 `generation_propose` 传 `operationId` / `itemId` 自动复用提示词；3 个蒙版操作仍需界面涂抹。
- 新增节点操作只需要改 `node-operations.ts`、`node-operation-specs.ts` 和 `node-operation-runner.ts`，不需要新增工具。

## 7. 生成提案扩展

`generation_propose` 新增：

- `operationId`：复用节点操作提示词，例如 `character-sheet`、`grid-generate`
- `itemId`：选择操作菜单项
- `mask`：PNG data URL 蒙版，仅图片编辑模型

传 `operationId` 时，目标节点当前图片会自动作为 reference，并写入 `request.op`。

## 8. 能力目录

| 工具 | 能力 ID | 只读 | 说明 |
|---|---|---|---|
| `capability_catalog` | `capability.catalog` | 是 | 返回当前空间、可用工具、选中节点操作、时间线摘要、导演台镜头、拉片摘要 |
| `capability_search` | `capability.search` | 是 | 按关键词搜索已注册工具，返回名称、说明、作用域、只读性和确认级别 |

`canvas_get` 的 `selectedNodes` 现在额外返回 `availableOperations`。

## 9. 已知限制

- 场景撤销依赖导演台处于打开状态；Agent 写场景会自动打开导演台，手动关闭后再次撤销会作用到当前场景。
- 拉片导出和场景导出的本地文件不会随画布撤销删除。
- 模型类节点操作通过 `generation_propose` 登记提案，用户确认后才提交；蒙版类操作仍需界面涂抹。
- 深度动作捕捉、图层分离、视频抠像等长时间任务在启动后异步完成；回合撤销会移除占位节点，但不会取消已启动的本地任务。
- 同一轮多个空间的修改分别进入画布、时间线、场景和拉片快照；跨空间撤销是逐域回退，不是单一原子事务。

## 10. 变更记录

- 2026-11-11：Phase 1–4 合并入 main。新增节点操作桥、能力目录、导演台镜头/运镜/背景、拉片段落编辑/字幕提取、生成提案 operationId/itemId/mask。
- 2026-11-10：Phase 1 首批工具（连线删除、文本正文、时间线画幅/镜头/节拍、导演台机位/预演、拉片读取/自动/导出）。

