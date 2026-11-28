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
| 视频画面裁切 | 6 档预设 + 自定义宽高比，居中裁切 | `src/shared/media.ts`、`src/renderer/src/canvas/nodes/VideoCropDialog.tsx`、`src/main/media/video.ts` | 已实现 |
| 文本节点所见即所得 | Milkdown 核心、Markdown 输入规则、无预览切换和格式工具栏 | `src/renderer/src/canvas/nodes/WysiwygMarkdownEditor.tsx`、`TextEditorDialog.tsx` | 已实现 |
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
| 扩图 | 生图模型图生图；精确优先，无精确选项时自动选最接近尺寸 | `src/shared/outpaint.ts`、`src/renderer/src/canvas/nodes/AiOperationDialog.tsx`、`node-operation-runner.ts` | 已实现 |
| 宫格/拼接/抽帧/裁剪/转码 | 媒体处理 | `src/main/media/` | 已实现 |
| 生图数量批量 | 供应商忽略 `n` 时客户端补发单张请求凑足所选张数；一次返回足够的模型零额外请求 | `src/main/engine/start-generation.ts`、`start-generation.test.ts` | 已实现 |
| 结果节点隐藏 PromptBar | 操作/AI/拉片/导演台/剪辑室结果只保留工具栏 | `PromptBar.tsx`、`node-operation-specs.ts`、`stores/canvas/slices/assets.ts` | 已实现 |
| 人声/背景音分离 | Demucs htdemucs、无声视频 + 音频、FIFO 任务 | `src/main/media/stems.ts`、`resources/stem-worker/worker.py` | 已实现 |
| 素材入库 | `ingestAsset` | `src/main/assets/ingest.ts` | 已实现 |
| 3D 模型入库 | `kind:'model'` → `assets/model/`，`.glb` / `.gltf` | `src/main/assets/ingest.ts`、`src/main/ipc/scene.ts` | 已实现 |
| 错误文案 | 配额/鉴权/超时 | `src/main/engine/generation-error.ts` | 已实现 |
| 风格库、风格胶囊 | 官方只读（43 个）+ 自定义、按输入框居中浮窗（一行 8 列小封面）、分类浏览、单击即应用、单选胶囊内联输入框首行（× 角标）；资产库“风格”同源展示；官方新增韦斯·安德森 | `src/main/library/styles.ts`、`docs/style-library/styles.json`、`StyleLibraryDialog.tsx`、`PromptBar.tsx`、`LibraryWindow.tsx`、`StyleFolderGrid.tsx`、`src/shared/style-prompt.ts` | 已实现 |
| 预设提示词 | 资产库“提示词”同源、按输入框居中浮窗、CRUD、三列卡片（标题行操作 + 全文预览）、名称胶囊任意位置插入、胶囊不重叠（绿色无图标）、发送原位展开、风格置顶；官方「画面去脏」只读 | `docs/prompt-library/presets.json`、`src/main/library/templates.ts`、`src/shared/prompt-preset.ts`、`PresetPromptDialog.tsx`、`PromptBar.tsx`、`promptbar-model.tsx`、`LibraryWindow.tsx` | 已实现 |
| 资产库提示词卡片 | 按钮行统一尺寸、卡片等高、新建提示词在面包屑右侧；官方项隐藏编辑/删除并显示「官方」徽标 | `TemplateGrid.tsx`、`LibraryWindow.tsx` | 已实现 |
| 官方社群 | 关于与更新页展示 QQ 群号（复制）与飞书邀请链接（打开/复制） | `SettingsPanel.tsx`、`src/shared/community.ts`、`src/main/ipc/index.ts` | 已实现 |
| 模型配置 Skill 引导 | 无模型时优先引导下载 SKILL.md，交给 WorkBuddy / ChatGPT / 豆包等外部 Agent 生成 models.json；手动配置保留 | `SettingsPanel.tsx`、`resources/model-config-skill/SKILL.md` | 已实现 |

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
| 手绘路径/运镜 | 自由曲线、相机/对象/跟随路径、Line2 3D、控制点、时间关键帧/速度曲线、手动关键帧保留 | `src/shared/stage-paths.ts`、`stage/StageWindow.tsx`、`StageViewport.tsx`、`StagePathInspector.tsx` | 已实现（核心） |
| 语义镜头 | 关系/距离/高度/构图求解 | `src/shared/stage-shot-intent.ts` | 已实现 |
| 整片时间线、重叠 | `StageProgramEntry` + `front` | `src/shared/stage-program.ts` | 已实现 |
| 整片播放 | `playbackScope='program'` | `src/renderer/src/stage/stageStore.ts` | 已实现 |
| 整片/每镜导出 | `exportPreview(scope/items)` | `src/main/stage/export.ts` | 已实现 |
| 每镜关键帧、鸟瞰、镜头表、脚本 | `StageExportItems` | `src/main/stage/export.ts`、`stage-shot-list.ts` | 已实现 |
| 光照预设 | 10 个氛围预设 | `src/shared/stage-lighting.ts` | 已实现 |
| 天气粒子 | 雨天/雪天，视口实时 + 导出逐帧 | `src/shared/stage-lighting.ts`、`src/renderer/src/stage/stage-weather.ts` | 已实现 |
| 人物动作 | 13 关节、17 个动作 | `src/shared/stage-motions.ts`、`stage-figure.ts` | 已实现 |
| 自动分镜 | 单/双/群、不越轴 | `src/shared/stage-auto-coverage.ts` | 已实现 |
| 按对白分镜 | 解析台词、按句切镜 | `src/shared/stage-dialogue.ts` | 已实现 |
| 场景图 → 白膜 | VLM + 校准（深度未接） | `src/main/scene/analyze.ts` | 部分实现 |
| 截图回画布 | `stage.capture` | `src/main/ipc/stage.ts` | 已实现 |
| GLB 导入与渲染 | `scene:pick-model` + `ingestAsset(model)` + GLTFLoader（仅导入不导出） | `src/main/ipc/scene.ts`、`src/renderer/src/stage/stage-scene.ts` | 已实现 |
| 预演导出命名 | 单镜用镜头名、整片用「<导演台名> · 成片」；不回画布成组，不生成结构 JSON/提示词节点 | `src/renderer/src/stage/preview-runner.ts`、`src/main/stage/export.ts` | 已实现 |
| 场景字段消费 | sizeClass/facing/room/scale/pitch → 白模摆位与室内结构 | `src/shared/stage-from-scene-build.ts` | 已实现 |
| 对话式预演编排 | 动作轨工具 + 批量计划确认 + previs Skill SOP | `src/main/agent/tools/stage.ts`、`stageBridge.ts`、`resources/skills/stage-previs/SKILL.md` | 已实现 |
| 机位可视化摆位 | 导演视角 gizmo 拖机身改 position、注视点手柄拖 target；选中机位保留导演视角，列表双击预览画面 | `src/renderer/src/stage/StageViewport.tsx`、`stageStore.ts`、`StageWindow.tsx` | 已实现 |
| 新手三步向导 | 空场景浮层：选起点→加人物→一键分镜；节奏三档与单人/双人/群戏预设复用 `autoCoverage`；语义术语折叠为高级设置 | `src/renderer/src/stage/StageBeginnerGuide.tsx`、`StageWindow.tsx`、`ShotInspector.tsx` | 已实现 |
| 出片闭环增强 | 导出 toast 查看节点、长导出确认与单导出锁、CineBot 建议提示词升级 | `StageWindow.tsx`、`stores/ui.ts`、`components/Toast.tsx`、`AgentPanel.tsx` | 已实现 |

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

