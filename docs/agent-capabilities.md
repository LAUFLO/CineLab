# CineBot 能力清单

日期：2026-11-10
状态：Phase 1 已实施
分支：`feat/agent-capabilities`
关联：`docs/agent-capability-plan.md`、`docs/agent-architecture-plan.md`

本文件记录已开放给 CineBot 的能力、参数校验、确认规则和回合撤销方式。
Phase 1 的所有写操作都走命令层，UI 和 Agent 共用执行器。

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
| `stage_export_preview` | `stage.exportPreview` | 否 | 是 | 画布历史（导出节点） |

实现说明：

- 机位变换复用 `StageCommand.updateCamera`，UI 检查器同源。
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
| `film_study_export` | `film.studyExport` | 否 | 否（保存对话框确认） | 不适用 |

实现说明：

- `nodeId` 可以是拉片节点，也可以是它上游的视频节点；`studyId` 可直接指定。
- `film_study_auto` 复用 `src/renderer/src/canvas/nodes/film-study-runner.ts` 创建拉片节点，并复用 `useFilmStudyStore.runAuto` 执行自动拉片。
- 拉片期间创建的拉片节点、分镜组、分镜表、动态切片和 BGM 节点通过 `beginToolTurn` 合并为一条画布撤销记录。
- 输出选项：`storyboard / sheet / motion / music`，默认生成分镜组和分镜表。
- 导出格式：`markdown / analysis / bundle`，使用原生保存对话框，用户可取消。

## 5. 测试覆盖

- `src/shared/__tests__/canvas-commands.test.ts`：`updateText`、非文本节点拒绝、`removeEdge`。
- `src/main/agent/__tests__/tools.test.ts`：新工具的参数校验、只读过滤、确认规则、时间线写工具标记。
- 现有 `timeline-tools.test.ts` 覆盖镜头切分和节拍计划生成。

## 6. 已知限制

- 场景撤销依赖导演台处于打开状态；Agent 写场景会自动打开导演台，手动关闭后再次撤销会作用到当前场景。
- 拉片导出和场景导出的本地文件不会随画布撤销删除。
- 节点工具栏的 29 个操作仍只在 UI 中可用；节点操作桥属于 Phase 2。
