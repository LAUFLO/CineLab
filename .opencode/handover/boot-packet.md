# CineLab · Boot Packet

> **下一会话优先**：导演台场景文件存储与画布 `stage` 节点接入（P0），再接 three.js 视口与 `stage.*` Agent 工具。

## 状态

2026-11-09：生成提案 propose/submit 已完成并真实 Agnes 验证；金额预估已整体移除。StageCommand 骨架完成：场景 schema、17 类命令、原子 batch、撤销/重做历史。30 文件 202 测试通过，`typecheck` 通过。`feat/agent-runtime` 领先 `origin/main` 10 个提交、落后 1 个，未推送。

## Frontier

1. Stage 场景文件存储与画布 `stage` 节点接入（下一项）
2. three.js 3D 视口与机位切换
3. `stage.*` Agent 工具执行层
4. 运镜时间轴与本地白模预演
5. 剪辑助手 clip profile、技能管理 UI、删除/批量二次确认

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64；推送前先同步，重点检查 canvas store / CineNodeView / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-{SPIKE,TOOLS,SKILLS,CANVAS-TOOLS,GROUP-TOOLS,PROPOSAL}-1.md`、`STAGE-COMMANDS-1.md`；方案见 `docs/agent-full-scope.md`、`docs/agent-architecture-plan.md`、`docs/agent-generation-proposal-plan.md`、`docs/director-stage-plan.md`。

## 关键 lessons

- 付费生成必须两段式：`generation_propose` 只登记，`generation_submit` 不注册给模型。
- 生成提案不展示金额预估：供应商计费差异大，部分模型免费。
- StageCommand 原子批量执行：任意一条失败整批回滚。
- 删除父对象要清理子对象 `parentId` 与动作轨；被镜头引用的机位拒绝删除。

## 设计约定

- Agent 会话存 `<project>/.cinelab/agent/sessions/`，提案存 `<project>/.cinelab/agent/proposals/`。
- 导演台场景存 `<project>/stages/<stageId>.json`；手动编辑与 Agent 共用 `StageCommand`。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 模型请求走现有 provider + httpFetch，保持代理生效。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
