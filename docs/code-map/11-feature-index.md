# 11 功能索引

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

> 用途：出方案前先按关键词搜这张表，判断「已有实现」还是「需要新建」。
> 原则：搜到就复用或扩展；搜不到再读对应模块地图确认，最后才新建。
> 新增/删除能力后，同步更新本表与 [08-capabilities.md](08-capabilities.md)。

## 使用方式

1. 用需求里的关键词在本表搜索；
2. 命中：读「入口」文件，确认能否复用或加参数；
3. 未命中：读对应模块地图（01–10）与 `_generated.md`，确认是否已有类似能力；
4. 方案里写「已有实现检查」：复用 / 扩展 / 新建，并说明理由；
5. 实现后更新本表、08 与模块文档。

## 画布与节点

| 关键词 | 已有实现 | 入口 | 状态 |
|---|---|---|---|
| 节点类型 | text/image/video/audio/study/studio/film/video-op/stage | `src/shared/canvas-schema.ts` | 已实现 |
| 连线、分组、框选 | `CanvasCommand` 8 种命令 | `src/shared/canvas-commands.ts` | 已实现 |
| 节点工具栏操作 | 17 个 operationId | `src/shared/node-operation-specs.ts` | 已实现 |
| 版本栈、上游引用 | `OutputRef` + `clearEdgeReferences` | `src/renderer/src/stores/canvas-model.ts` | 已实现 |
| 项目画布、多画布 | `.cinelab` 项目 | `src/main/project/manager.ts` | 已实现 |
| 素材库 | 全局/项目素材、标签、模板 | `src/main/library/` | 已实现 |
| 提示词栏、参数面板 | PromptBar、ModelMenu、ParamPanel | `src/renderer/src/canvas/PromptBar.tsx` | 已实现 |
| 节点生成配置持久化 | `modelKey` / `params` 随节点保存，切换节点恢复 | `src/shared/canvas-schema.ts`、`PromptBar.tsx` | 已实现 |
| 工作流模板、占位节点 | 画布子图保存为资产库 `工作流/` 目录包；`workflowSlot` 占位；导演台打包、拉片/剪辑室占位；导入导出 | `src/main/workflows/`、`src/main/library/workflows.ts`、`src/renderer/src/canvas/WorkflowSaveDialog.tsx`、`panels/library/WorkflowGrid.tsx` | 已实现 |

## 生成与模型

| 关键词 | 已有实现 | 入口 | 状态 |
|---|---|---|---|
| 模型供应商 | OpenAI 兼容、Kling、MiniMax、Sora、火山、Agnes、HTTP 模板 | `src/main/providers/` | 已实现 |
| 生成模式 | 9 种归一化模式 | `src/shared/model-modes.ts` | 已实现 |
| 参数预设/约束 | `ParamDef` 条件（when/force/deny） | `src/shared/param-presets.ts` | 已实现 |
| 生成队列 | 并发 2（1–4）、取消、事件 | `src/main/engine/queue.ts` | 已实现 |
| 参考输入 | 图/视频/音频、角色/遮罩 | `src/shared/reference-inputs.ts` | 已实现 |
| 宫格/拼接/抽帧/裁剪/转码 | 媒体处理 | `src/main/media/` | 已实现 |
| 结果节点隐藏 PromptBar | 操作/AI/拉片/导演台/剪辑室结果只保留工具栏 | `PromptBar.tsx`、`node-operation-specs.ts`、`stores/canvas/slices/assets.ts` | 已实现 |
| 人声/背景音分离 | Demucs htdemucs、无声视频 + 音频、FIFO 任务 | `src/main/media/stems.ts`、`resources/stem-worker/worker.py` | 已实现 |
| 素材入库 | `ingestAsset` | `src/main/assets/ingest.ts` | 已实现 |
| 错误文案 | 配额/鉴权/超时 | `src/main/engine/generation-error.ts` | 已实现 |
| 风格库、风格胶囊 | 官方只读 + 自定义、按输入框居中浮窗（一行 8 列小封面）、分类浏览、单击即应用、单选胶囊内联输入框首行（× 角标）；资产库“风格”同源展示 | `src/main/library/styles.ts`、`StyleLibraryDialog.tsx`、`PromptBar.tsx`、`LibraryWindow.tsx`、`StyleFolderGrid.tsx`、`src/shared/style-prompt.ts` | 已实现 |
| 预设提示词 | 资产库“提示词”同源、按输入框居中浮窗、CRUD、三列卡片（标题行操作 + 全文预览）、名称胶囊任意位置插入、胶囊不重叠（绿色无图标）、发送原位展开、风格置顶 | `src/shared/prompt-preset.ts`、`PresetPromptDialog.tsx`、`PromptBar.tsx`、`promptbar-model.tsx`、`LibraryWindow.tsx` | 已实现 |
| 资产库提示词卡片 | 按钮行统一尺寸、卡片等高、新建提示词在面包屑右侧 | `TemplateGrid.tsx`、`LibraryWindow.tsx` | 已实现 |

