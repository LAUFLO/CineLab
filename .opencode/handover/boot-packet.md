# CineLab · Boot Packet

> **下一会话优先**：生成提案 propose/submit —— Agent 只登记生成单，用户确认后才提交；含目标、模型、参数、数量、预估费用、失效规则、幂等与失败查单。

## 状态

2026-11-08：通用 AgentRuntime 已基于 main 重建；工具注册表、CanvasCommand、技能目录、创建/连接/删除/分组工具完成。真实 Agnes 文本/图片/流式/本地代理验证通过；159 测试通过。`feat/agent-runtime` 领先 `origin/main` 6 个提交、落后 1 个，未推送。

## Frontier

1. 生成提案 propose/submit（下一项）
2. StageCommand 骨架
3. 剪辑助手 clip profile
4. 技能管理 UI
5. 整体验收；Agnes 视频补测

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64；推送前先同步，重点检查 canvas store / CineNodeView / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-{SPIKE,TOOLS,SKILLS,CANVAS-TOOLS,GROUP-TOOLS}-1.md`；方案见 `docs/agent-full-scope.md`、`docs/agent-architecture-plan.md`。

## 关键 lessons

- 同一 turnId 只 pushHistory 一次。
- 创建节点后把 createdNodeIds 加入本轮 scope。
- 技能读取在主进程 realpath 校验，只允许 SKILL.md/references/assets。

## 设计约定

- Agent 会话存 `<project>/.cinelab/agent/sessions/`。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 模型请求走现有 provider + httpFetch，保持代理生效。
