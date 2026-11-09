# CineLab · Boot Packet

> **下一会话优先**：`stage.*` Agent 工具（get / capabilities / addObject / transformObject / addCamera），以及 A2 手动编辑（拖拽变换、属性面板、增删对象/机位）。

## 状态

2026-11-09：生成提案 propose/submit 已完成并真实 Agnes 验证；金额预估已移除。导演台完成三批：StageCommand 骨架、stage 节点与场景存储、A1 3D 视口（原生 three.js）。视口支持对象素模/几何、机位标记、导演/机位视角、选中、截图回画布、自动保存与重开恢复。31 文件 211 测试通过，`typecheck` / `build` 通过，主进程约 449KB。`feat/agent-runtime` 领先 `origin/main` 12 个提交、落后 1 个，未推送。

## Frontier

1. `stage.*` Agent 工具 + A2 手动编辑（下一项）
2. 运镜时间轴与本地白模预演
3. 剪辑助手 clip profile、技能管理 UI
4. 删除 / 批量二次确认
5. 整体验收；Agnes 视频补测

## Gates

- G-AGENT-VIDEO：Agnes Video 2.5 Flash 队列 503，待恢复重试。
- G-AGENT-MAIN：origin/main 新增 a768e64、6abef3d；推送前先同步，重点检查 StudioNodeView / CineNodeView / canvas store / preload / ipc-contract 冲突。

## 证据

`.opencode/handover/evidence/AGENT-{SPIKE,TOOLS,SKILLS,CANVAS-TOOLS,GROUP-TOOLS,PROPOSAL}-1.md`、`STAGE-{COMMANDS,NODE-STORAGE,VIEWPORT}-1.md`；方案见 `docs/director-stage-plan.md`、`docs/director-stage-viewport-plan.md`。

## 关键 lessons

- 付费生成必须两段式：`generation_propose` 只登记，`generation_submit` 不注册给模型。
- 导演台复制/粘贴必须深拷贝 `stages` 文件并换 `stageId`。
- 导演台用原生 three + React 外壳；截图前必须开启 `preserveDrawingBuffer` 并渲染一帧。
- 全屏工作区快捷键让位要同时检查 `.studio-window` 和 `.stage-window`。

## 设计约定

- 导演台场景存 `<project>/stages/<stageId>.json`；手动编辑与 Agent 共用 `StageCommand`。
- Agent 会话存 `<project>/.cinelab/agent/sessions/`，提案存 `<project>/.cinelab/agent/proposals/`。
- 工具执行在渲染进程；主进程构造 scope 与回合事务。
- 模型请求走现有 provider + httpFetch，保持代理生效。
- 主题只通过 `styles/tokens.css` 的 CSS 变量。