## 剪辑室

| 关键词 | 已有实现 | 入口 | 状态 |
|---|---|---|---|
| 时间线 | `TimelineDoc`、轨道/片段/标记 | `src/shared/timeline-schema.ts` | 已实现 |
| 剪辑、裁剪、分割 | `TimelineCommand`、`timeline-edit` | `src/shared/timeline-commands.ts` | 已实现 |
| 转场、关键帧 | transition/keyframes | `src/shared/timeline-transition.ts`、`timeline-keyframes.ts` | 已实现 |
| 字幕 | 字幕轨 + VTT 导出 | `src/shared/subtitles.ts`、`src/main/timeline/vtt.ts` | 已实现 |
| 音频 | 音量/淡入淡出/变速/音效 | `src/shared/audio-fx.ts`、`src/main/timeline/audio-mix.ts` | 已实现 |
| 成片导出 | fast-path、stream-copy、滤镜 | `src/main/timeline/export.ts` | 已实现 |
| 转录、静音、节拍 | 时间线分析 | `src/main/timeline/transcribe.ts`、`analysis.ts` | 已实现 |

## 导演台与白模预演

| 关键词 | 已有实现 | 入口 | 状态 |
|---|---|---|---|
| 场景/机位/镜头 | `StageDoc`、`StageShot`、`StageCamera` | `src/shared/stage-schema.ts` | 已实现 |
| 语义镜头 | 关系/距离/高度/构图求解 | `src/shared/stage-shot-intent.ts` | 已实现 |
| 整片时间线、重叠 | `StageProgramEntry` + `front` | `src/shared/stage-program.ts` | 已实现 |
| 整片播放 | `playbackScope='program'` | `src/renderer/src/stage/stageStore.ts` | 已实现 |
| 整片/每镜导出 | `exportPreview(scope/items)` | `src/main/stage/export.ts` | 已实现 |
| 每镜关键帧、鸟瞰、镜头表、脚本 | `StageExportItems` | `src/main/stage/export.ts`、`stage-shot-list.ts` | 已实现 |
| 光照预设 | 10 个氛围预设 | `src/shared/stage-lighting.ts` | 已实现 |
| 人物动作 | 13 关节、17 个动作 | `src/shared/stage-motions.ts`、`stage-figure.ts` | 已实现 |
| 自动分镜 | 单/双/群、不越轴 | `src/shared/stage-auto-coverage.ts` | 已实现 |
| 按对白分镜 | 解析台词、按句切镜 | `src/shared/stage-dialogue.ts` | 已实现 |
| 场景图 → 白膜 | VLM + 校准（深度未接） | `src/main/scene/analyze.ts` | 部分实现 |
| 截图回画布 | `stage.capture` | `src/main/ipc/stage.ts` | 已实现 |

## 逐帧拉片

