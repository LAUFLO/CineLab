# CineLab 文档索引

日期：2026-11-28
状态：现行
适用版本：v0.5.6
最后核对：2026-11-28

> 远程仓库只保留稳定契约、参考文档和一份精简的归档。过程记录、截图和批次 evidence 放本地 `.opencode/`，不入库。

## 1. 现行系统文档

这些文档描述当前实现，功能合并后必须同步更新。

| 文档 | 内容 | 最后更新 |
|---|---|---|
| [README](../README.md) | 产品介绍、功能、技术栈、快速开始 | 2026-11-16 |
| [architecture.md](architecture.md) | 主进程架构、项目文件格式、Provider、IPC、存储 | 2026-11-14 |
| [ui-spec.md](ui-spec.md) | 布局、节点、Prompt Bar、工具栏、主题、CineBot/剪辑/导演台/拉片 | 2026-11-16 |
| [models.md](models.md) | `models.json` 格式与 Provider 配置 | 2026-11-15 |
| [roadmap-plan.md](roadmap-plan.md) | 当前状态与剩余 backlog | 2026-11-14 |
| [branch-policy.md](branch-policy.md) | 分支类型、main 保护、PR 与清理流程 | 2026-11-13 |
| [agent-capabilities.md](agent-capabilities.md) | CineBot 当前工具、参数、确认和撤销 | 2026-11-18 |

## 2. 参考文档

不要求与代码逐行同步，只在设计或排查时查阅。

| 文档 | 内容 |
|---|---|
| [agent-architecture-plan.md](agent-architecture-plan.md) | AgentRuntime 设计参考 |
| [agent-runtime-v3-plan.md](agent-runtime-v3-plan.md) | CineBot 运行时 v3：pi-coding-agent 整包重构方案，已评审 |
| [skills-import-plan.md](skills-import-plan.md) | 技能页全部显示、卡片启用开关、文件夹/ZIP 导入与 SKILL.md 校验，已实施 |
| [agent-runtime-v3-spike.md](agent-runtime-v3-spike.md) | M0 spike 报告：动态 import、最小闭环、包体与安装包结论 |
| [agent-full-scope.md](agent-full-scope.md) | Agent 完整范围总表 |
| [clip-studio-backlog.md](clip-studio-backlog.md) | 剪辑室后续项 |
| [doc-impact.md](doc-impact.md) | 代码路径 → 文档影响映射 |
| [studio-node-live-preview-plan.md](studio-node-live-preview-plan.md) | 剪辑室节点实时预览，待实施 |
| [stem-separation-plan.md](stem-separation-plan.md) | 人声/背景音分离：三项菜单、无声视频 + 音频输出、本地 Demucs 组件、分段流式与任务进度，已实施，真实素材听感待验收 |
| [result-node-promptbar-plan.md](result-node-promptbar-plan.md) | 结果/素材节点隐藏 PromptBar：操作结果、AI 新建结果、拉片/导演台/剪辑室产出与旧项目兜底 |
| [previs-adaptation-plan.md](previs-adaptation-plan.md) | Previs 语义镜头与场景图白膜历史方案；程序化世界已移除 |
| [film-study-rebuild-plan.md](film-study-rebuild-plan.md) | 逐帧拉片重构：拉片为画布服务、删除拉片室、image 首尾帧 + 文本节点、复刻建图与手动生成 |
| [stage-previs-upgrade-plan.md](stage-previs-upgrade-plan.md) | 导演台整片/每镜预演、重叠优先级、交付物、光照预设与人物动作改造，已实施 |
| [model-adapter-plan.md](model-adapter-plan.md) | 模型适配体系：契约、媒体载荷、本地适配器、Agent 接入与首尾帧修复 |
| [local-adapters.md](local-adapters.md) | 本地可信适配器：目录、manifest、接口、构建与热重载 |
| [mcp.md](mcp.md) | MCP server：设置页配置、HTTP/stdio、100 个工具、只读模式与排查 |
| [mcp-expansion-plan.md](mcp-expansion-plan.md) | MCP 开放能力与配置面板：设置页、只读模式、新增 15 个工具，已实施 |
| [mcp-agent-unification-plan.md](mcp-agent-unification-plan.md) | MCP 与 CineBot 能力统一：命名对齐、声明投影、独立 scope、命令注册表、覆盖率校验，方案阶段 |
| [macos-packaging-gaps-plan.md](macos-packaging-gaps-plan.md) | macOS 打包资源缺口、视觉组件复用、字幕字体与发版校验，待实施 |
| [ui-polish-plan.md](ui-polish-plan.md) | 画布与设置页 UI 打磨：参数单位、连线光效、菜单裁切、素材节点、快捷键、技能卡片与设置重组 |
| [xyflow-v13-migration-plan.md](xyflow-v13-migration-plan.md) | React Flow 13 迁移评估：破坏性变更影响矩阵、store changeset、useStore 拆分、fitView padding 与 CSS layer 改动方案，待实施 |
| [prompt-preset-plan.md](prompt-preset-plan.md) | 预设提示词：悬浮窗、名称胶囊、任意位置插入与发送展开，已确认 |
| [promptbar-popover-plan.md](promptbar-popover-plan.md) | PromptBar 浮窗与胶囊改造：确认框层级、居中浮窗、卡片网格与预览、绿色预设胶囊、节点自动就位，已实施 |
| [workflow-plan.md](workflow-plan.md) | 工作流模板：保存用户画布流程、占位节点、导演台打包、拉片/剪辑占位、导入导出与 Agent 工具，方案确定 |
| [outpaint-model-plan.md](outpaint-model-plan.md) | 扩图改为生图模型图生图：删除本地 LaMa、比例只来自菜单、精确优先近似兜底 |
| [layer-split-plan.md](layer-split-plan.md) | 图层分离改为模型分层 + 本地图层合成（含组件在线更新 P5）：删除本地、四种输入、拖出/拖回、合并写回，方案已确认 |
| [inline-node-editor-plan.md](inline-node-editor-plan.md) | 节点内联操作编辑器：拖动隐藏浮层、15 个源内容操作全部改为节点内 UI、媒体尺寸自愈，实施中 |
| [video-crop-custom-plan.md](video-crop-custom-plan.md) | 画面裁切：删除原比例、增加 4:3 / 3:4 / 21:9 与自定义宽高比 |
| [text-wysiwyg-plan.md](text-wysiwyg-plan.md) | 文本节点 Markdown 所见即所得：Milkdown、删除预览切换与格式工具栏 |
| [close-background-plan.md](close-background-plan.md) | 关闭确认（后台运行/退出）与系统托盘自绘菜单，已实施 |
| [stage-previs-redesign-plan.md](stage-previs-redesign-plan.md) | 导演台 3D 白模预演改进：全景背景、摆位打组、运镜时间轴、GLB、生成闭环与对话式智能预演，方案已确认 |
| [stage-freehand-paths-plan.md](stage-freehand-paths-plan.md) | 导演台手绘路径与运镜：自由曲线、相机/对象路径、镜头跟随、时间关键帧与窗口按钮修复，已实施 |
| [director-stage-beginner-plan.md](director-stage-beginner-plan.md) | 导演台小白友好化：机位可视化拖拽、三步向导与出片闭环，方案已认可待实施 |

