# CineLab · Boot Packet

> **下一会话优先**：three.js 3D 视口与机位切换——在导演台节点内打开全屏编辑器，先做素模/几何、导演视角与机位视角。

## 状态

2026-11-09：生成提案 propose/submit 已完成并真实 Agnes 验证；金额预估已整体移除。StageCommand 骨架、画布 `stage` 节点与场景存储已完成：场景存 `<project>/stages/<stageId>.json`，复制/粘贴深拷贝，重开保留。31 文件 211 测试通过，`typecheck` / `build` 通过，主进程约 448KB。`feat/agent-runtime` 领先 `origin/main` 11 个提交、落后 1 个，未推送。

## Frontier

1. three.js 3D 视口与机位切换（下一项）
2. `stage.*` Agent 工具执行层
3. 运镜时间轴与本地白模预演
4. 剪辑助手 clip profile、技能管理 UI
5. 删除 / 批量二次确认；整体验收

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64；推送前先同步，重点检查 canvas store / CineNodeView / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-{SPIKE,TOOLS,SKILLS,CANVAS-TOOLS,GROUP-TOOLS,PROPOSAL}-1.md`、`STAGE-{COMMANDS,NODE-STORAGE}-1.md`；方案见 `docs/agent-full-scope.md`、`docs/agent-architecture-plan.md`、`docs/agent-generation-proposal-plan.md`、`docs/director-stage-plan.md`。

## 关键 lessons

- 付费生成必须两段式：`generation_propose` 只登记，`generation_submit` 不注册给模型。
- 生成提案不展示金额预估：供应商计费差异大，部分模型免费。
- StageCommand 原子批量执行：任意一条失败整批回滚。
- 导演台复制/粘贴必须深拷贝 `stages` 文件并换 `stageId`，否则共享场景。
- 删除导演台节点不要立即删场景文件：画布撤销无法恢复文件。

## 设计约定

- Agent 会话存 `<project>/.cinelab/agent/sessions/`，提案存 `<project>/.cinelab/agent/proposals/`。
- 导演台场景存 `<project>/stages/<stageId>.json`；手动编辑与 Agent 共用 `StageCommand`。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 模型请求走现有 provider + httpFetch，保持代理生效。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
