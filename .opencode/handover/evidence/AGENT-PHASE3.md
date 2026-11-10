# AGENT-PHASE3 · 拉片段落、导演台镜头/运镜/背景、能力搜索

日期：2026-11-11
分支：`feat/agent-phase3`
基线：`main` @ `0421e60`（PR #4 合并后）

## 范围

- 拉片：`film_study_update_segment`、`film_study_extract_subtitles`、拉片回合撤销。
- 导演台：`stage_add_shot`、`stage_update_shot`、`stage_remove_shot`、`stage_set_camera_track`、`stage_set_background`、`stage_update_object`。
- 能力发现：`capability_search`。

## 实现要点

- `AgentTurnChange.filmUpdated` 接入运行时合并、面板变更计数和本轮撤销。
- `useFilmStudyStore` 新增 `rememberFilmTurn` / `undoFilmTurn`：最多保留 10 份 study 快照，撤销时写回。
- `agentStore.undoLastTurn` 改为异步，撤销拉片快照并给出准确提示。
- `StageCommand` 新增 `setBackground` 和 `backgroundChanged`；导演台新增镜头增删改、机位关键帧、背景、对象姿势/颜色/可见性工具。
- `capability_search` 在主进程按关键词搜索 `AGENT_CAPABILITIES`，返回工具名、说明、作用域、确认级别。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：42 个文件、310 个用例全部通过。
- `corepack pnpm build` 通过。
- 新增/更新测试：
  - `src/shared/__tests__/stage-commands.test.ts`：背景设置、空背景拒绝。
  - `src/main/agent/__tests__/tools.test.ts`：镜头/运镜/背景/拉片段落/字幕提取/能力搜索的参数校验与确认。
  - `src/main/agent/__tests__/capabilities.test.ts`：能力搜索与能力投影。

## 已知限制

- `film_study_import_analysis` 仍走界面文件对话框。
- 导演台没有独立灯光实体，灯光通过对象颜色、背景和环境近似。
- 对象动作轨仍由界面编辑，Agent 暂只开放机位运镜。
- 真实 tokenizer、动态工具暴露和 Agnes 视频补测仍未完成。
