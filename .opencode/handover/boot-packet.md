# CineLab · Boot Packet

> **下一会话优先**：技能管理 UI —— 查看、创建、编辑、启用/禁用内置 / 全局 / 项目三级技能。

## 状态

2026-11-09：生成提案 propose/submit 已完成并真实 Agnes 验证；金额预估已移除。导演台完成五批：StageCommand、场景存储、A1 视口、A2 编辑/Agent、A3 运镜与白模预演。剪辑助手 `clip` profile 已用通用 AgentRuntime 重建：时间线工具、剪辑室上下文、回合级撤销。33 文件 239 测试通过，`typecheck` / `build` 通过。`feat/agent-runtime` 领先 `origin/main` 16 个提交、落后 4 个，未推送。

## Frontier

1. 技能管理 UI（下一项）
2. 删除 / 批量操作二次确认
3. 剪辑高级工具：自动字幕、删静音、转场、导出
4. 整体验收
5. Agnes 视频补测；推送前同步 origin/main

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64、6abef3d、3a406a7、436768d；推送前先同步，重点检查 StudioNodeView / CineNodeView / AudioPlayer / TimelinePane / canvas store / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-*-1.md`、`STAGE-{COMMANDS,NODE-STORAGE,VIEWPORT,AGENT-EDITING,TIMELINE-PREVIEW}-1.md`、`CLIP-PROFILE-1.md`；方案见 `docs/agent-architecture-plan.md`、`docs/director-stage-plan.md`、`docs/director-stage-viewport-plan.md`、`docs/agent-plan.md`。

## 关键 lessons

- 剪辑助手 scope 必须带 timelineId；时间线工具只操作当前打开的剪辑室。
- `timelineStore.dispatchMany(commands, turnId)` 保证一轮 Agent 只压一条撤销历史。
- Agent 的 stage 工具必须立即保存场景文件，并拒绝更旧 `updatedAt` 的快照。
- 白模预演必须走隐藏窗口 `stage-render.html` + ffmpeg image2pipe。
- 隔离测试实例用 `CINELAB_DISABLE_THROTTLE=1` 避免 rAF 被遮挡暂停。

## 设计约定

- 导演台场景存 `<project>/stages/<stageId>.json`；手动编辑与 Agent 共用 `StageCommand`。
- 剪辑助手与画布助手共用 AgentRuntime，按 profile 切换系统提示与工具集。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
