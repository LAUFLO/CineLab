# CineLab 文档索引

日期：2026-11-16
状态：现行
适用版本：v0.2.1
最后核对：2026-11-16

> 本索引只列「现行系统文档」和「仍在推进的方案」。已完成或已废弃的方案统一放在 [`archive/`](archive/)，只作设计参考，不再维护。

## 1. 现行系统文档

这些文档描述当前实现，功能合并后必须同步更新。

| 文档 | 内容 | 最后更新 |
|---|---|---|
| [README](../README.md) | 产品介绍、功能、技术栈、快速开始、路线图 | 2026-11-16 |
| [architecture.md](architecture.md) | 主进程架构、项目文件格式、Provider、IPC、存储 | 2026-11-13 |
| [ui-spec.md](ui-spec.md) | 布局、节点、Prompt Bar、工具栏、主题、CineBot/剪辑/导演台/拉片 | 2026-11-16 |
| [models.md](models.md) | `models.json` 格式与 Provider 配置 | 2026-11-13 |
| [agent-architecture-plan.md](agent-architecture-plan.md) | AgentRuntime 设计 + Phase 1–4 实施状态 | 2026-11-13 |
| [agent-capabilities.md](agent-capabilities.md) | CineBot 当前工具、参数、确认和撤销 | 2026-11-13 |
| [roadmap-plan.md](roadmap-plan.md) | 当前状态与剩余 backlog | 2026-11-13 |
| [branch-policy.md](branch-policy.md) | 分支类型、main 保护、PR 与清理流程 | 2026-11-13 |

## 2. 活跃方案

仍在推进或等待排期的设计文档，动工前先读对应方案。

| 文档 | 内容 | 状态 |
|---|---|---|
| [depth-capture-plan.md](depth-capture-plan.md) | 深度动作捕捉 | 方案已确认，待排期 |
| [node-toolbar-plan.md](node-toolbar-plan.md) | 节点工具栏操作清单 | 待排期 |
| [group-nodes.md](group-nodes.md) | 分组节点与分镜组 | 待开分支 |
| [bottom-toolbar-plan.md](bottom-toolbar-plan.md) | 底部工具栏 | 待实施 |
| [runtime-components-plan.md](runtime-components-plan.md) | 本地 runtime 组件下载与发布 | 实施中 |
| [reference-audio-plan.md](reference-audio-plan.md) | 参考音频链路：Agnes `audios`、统一校验与槽位 | 已实现，保留参考 |
| [capability-consistency-plan.md](capability-consistency-plan.md) | 能力一致性治理：适配器能力表、统一闸门与审计 | 已实现，保留参考 |
| [placeholder-operations-plan.md](placeholder-operations-plan.md) | 占位操作补齐 | 实施中 |
| [models-config-unify-plan.md](models-config-unify-plan.md) | 模型配置统一 | 实施中 |
| [model-onboarding-plan.md](model-onboarding-plan.md) | 模型配置引导 | 实施中 |
| [derived-nodes-group-plan.md](derived-nodes-group-plan.md) | 派生节点自动成组 | 实施中 |
| [error-feedback-plan.md](error-feedback-plan.md) | 统一错误与任务反馈 | 实施中 |
| [p3-refactor-plan.md](p3-refactor-plan.md) | P3 架构拆分计划与进度 | 部分完成 |
| [node-output-target-plan.md](node-output-target-plan.md) | 节点操作输出目标：版本回写 / 新建节点规则 | 已实现，保留参考 |
| [clip-studio-backlog.md](clip-studio-backlog.md) | 剪辑室后续项 | Backlog |
| [agent-full-scope.md](agent-full-scope.md) | Agent 完整范围 | 参考 |
| [update-mirror-plan.md](update-mirror-plan.md) | 更新源失败兜底：GitHub 主源 + 镜像代理手动下载 | 已实现 |

## 3. 历史归档

[`archive/`](archive/) 下存放已完成、已废弃或已归档的方案，共 30 份，只用于追溯设计动机，不要求与代码同步：

- Agent：`agent-plan.md`、`agent-capability-plan.md`、`agent-generation-proposal-plan.md`、`agent-generation-operations-plan.md`、`agent-phase3-plan.md`、`node-operation-bridge-plan.md`
- 模型配置：`model-config-v2-plan.md`、`model-config-merge-plan.md`、`model-params-plan.md`
- Prompt Bar：`promptbar-input-modes-plan.md`、`prompt-mention-plan.md`
- Tailwind 迁移：`tailwind-migration-plan.md`、`tailwind-anchor-migration-plan.md`
- 剪辑室：`clip-studio-plan.md`、`studio-film-merge-plan.md`
- 拉片：`film-study-plan.md`
- 导演台：`director-stage-plan.md`、`director-stage-viewport-plan.md`
- 工程：`engineering-quality-plan.md`、`p2-acceptance.md`
- 其他：`video-operations-plan.md`、`remaining-features-plan.md`、`sora-video-plan.md`、`project-cover-plan.md`、`logging-plan.md`、`library-export-enhancements-plan.md`、`project-templates-plan.md`、`update-plan.md`、`general-settings-plan.md`、`beef-tv-depth-research.md`

归档文档不要求与代码同步。需要恢复时从 `archive/` 移回并在本索引登记。

## 4. 工程与协作

| 文档 | 内容 |
|---|---|
| [doc-impact.md](doc-impact.md) | 代码路径 → 文档影响映射 |
| [../SECURITY.md](../SECURITY.md) | 漏洞报告与支持范围 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 开发、测试、PR 与发布约定 |

## 5. 维护约定

1. 现行文档头部必须写清：日期、状态（现行）、适用版本（`vX.Y.Z`）、最后核对（`YYYY-MM-DD`）。
2. 已完成的方案改为「状态：历史（日期 归档）」，并移入 `docs/archive/`。
3. 现行系统文档每次功能合并后同步更新；`ui-spec.md` 涉及界面变化时必须更新。
4. 新增文档先判断归属：现行系统文档、活跃方案、历史归档，三选一。
5. 修改文档后执行 `corepack pnpm check:docs`，检查状态头、相对链接、索引、现行/历史分类和 Agent 工具清单。
