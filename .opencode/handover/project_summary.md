# CineLab 项目概览

## 项目

本地优先的 AI 创作无限画布。Electron 45 + React 19 + React Flow 12 + Zustand + Tailwind 4 + TypeScript 7。主进程即后端，渲染进程不直接访问文件系统或外部 API；存储使用 JSON / JSONL。

## 结构

| 目录 | 内容 |
|---|---|
| `src/main` | 主进程：项目、设置、生成、媒体、时间线、拉片、Agent |
| `src/shared` | 画布/时间线/技能/Agent 类型与纯函数 |
| `src/renderer/src` | 画布、剪辑室、拉片室、导演台入口、Agent 面板 |
| `docs` | 方案、规格、计划 |
| `.opencode/handover` | 状态真相源、接续包、证据 |

## 当前进度

`phase = AGENT`，进行中。通用 AgentRuntime 已基于 `origin/main` 重建，旧剪辑助手已删除。

| 项 | 结论 |
|---|---|
| `AGENT-SPIKE-1` | 自研运行时闭环；真实 Agnes 3.0 Flash 工具调用、SSE 流式、Image 2.5 Flash 出图、本地代理通过 |
| `AGENT-TOOLS-1` | 工具注册表 + `CanvasCommand`；同一回合多命令一条撤销 |
| `AGENT-SKILLS-1` | 内置/全局/项目三级技能目录；`SKILL.md` 解析、`skill_list` / `skill_read` |
| `AGENT-CANVAS-TOOLS-1` | 创建 / 连接 / 删除节点 |
| `AGENT-GROUP-TOOLS-1` | 分组 / 解散分组 |
| `AGENT-PROPOSAL-1` | 生成提案 propose/submit、提案卡、幂等、失效 |
| 验证 | 185 测试、`typecheck`、`build` 通过；真实 Agnes 图片提案生成完成 |
| 分支 | `feat/agent-runtime` 领先 `origin/main` 7 个提交、落后 1 个（a768e64），未推送；推送前先同步 |

## 关键工件

- `docs/agent-full-scope.md`：Agent 完整功能范围
- `docs/agent-architecture-plan.md`：运行时、工具协议、权限、回合、上下文、技能
- `docs/agent-generation-proposal-plan.md`：生成提案字段、状态机、幂等与失效规则
- `docs/director-stage-plan.md`：3D 片场 + 本地白模预演
- `docs/clip-studio-plan.md`：剪辑室
- `docs/film-study-plan.md`：拉片室
- `.opencode/handover/state.json`：唯一状态真相源
- `.opencode/handover/evidence/AGENT-*.md`：Agent 验证记录

## 下一步

1. `StageCommand` 骨架
2. 剪辑助手 `clip` profile
3. 技能管理 UI
4. 删除 / 批量操作二次确认
5. 整体验收；Agnes 视频队列补测

## 设计约定

- 主题只通过 `styles/tokens.css` 的 CSS 变量。
- 画布/时间线/技能/Agent 数据结构放 `src/shared`。
- 模型请求走主进程 `httpFetch`，保持 Electron 会话代理生效。
- Agent 会话存 `<project>/.cinelab/agent/sessions/<id>.jsonl`。
- 生成提案存 `<project>/.cinelab/agent/proposals/<id>.json`。
- 工具执行在渲染进程；主进程构造 scope、权限和回合事务。
- 生成必须走提案确认，不直接执行；`generation_submit` 不暴露给模型。

## 输入源

`AGENTS.md` 的「状态与工件路径约定」；`state.json` 为真相源；`docs/` 提供方案；`evidence/` 提供验证记录。敏感 Key 只存在仓库外本地测试目录，不写入仓库。
