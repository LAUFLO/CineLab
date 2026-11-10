# AGENT-CAPABILITY-PHASE1 · CineBot Phase 1 能力补齐

日期：2026-11-10
分支：`feat/agent-capabilities`
基线：`main` @ `e40a8e7`

## 范围

按 `docs/agent-capability-plan.md` Phase 1 补齐：

- `canvas_remove_edge`
- `canvas_update_text`
- `timeline_set_video`
- `timeline_split_by_shots`
- `timeline_beat_markers` / `timeline_beat_split`
- `stage_transform_camera`
- `stage_export_preview`
- `film_study_get` / `film_study_auto` / `film_study_export`

## 实现要点

- 画布写操作走 `CanvasCommand`；新增 `updateText` 命令，`canvas_get` 返回连线摘要。
- `removeEdges` 支持 `turnId`，UI 边删除和 Agent 共用。
- 时间线新增工具复用 `timeline-tools.ts` 计划生成器；UI 自动粗剪与 Agent 共用 `timeline-plan-runner.ts`。
- 导演台写操作复用 `StageCommand`；新增场景 `turnId` 历史合并；Agent 写场景自动打开导演台。
- 白模预演导出复用 `stage/preview-runner.ts`，UI 与 Agent 共用。
- 拉片按节点动作实现，复用 `film-study-runner.ts` 和 `useFilmStudyStore.runAuto`；不引入独立拉片室 profile。
- 拉片自动输出和场景导出节点通过 `beginToolTurn` 合并为一条画布撤销记录。
- 回合撤销：`AgentTurnChange.stageUpdated` 加入计数与回退；`turn_end` 清理三类命令 turn。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：40 个文件、287 个用例全部通过。
- `corepack pnpm build` 通过。
- 隔离实例（`dev:isolated`，CDP 9222）启动正常，欢迎页加载无渲染错误。
- CDP 直接验证：
  - `createStudyNodeFromVideo` 能从视频节点创建拉片节点并自动连线。
  - `updateText` 命令可撤销；`removeEdges` 带 turnId 可撤销。
  - `beginToolTurn` + 直接写 store 一次撤销可恢复。
  - 导演台同一 turn 两次 `updateCamera` 只压一条历史，撤销恢复机位位置与 fov。
  - `applyTimelinePlan` 同一 turn 两个计划只压一条历史，撤销清空标记。

## 已知限制

- 场景撤销依赖导演台已打开；Agent 会自动打开，但手动切换场景后撤销作用于当前场景。
- 导出的本地视频/压缩包文件不随画布撤销删除。
- 节点工具栏 29 个操作仍未 Agent 化，属于 Phase 2。
