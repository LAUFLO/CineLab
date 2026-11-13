# CineLab 文档索引

日期：2026-11-13
状态：现行
适用版本：v0.1.0
最后核对：2026-11-13

> 本索引用于区分“现行系统文档”和“历史方案”。未列入现行文档的旧方案默认只作为设计参考，不再代表当前实现。

## 1. 现行系统文档

| 文档 | 内容 | 最后更新 |
|---|---|---|
| [README](../README.md) | 产品介绍、功能、技术栈、快速开始、路线图 | 2026-11-13 |
| [architecture.md](architecture.md) | 主进程架构、项目文件格式、Provider、IPC、存储 | 2026-11-13 |
| [ui-spec.md](ui-spec.md) | 布局、节点、Prompt Bar、工具栏、主题、CineBot/剪辑/导演台/拉片 | 2026-11-13 |
| [models.md](models.md) | `models.json` 格式与 Provider 配置 | 2026-11-13 |
| [agent-architecture-plan.md](agent-architecture-plan.md) | AgentRuntime 设计 + Phase 1–4 实施状态 | 2026-11-13 |
| [agent-capabilities.md](agent-capabilities.md) | CineBot 当前工具、参数、确认和撤销 | 2026-11-13 |
| [roadmap-plan.md](roadmap-plan.md) | 当前状态与剩余 backlog | 2026-11-13 |
| [branch-policy.md](branch-policy.md) | 分支类型、main 保护、PR 与清理流程 | 2026-11-13 |

## 2. 已实施功能方案

这些文档记录已进入 main 的设计和验收，阅读时以对应代码和 evidence 为准。

| 文档 | 内容 |
|---|---|
| [agent-capability-plan.md](agent-capability-plan.md) | CineBot 能力扩展总方案，Phase 1–4 |
| [agent-generation-proposal-plan.md](agent-generation-proposal-plan.md) | 生成提案 propose / submit |
| [agent-generation-operations-plan.md](agent-generation-operations-plan.md) | 模型类节点操作接入 generation_propose |
| [agent-phase3-plan.md](agent-phase3-plan.md) | 拉片段落、导演台镜头/背景、能力搜索 |
| [node-operation-bridge-plan.md](node-operation-bridge-plan.md) | 节点操作桥与统一执行器 |
| [node-output-target-plan.md](node-output-target-plan.md) | 节点操作输出目标：版本回写 / 新建节点规则 |
| [agent-plan.md](agent-plan.md) | 剪辑助手编排 |
| [clip-studio-plan.md](clip-studio-plan.md) | 剪辑室多轨时间线、自动粗剪、字幕、导出 |
| [director-stage-plan.md](director-stage-plan.md) | 导演台 3D 场景、机位、镜头、白模预演 |
| [director-stage-viewport-plan.md](director-stage-viewport-plan.md) | 导演台 3D 视口实现 |
| [film-study-plan.md](film-study-plan.md) | 节点式逐帧拉片、自动分镜、AI 描述、导出 |
| [studio-film-merge-plan.md](studio-film-merge-plan.md) | 剪辑室成片节点合并 |
| [group-nodes.md](group-nodes.md) | 分组节点与分镜组 |
| [node-toolbar-plan.md](node-toolbar-plan.md) | 节点工具栏操作清单 |
| [depth-capture-plan.md](depth-capture-plan.md) | 深度动作捕捉 |
| [runtime-components-plan.md](runtime-components-plan.md) | 本地 runtime 组件下载与发布 |
| [video-operations-plan.md](video-operations-plan.md) | 视频专用操作 |
| [model-params-plan.md](model-params-plan.md) | 模型参数编辑 |
| [model-onboarding-plan.md](model-onboarding-plan.md) | 模型配置引导 |
| [models-config-unify-plan.md](models-config-unify-plan.md) | 模型配置统一 |
| [sora-video-plan.md](sora-video-plan.md) | Sora 风格视频适配器与 BeefTV Seedance 接入 |
| [project-cover-plan.md](project-cover-plan.md) | 项目封面 |
| [project-templates-plan.md](project-templates-plan.md) | 项目模板 |
| [prompt-mention-plan.md](prompt-mention-plan.md) | Prompt Bar @ 引用 |
| [library-export-enhancements-plan.md](library-export-enhancements-plan.md) | 资产库与导出增强 |
| [logging-plan.md](logging-plan.md) | 本地日志 |
| [error-feedback-plan.md](error-feedback-plan.md) | 统一错误与任务反馈 |
| [general-settings-plan.md](general-settings-plan.md) | 通用设置 |
| [update-plan.md](update-plan.md) | 自动更新 |
| [derived-nodes-group-plan.md](derived-nodes-group-plan.md) | 派生节点自动成组 |
| [bottom-toolbar-plan.md](bottom-toolbar-plan.md) | 底部工具栏 |
| [remaining-features-plan.md](remaining-features-plan.md) | 剩余本地增强 |

## 3. 待实施 / Backlog

| 文档 | 内容 |
|---|---|
| [roadmap-plan.md](roadmap-plan.md) | 当前剩余 backlog 和优先级 |
| [engineering-quality-plan.md](engineering-quality-plan.md) | 工程质量、仓库隐私、文档治理与 Tailwind 决策（讨论稿） |
| [clip-studio-backlog.md](clip-studio-backlog.md) | 剪辑室后续项 |
| [placeholder-operations-plan.md](placeholder-operations-plan.md) | 占位操作补齐 |

## 4. 历史与参考

| 文档 | 用途 |
|---|---|
| [beef-tv-depth-research.md](beef-tv-depth-research.md) | BeefTV 深度组件调研 |
| [agent-full-scope.md](agent-full-scope.md) | Agent 早期范围草案，作为历史参考 |
| [agent-architecture-plan.md](agent-architecture-plan.md) | 架构设计部分保留，实施状态见文首 |

## 5. 工程与协作

| 文档 | 内容 |
|---|---|
| [doc-impact.md](doc-impact.md) | 代码路径 → 文档影响映射 |
| [../SECURITY.md](../SECURITY.md) | 漏洞报告与支持范围 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 开发、测试、PR 与发布约定 |

## 6. 维护约定

1. 现行文档头部必须写清：日期、状态（现行）、适用版本（`vX.Y.Z`）、最后核对（`YYYY-MM-DD`）。
2. 已完成的方案改为「状态：历史」，并在头部写明归档日期；历史文档不再要求版本戳与代码同步。
3. 现行系统文档（README / architecture / ui-spec / models / agent-architecture-plan / agent-capabilities / roadmap / branch-policy）每次功能合并后同步更新。
4. 不确定是否仍有效的旧文档，移到“历史与参考”，不要继续写成待实施。
5. 修改文档后执行 `corepack pnpm check:docs`，检查状态头、相对链接、索引、现行/历史分类、路径引用和 Agent 工具清单；CI 也会执行。