| 关键词 | 已有实现 | 入口 | 状态 |
|---|---|---|---|
| 切镜、转场 | 硬切/跳切/溶解/划像/闪白 | `src/main/film-study/shot-detect.ts` | 已实现 |
| 首/中/尾帧 | 每镜三帧 | `src/main/film-study/auto.ts` | 已实现 |
| 逐镜理解 | 5 镜一批视觉模型 | `src/main/film-study/shots.ts` | 已实现 |
| 确定性取证 | 标签、置信度、证据 | `src/main/film-study/production.ts` | 已实现 |
| VLM 复核 | 低置信镜头融合 | `src/main/film-study/production-review.ts` | 已实现 |
| 分场 | VLM 分场 + 每 10 镜兜底 | `src/main/film-study/scenes.ts` | 已实现 |
| 角色表 | 跨镜合并、抽帧头像 | `src/main/film-study/cast.ts` | 已实现（未裁脸） |
| 风格档案 | 画风/色调/构图/运镜/节奏 | `src/main/film-study/style.ts` | 已实现 |
| 镜头三节点 | 首帧/尾帧/文本，按场分组 | `src/renderer/src/canvas/nodes/StudyNodeCard.tsx` | 已实现 |
| 分镜表 | Markdown 表格，含制作方式 | `src/renderer/src/canvas/nodes/study-sheet.ts` | 已实现 |
| 单镜重跑 | 重抽首/中/尾帧 + 重跑该镜 | `src/main/film-study/service.ts` | 已实现 |
| 选角/选景、复刻建图 | mapping + 普通视频节点 | `RemakeMappingDialog.tsx`、`stores/film-study.ts` | 已实现 |
| 分析包导入导出 | SRT/ZIP/README | `src/main/film-study/analysis.ts` | 已实现 |
| 字幕 OCR、音频分轨、裁脸 | 未接 | — | 待做 |

## Agent 与存储

| 关键词 | 已有实现 | 入口 | 状态 |
|---|---|---|---|
| Agent 工具 | 画布/生成/导演台/时间线/拉片/能力/技能 | `src/main/agent/tools/` | 已实现 |
| 生成提案 | `AgentProposal`、`.cinelab/agent/proposals` | `src/main/agent/proposals.ts` | 已实现 |
| 会话/压缩 | `.cinelab/agent/sessions/*.jsonl` | `src/main/agent/session.ts`、`compact.ts` | 已实现 |
| 技能 | 内置/全局/项目三级、启用状态过滤 | `src/main/agent/skills.ts`、`skills-config.ts` | 已实现 |
| 技能卡片 | 全部显示、卡片启用开关、Markdown 预览 | `SkillsSection.tsx` | 已实现 |
| 技能导入 | 文件夹/ZIP、SKILL.md 校验、同名覆盖、原子安装 | `src/main/agent/skills-import.ts`、`SkillImportDialog.tsx` | 已实现 |
| 快捷键自定义 | 27 动作、录制、冲突检测、恢复默认 | `src/shared/shortcuts.ts`、`ShortcutsSettingsSection.tsx` | 已实现 |
| 设置页分区 | 8 分区、旧 library/components/objectPresets 别名 | `SettingsPanel.tsx` | 已实现 |
| 项目存储 | `.cinelab` 目录、原子写入 | `src/main/project/manager.ts` | 已实现 |
| IPC/preload | `CineApi` | `src/shared/ipc-contract.ts`、`src/preload/index.ts` | 已实现 |
| 安全/更新/组件 | 外部链接、导航、更新、运行时组件 | `src/main/security/`、`update/`、`components/` | 已实现 |
| UI 组件库 | Button/Select/Menu/Popover/Dialog 等 | `src/renderer/src/components/ui/` | 已实现 |
| 主题 | `tokens.css` | `src/renderer/src/styles/tokens.css` | 已实现 |

## 维护规则

1. 新增能力：在本表加一行，写清关键词、入口、状态。
2. 能力升级：更新状态与入口。
3. 能力删除：移除本表行，并在模块文档「已知限制」说明。
4. 本表是检索入口，不替代 08 的状态判断与模块地图的细节。