## 图层分离与合成

| 关键词 | 已有实现 | 入口 | 状态 |
|---|---|---|---|
| 图层分离 | 模型 `layer` 分层；自动/提示词/框选/框选+提示词；pending 节点 + 连线 | `src/renderer/src/canvas/nodes/LayerSplitOverlay.tsx`、`layer-split-prompt.ts`、`src/renderer/src/stores/generation.ts` | 已实现（P6） |
| 图层叠加、背景锁定 | `layerGroupId` + `layerTransform` + Canvas 预览 | `LayerStackPreview.tsx`、`layer-compose.ts`、`src/shared/canvas-schema.ts` | 部分实现（P2） |
| 图层合并 | 本地 Canvas 合成，写回同一节点新版本；不调模型 | `layer-compose.ts`、`src/renderer/src/stores/canvas/slices/graph.ts`、`src/main/ipc/media.ts` | 部分实现（P2） |
| 图层拖出/拖回、已分离区、多组选择 | 独立节点 + 重新附着；面板显隐/锁定；100 版本保护 | `LayerEditorOverlay.tsx`、`src/renderer/src/stores/canvas/slices/assets.ts`、`src/renderer/src/canvas/Canvas.tsx` | 已实现（P3） |
| 图层分离内联编辑 | 节点上方工具栏与底部面板就地替换；多选区（最多 4）；提交后恢复 | `LayerSplitOverlay.tsx`、`NodeToolbar.tsx`、`PromptBar.tsx`、`src/renderer/src/stores/ui.ts` | 已实现（P6） |
| 节点内联操作编辑器 | 15 个源内容操作改为节点内 UI：框选/蒙版/方向球/扩图/时间条/宫格线/参数面板；拖动时隐藏浮层；媒体尺寸自愈 | `NodeInlineEditorHost.tsx`、`Inline*Editor.tsx`、`inline-generation.ts`、`src/renderer/src/styles/infrastructure.css`、`src/renderer/src/canvas/media-size.ts` | 部分实现（真实生成待验证） |
| 图层 Agent 工具 | `layer_merge` / `layer_detach` / `layer_attach` | `src/main/agent/tools/canvas.ts`、`src/renderer/src/agent/canvasBridge.ts` | 已实现（P4） |
| 组件在线更新 | 六组件 checkUpdates、24h 持久化缓存、更新按钮/红点、任务占用阻断 | `src/main/components/service.ts`、`src/main/ipc/components.ts`、`src/renderer/src/panels/ComponentsSection.tsx` | 代码完成，manifest 待上传（P5） |

