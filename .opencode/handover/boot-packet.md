# CineLab · Boot Packet

> **下一会话优先**：StageCommand 骨架 —— 导演台场景、机位、运镜命令与 schema，先不接 UI。

## 状态

2026-11-09：生成提案 propose/submit 已完成并真实 Agnes 验证：catalog → 提案卡 → 用户确认 → 图片生成完成写回节点；重复提交返回同一 runId；新消息使 pending 提案立即失效；金额预估已整体移除。29 文件 185 测试通过，`typecheck` / `build` 通过，主进程约 436KB。`feat/agent-runtime` 领先 `origin/main` 9 个提交、落后 1 个，未推送。

## Frontier

1. StageCommand 骨架（下一项）
2. 剪辑助手 clip profile 重建
3. 技能管理 UI
4. 删除 / 批量操作二次确认
5. 整体验收；Agnes 视频提案补测

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64；推送前先同步，重点检查 canvas store / CineNodeView / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-{SPIKE,TOOLS,SKILLS,CANVAS-TOOLS,GROUP-TOOLS,PROPOSAL}-1.md`；方案见 `docs/agent-full-scope.md`、`docs/agent-architecture-plan.md`、`docs/agent-generation-proposal-plan.md`。

## 关键 lessons

- 付费生成必须两段式：`generation_propose` 只登记，`generation_submit` 不注册给模型。
- 提案提交前先原子写 `submitting`，拿到 runId 后写 `submitted`；重复提交返回原 runId。
- 目标节点和参考节点必须在当前 turn scope；IPC 层要二次校验。
- 生成提案不展示金额预估：供应商计费差异大，部分模型免费。

## 设计约定

- Agent 会话存 `<project>/.cinelab/agent/sessions/`，提案存 `<project>/.cinelab/agent/proposals/`。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 模型请求走现有 provider + httpFetch，保持代理生效。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
