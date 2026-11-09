# CineLab · Boot Packet

> **下一会话优先**：剪辑高级工具（自动字幕、删静音、转场、导出 Agent 入口），随后整体验收。

## 状态

2026-11-09：生成提案、导演台（命令/存储/视口/编辑/运镜/白模预演）、剪辑助手 `clip`、技能管理 UI、删除/批量确认、AI 入口调整均已完成。34 文件 243 测试通过，`typecheck` / `build` 通过。`feat/agent-runtime` 领先 `origin/main` 18 个提交、落后 4 个，未推送。

## Frontier

1. 剪辑高级工具：自动字幕、删静音、转场、导出（下一项）
2. 技能文件上传与覆盖快捷操作
3. 整体验收
4. Agnes 视频补测
5. 推送前同步 origin/main

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64、6abef3d、3a406a7、436768d；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/` 下 `AGENT-*-1.md`、`STAGE-*-1.md`、`CLIP-PROFILE-1.md`、`SKILLS-UI-1.md`、`AGENT-CONFIRM-1.md`、`AGENT-FAB-1.md`；方案见 `docs/agent-architecture-plan.md`、`docs/director-stage-plan.md`、`docs/director-stage-viewport-plan.md`、`docs/agent-plan.md`。

## 关键 lessons

- 高风险 Agent 工具必须执行前确认；拒绝或 60 秒超时不得执行。
- 时间线一轮 Agent 只压一条撤销历史。
- 技能启用/禁用与模型调用开关存 `scope:name` 覆盖配置；禁用高层同名技能要遮蔽低层。
- Agent 的 stage 工具必须立即保存场景文件，并拒绝更旧 `updatedAt`。
- 隔离测试实例用 `CINELAB_DISABLE_THROTTLE=1` 避免 rAF 被遮挡暂停。

## 设计约定

- 画布 AI 入口使用 `assets/agent-icon.svg`，底部工具栏不再重复放 robot 按钮。
- 技能覆盖配置：全局 `<userData>/skills-config.json`，项目 `<project>/.cinelab/skills-config.json`。
- 剪辑助手与画布助手共用 AgentRuntime，按 profile 切换系统提示与工具集。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
