# CineLab · Boot Packet

> **下一会话优先**：删除 / 批量操作二次确认——为 Agent 的节点、时间线片段、技能删除与批量修改增加确认机制。

## 状态

2026-11-09：生成提案 propose/submit 已完成并真实 Agnes 验证；金额预估已移除。导演台完成五批（StageCommand、场景存储、A1 视口、A2 编辑/Agent、A3 运镜与白模预演）。剪辑助手 `clip` profile 与技能管理 UI 已完成。34 文件 242 测试通过，`typecheck` / `build` 通过。`feat/agent-runtime` 领先 `origin/main` 17 个提交、落后 4 个，未推送。

## Frontier

1. 删除 / 批量操作二次确认（下一项）
2. 剪辑高级工具：自动字幕、删静音、转场、导出
3. 技能文件上传与覆盖快捷操作
4. 整体验收
5. Agnes 视频补测；推送前同步 origin/main

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64、6abef3d、3a406a7、436768d；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-*-1.md`、`STAGE-*-1.md`、`CLIP-PROFILE-1.md`、`SKILLS-UI-1.md`；方案见 `docs/agent-architecture-plan.md`、`docs/director-stage-plan.md`、`docs/director-stage-viewport-plan.md`、`docs/agent-plan.md`。

## 关键 lessons

- 技能启用/禁用与模型调用开关存 `scope:name` 覆盖配置；禁用高层同名技能要遮蔽低层技能。
- 内置技能只读；技能文件只允许 SKILL.md、references/、assets/，并做 realpath 校验。
- 剪辑助手 scope 必须带 timelineId；一轮 Agent 只压一条时间线撤销历史。
- Agent 的 stage 工具必须立即保存场景文件，并拒绝更旧 `updatedAt` 的快照。
- 隔离测试实例用 `CINELAB_DISABLE_THROTTLE=1` 避免 rAF 被遮挡暂停。

## 设计约定

- Agent 会话存 `<project>/.cinelab/agent/sessions/`，提案存 `<project>/.cinelab/agent/proposals/`。
- 技能覆盖配置：全局 `<userData>/skills-config.json`，项目 `<project>/.cinelab/skills-config.json`。
- 剪辑助手与画布助手共用 AgentRuntime，按 profile 切换系统提示与工具集。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