## Agent 与存储

| 关键词 | 已有实现 | 入口 | 状态 |
|---|---|---|---|
| Agent 工具 | 画布/生成/导演台/时间线/拉片/能力/技能 | `src/main/agent/tools/` | 已实现 |
| 对话式白模预演 | stage-previs Skill、批量计划确认 Dialog、每轮精简场景快照 | `resources/skills/stage-previs/SKILL.md`、`src/shared/stage-snapshot.ts`、`stageBridge.ts` | 已实现 |
| 生成提案 | `AgentProposal`、`.cinelab/agent/proposals` | `src/main/agent/proposals.ts` | 已实现 |
| 会话 | `.cinelab/agent/sessions/*.jsonl` | `src/main/agent/session.ts`、`pi/session.ts` | 已实现 |
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
| 关闭确认与后台运行 | 每次关闭弹「后台运行/退出程序」，自动保存且失败拦截；「不再提示」仅记忆后台运行；托盘 logo + 自绘右键菜单（显示主窗口/退出） | `src/main/tray/`、`App.tsx`、`CloseConfirmDialog.tsx`、`TrayMenuWindow.tsx`、`GeneralSettingsSection.tsx` | 已实现 |

## 维护规则

1. 新增能力：在本表加一行，写清关键词、入口、状态。
2. 能力升级：更新状态与入口。
3. 能力删除：移除本表行，并在模块文档「已知限制」说明。
4. 本表是检索入口，不替代 08 的状态判断与模块地图的细节。