## 3. 代码地图

入库的代码上下文，跨机器同步；出方案前先读。能力判断以代码为准。

| 文档 | 内容 |
|---|---|
| [code-map/README.md](code-map/README.md) | 模块索引、需求→模块、阅读顺序 |
| [code-map/00-overview.md](code-map/00-overview.md) | 技术栈、进程模型、目录职责、项目结构 |
| [code-map/01-canvas.md](code-map/01-canvas.md) | 画布、节点、连线、项目画布 |
| [code-map/02-generation.md](code-map/02-generation.md) | 供应商、模型、生成任务、参数、参考输入 |
| [code-map/03-clip-studio.md](code-map/03-clip-studio.md) | 时间线、剪辑、字幕、音频 |
| [code-map/04-director-stage.md](code-map/04-director-stage.md) | 导演台、StageDoc、语义镜头、白模导出 |
| [code-map/05-film-study.md](code-map/05-film-study.md) | 拉片、自动分镜、分镜表 |
| [code-map/06-agent.md](code-map/06-agent.md) | CineBot、工具、提案、会话、技能 |
| [code-map/07-storage-ipc.md](code-map/07-storage-ipc.md) | 项目存储、IPC、preload、设置、安全 |
| [code-map/08-capabilities.md](code-map/08-capabilities.md) | 已实现 / 部分实现 / 仅文档 |
| [code-map/09-dev-workflow.md](code-map/09-dev-workflow.md) | 方案、实施、更新地图、校验 |
| [code-map/10-ui.md](code-map/10-ui.md) | 通用 UI 组件、设置/素材库面板、主题与样式 |
| [code-map/11-feature-index.md](code-map/11-feature-index.md) | 按关键词查已有实现，防重复造轮子 |
| [code-map/_generated.md](code-map/_generated.md) | 自动生成的模块规模、IPC、Agent 工具、测试清单 |

## 4. 历史归档

[`archive/`](archive/) 只保留关键设计，共 21 份，不再维护：

- 剪辑与导演：`clip-studio-plan.md`、`director-stage-plan.md`
- Prompt Bar 与参考：`promptbar-input-modes-plan.md`、`node-output-target-plan.md`、`reference-audio-plan.md`
- 模型配置：`model-config-v2-plan.md`、`models-config-unify-plan.md`、`model-onboarding-plan.md`、`update-mirror-plan.md`
- 工程与质量：`engineering-quality-plan.md`、`p3-refactor-plan.md`
- 视频与操作：`video-operations-plan.md`、`node-toolbar-plan.md`、`placeholder-operations-plan.md`
- 其他方案：`bottom-toolbar-plan.md`、`depth-capture-plan.md`、`group-nodes.md`、`derived-nodes-group-plan.md`、`error-feedback-plan.md`、`runtime-components-plan.md`、`capability-consistency-plan.md`

## 5. 工程与协作

| 文档 | 内容 |
|---|---|
| [doc-impact.md](doc-impact.md) | 代码路径 → 文档影响映射 |
| [../SECURITY.md](../SECURITY.md) | 漏洞报告与支持范围 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 开发、测试、PR 与发布约定 |

## 6. 维护约定

1. 现行文档头部必须写清：日期、状态（现行）、适用版本、最后核对。
2. 只有「现行系统文档」要求跟代码同步；参考文档和归档不要求。
3. 方案完成后先改状态为「历史（日期 归档）」，再移入 `docs/archive/`。
4. 过程记录、截图、批次 evidence 放 `.opencode/`，不入库。
5. 新增文档先判断归属：现行系统文档、参考文档、历史归档，三选一。
6. 修改文档后执行 `corepack pnpm check:docs`。
