# 08 能力清单

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

> 只写用户能感知的能力，三档状态：**已实现 / 部分实现 / 仅文档**。
> 「部分实现」表示功能入口存在但行为不完整，方案里不能当已完成。
> 证据只列关键文件或测试；完整清单见 [_generated.md](_generated.md)。

## 已实现（可以当真）

| 模块 | 能力 | 证据 |
|---|---|---|
| 01 | 无限画布、节点、连线、分组、节点工具栏 | `src/shared/canvas-commands.ts`、`canvas-commands.test.ts` |
| 01 | 项目画布打开/保存/多画布 | `src/main/project/`、`src/shared/project-schema.ts` |
| 01 | 文本节点引用槽位与 @ 提及，文本内容拼入提示词 | `PromptBar.tsx`、`promptbar-model.tsx`、`MentionMenu.tsx` |
| 01 | 文本节点 Markdown 所见即所得：Milkdown、输入规则、无预览切换和格式工具栏 | `WysiwygMarkdownEditor.tsx`、`TextEditorDialog.tsx`、`text-markdown.ts` |
| 01 | 结果/素材节点隐藏 PromptBar，保留 NodeToolbar；旧项目按输出 op/model 兜底 | `PromptBar.tsx`、`node-operation-specs.ts`、`stores/canvas/slices/assets.ts` |
| 02 | 多供应商模型配置、生成任务、参数预设 | `src/main/providers/`、`src/main/engine/` |
| 02 | 参考图/视频/音频输入、素材导入 | `src/shared/reference-inputs.ts`、`src/main/assets/` |
| 02 | 首尾帧统一载荷与校验、MiniMax H3 role | `src/main/providers/media.ts`、`src/main/providers/minimax.ts`、`src/shared/reference-inputs.ts`；Agnes 首帧已真实复测 |
| 02 | 协议族 ModelContract、契约缺口与 golden 请求体 | `src/shared/model-contracts.ts`、`src/main/providers/__tests__/golden-bodies.test.ts`、`src/main/__tests__/capability-audit.test.ts` |
| 02 | 本地可信适配器 registry、esbuild 构建、utilityProcess 热重载、设置页管理 | `src/main/local-adapters/`、`src/shared/local-adapter.ts`、`SettingsPanel` |
| 02 | L4 sidecar（OpenAI / http-template）健康检查、版本与日志 | `src/main/local-adapters/registry.ts`、`docs/local-adapters.md` |
| 02 | http-template 条件字段、$map、状态/错误映射、多结果、HMAC 签名、显式 multipart、同步结果 | `src/main/providers/http-template.ts`、`http-template-dsl.test.ts` |
| 02 | 本地视觉增强：抠像、视频抠像、智能去字幕、主体消除；抠图支持自动与框选 | `src/main/media/vision.ts`、`resources/vision-worker/worker.py` |
| 02 | 扩图走配置图片模型的图生图：精确优先，无精确选项时自动选最接近尺寸；完全无法控制比例的模型置灰 | `src/shared/outpaint.ts`、`src/renderer/src/canvas/nodes/AiOperationDialog.tsx`、`NodeToolbar.tsx` |
| 02 | 本地人声/背景音分离：Demucs htdemucs、视频/音频源、无声视频 + 音频输出、FIFO 任务与取消；真实素材听感待验收 | `src/main/media/stems.ts`、`src/main/media/stem-tasks.ts`、`resources/stem-worker/worker.py` |
| 03 | 时间线、剪辑、转场、关键帧、字幕、音频 | `src/main/timeline/`、`src/shared/timeline-*` |
| 04 | StageDoc、机位、镜头、关键帧、Hermite 插值 | `src/shared/stage-schema.ts`、`stage-timeline.ts` |
| 04 | 语义镜头求解（单/双/群、过肩、不越轴） | `src/shared/stage-shot-intent.ts` |
| 04 | 程序化 Previs 世界（街道/十字/丁字/广场，室内） | `src/shared/previs/` |
| 04 | 整片时间线与镜头重叠/优先级 | `src/shared/stage-program.ts`、`stage-program.test.ts` |
| 04 | 整片播放与整片导出 | `stageStore`、`src/main/stage/export.ts` |
| 04 | 每镜白模片段 | `StageExportItems.clips`、`export.ts` |
| 04 | 每镜片段/分镜图/鸟瞰/镜头表/脚本（Agent 显式 `items` 可用，UI 不暴露） | `src/shared/stage-shot-list.ts`、`export.ts` |
| 04 | 10 个光照预设 | `src/shared/stage-lighting.ts`、`StageWindow` |
| 04 | 雨天/雪天粒子效果（视口实时 + 导出逐帧） | `src/shared/stage-lighting.ts`、`src/renderer/src/stage/stage-weather.ts` |
| 04 | 13 关节骨架 + 17 个动作 | `src/shared/stage-motions.ts`、`stage-figure.ts` |
| 04 | 自动分镜与按对白分镜 | `stage-auto-coverage.ts`、`stage-dialogue.ts` |
| 04 | 单镜预演导出与截图回画布 | `src/main/stage/export.ts`、`StageWindow.tsx` |
| 05 | 切镜/转场、首中尾帧、逐镜理解、取证与复核、分场、角色/风格、镜头三节点、分镜表、复刻建图 | `src/main/film-study/`、`stores/film-study.ts` |
| 06 | CineBot 工具、生成提案、会话、技能 | `src/main/agent/` |
| 06 | 技能文件夹/ZIP 导入、SKILL.md 校验、卡片启用开关 | `src/main/agent/skills-import.ts`、`SkillsSection.tsx`、`SkillImportDialog.tsx` |
| 06 | 本地可信适配器 MCP server（HTTP + stdio）、认证与 77 个工具 | `src/main/mcp/`、`docs/mcp.md` |
| 06 | MCP 工具从 `AGENT_TOOLS` 投影，工具名与 CineBot 统一 | `src/main/mcp/auto-tools.ts`、`src/shared/agent-tools.ts` |
| 06 | MCP 项目/适配器/工作台打开等 8 个专属工具 | `src/main/mcp/exclusive-tools.ts`、`src/main/mcp/write-runner.ts` |
| 06 | MCP 写工具与生成提交（免确认、只读模式） | `src/main/mcp/write-runner.ts`、`src/renderer/src/mcp/commandBridge.ts` |
| 06 | MCP 独立 scope：`allowAnyNode` 不依赖画布选中节点 | `src/shared/agent.ts`、`src/renderer/src/mcp/commandBridge.ts` |
| 06 | 四个 bridge 改为 handler 表，`call.name ===` 工具分支清零 | `src/renderer/src/agent/canvasBridge.ts`、`timelineBridge.ts`、`stageBridge.ts`、`filmBridge.ts` |
| 02 | 提示词模板与风格库工具：`preset_*` / `style_*` 读写 | `src/main/agent/tools/library.ts`、`src/main/agent/main-tools.ts` |
| 02 | 素材入库与人声/背景音分离 Agent 工具 | `src/main/agent/tools/media.ts`、`src/main/agent/main-tools.ts` |
| 03 | 剪辑室字幕文件导出 Agent 工具 | `src/main/agent/tools/timeline.ts`、`src/renderer/src/agent/timelineBridge.ts` |
| 04 | 导演台截图回画布 Agent 工具 | `src/main/agent/tools/stage.ts`、`src/renderer/src/agent/stageBridge.ts` |
| 06 | 技能管理 Agent 工具：启用/禁用、创建、导入 SKILL.md | `src/main/agent/tools/skill-admin.ts`、`src/main/agent/main-tools.ts` |
| 06 | 项目管理 Agent 工具：创建/打开/导出 | `src/main/agent/tools/project.ts`、`src/renderer/src/agent/projectBridge.ts` |
| 06 | 同步 CRUD 命令映射 `toCommands` | `src/shared/agent-commands.ts`、`src/renderer/src/agent/canvasBridge.ts` |
| 06 | 统一工具入口 `commandHandlers` | `src/renderer/src/agent/commandHandlers.ts` |
| 06 | 长任务 handler 白名单校验 | `handler-allowlist.json`、`scripts/check-agent-coverage.mjs` |
| 06 | MCP 设置页工具清单：中文标题、悬浮代码名、搜索与只读/写/危险筛选、危险项红色 | `src/renderer/src/panels/McpSettingsSection.tsx` |
| 06 | Agent 能力覆盖率校验：工具声明、handler、MCP 元数据 | `scripts/check-agent-coverage.mjs`、`agent-coverage-exempt.json` |
| 06 | MCP 时间线/导演台/拉片工具复用 CineBot 执行器 | `src/main/mcp/auto-tools.ts`、`src/renderer/src/agent/timelineBridge.ts`、`stageBridge.ts`、`filmBridge.ts` |
| 07 | IPC、preload、设置、素材库、安全、更新 | `src/main/ipc/`、`src/preload/` |
| 07 | 模型配置弹窗保存直接写入 models.json；Agent pending 自动应用 | `SettingsPanel.tsx`、`src/main/settings/models-watch.ts` |
| 07 | 资产库根目录迁移：预检、复制、校验、切换，旧目录移入回收站，进度与取消 | `src/main/library/migrate-root.ts`、`LibraryMigrateDialog.tsx` |
| 07 | 生成完成系统通知（主进程 Notification + 品牌图标，点击聚焦窗口） | `src/main/ipc/index.ts`、`src/renderer/src/stores/generation.ts` |
| 10 | 通用 UI 组件库、设置/素材库面板、主题 | `src/renderer/src/components/ui/`、`panels/` |
| 10 | 设置页 8 分区、旧深链接别名、快捷键自定义、技能全部显示、导入与卡片启用开关 | `SettingsPanel.tsx`、`ShortcutsSettingsSection.tsx`、`SkillsSection.tsx`、`SkillImportDialog.tsx` |
| 02 | 官方/自定义风格库（官方 43 个）：按输入框居中的 620×480 浮窗、一行 8 列小封面、分类浏览、单击即应用并关闭、单选胶囊（内联提示词首行、× 角标）；资产库“风格”与风格库同源展示；新增韦斯·安德森官方风格 | `src/main/library/styles.ts`、`docs/style-library/styles.json`、`src/shared/style-schema.ts`、`style-prompt.ts`、`StyleLibraryDialog.tsx`、`PromptBar.tsx`、`LibraryWindow.tsx`、`StyleFolderGrid.tsx`、`style-prompt.test.ts` |
| 02 | 预设提示词：按输入框居中的 620×480 浮窗、三列卡片（标题行操作 + 全文预览）、名称胶囊任意位置插入、发送原位展开、风格置顶；胶囊宽度对齐占位、绿色无图标、连续插入不重叠；资产库“使用”插入正文；官方预设「画面去脏」只读，不可修改删除 | `docs/prompt-library/presets.json`、`src/main/library/templates.ts`、`src/shared/prompt-preset.ts`、`PresetPromptDialog.tsx`、`PromptBar.tsx`、`promptbar-model.tsx`、`LibraryWindow.tsx`、`prompt-preset.test.ts` |
| 02 | 资产库提示词卡片：按钮行统一 28px、卡片等高、新建入口位于面包屑右侧；官方项隐藏编辑/删除并显示「官方」徽标 | `TemplateGrid.tsx`、`LibraryWindow.tsx` |
| 10 | 官方社群：关于与更新页展示 QQ 群（群号可复制）与飞书交流群（可打开/复制链接） | `SettingsPanel.tsx`、`src/shared/community.ts`、`src/main/ipc/index.ts` |
| 02 | 模型配置引导：无模型时优先引导下载 model-config Skill，交给外部 Agent 生成 models.json；手动配置保留 | `SettingsPanel.tsx`、`src/main/settings/model-skill.ts`、`resources/model-config-skill/SKILL.md` |
| 02 | 工作流模板：保存画布子图为资产库 `工作流/` 目录包；本地上传/生成节点转 `workflowSlot` 占位；导演台文档打包，拉片/剪辑室占位；支持重命名、删除、更新、导入导出 zip；`modelKey`/`params` 按节点持久化 | `src/main/workflows/`、`src/main/library/workflows.ts`、`src/shared/workflow-schema.ts`、`WorkflowSaveDialog.tsx`、`WorkflowGrid.tsx`、`PromptBar.tsx` |
| 07 | 关闭确认（后台运行/退出）、系统托盘品牌 logo 与自绘右键菜单；保存失败拦截、「不再提示」仅记忆后台运行 | `src/main/tray/`、`src/renderer/src/App.tsx`、`CloseConfirmDialog.tsx`、`TrayMenuWindow.tsx`、`preferences.ts` |
| 04 | GLB 导入与真实模型渲染（视口 + 导出等待加载），失败回退 wireframe | `src/main/ipc/scene.ts`、`src/renderer/src/stage/stage-scene.ts`、`stage-render.ts` |
| 04 | 预演导出回画布：单镜标题为镜头名、整片为「<导演台名> · 成片」，不自动成组，不生成结构 JSON/提示词节点 | `src/renderer/src/stage/preview-runner.ts`、`src/main/stage/export.ts` |
| 02 | model 资产入库到 `assets/model/`，支持 `.glb` / `.gltf` | `src/main/assets/ingest.ts`、`src/main/ipc/scene.ts` |
| 02 | 图片数量批量：供应商一次只返回一张时由客户端补发单张请求凑足所选张数，共用取消信号与按张数映射的进度 | `src/main/engine/start-generation.ts`、`start-generation.test.ts` |
| 06 | 对话式白模预演编排：动作轨工具、批量计划确认、previs Skill SOP | `resources/skills/stage-previs/SKILL.md`、`src/main/agent/tools/stage.ts`、`stageBridge.ts` |
| 06 | 导演台上下文一致性：每轮精简快照 + `stage_get` 摘要扩展 + 写前软提示 | `src/shared/stage-snapshot.ts`、`pi/prompt.ts`、`pi/tools.ts`、`stageBridge.ts` |
| 04 | 手绘路径与运镜：自由曲线、相机/对象/跟随路径、Line2 3D 显示、控制点拖拽/Alt 高度、时间关键帧/速度曲线、手动关键帧保留 | `src/shared/stage-paths.ts`、`src/renderer/src/stage/StageWindow.tsx`、`StageViewport.tsx`、`StagePathInspector.tsx` |
| 04 | 参考图上传与连线：本地图片写入项目资产、创建 image 节点、图片→导演台连线、替换旧入边 | `src/renderer/src/stage/StageWindow.tsx`、`stores/canvas/slices/assets.ts`、`graph.ts` |
| 04 | 机位可视化摆位：导演视角拖机身改位置、拖注视点手柄改朝向（Alt 改高度）；选中机位不再强制切机位视角，列表双击预览画面 | `src/renderer/src/stage/StageViewport.tsx`、`stageStore.ts`、`StageWindow.tsx`、`StageInspector.tsx` |
| 04 | 新手三步向导：空场景浮层引导选起点、加人物、一键分镜；节奏三档与单人/双人/群戏预设复用自动分镜；语义术语面板折叠为高级设置 | `src/renderer/src/stage/StageBeginnerGuide.tsx`、`StageWindow.tsx`、`ShotInspector.tsx`、`StageTimeline.tsx` |
| 04 | 出片闭环增强：导出 toast 带「查看节点」定位、导出前渲染耗时提示、超 5 分钟确认与超 30 分钟拦截、UI/Agent 共用单导出锁 | `src/renderer/src/stage/StageWindow.tsx`、`stores/ui.ts`、`components/Toast.tsx`、`agent/stageBridge.ts` |
| 10 | 全屏面板顶部 40px 拖拽区：导演台、剪辑室、设置、项目中心、节点搜索、快捷键、历史与 Dialog | `WindowDragStrip.tsx`、`StageWindow.tsx`、`StudioWindow.tsx` |

## 部分实现（别当已完成）

| 模块 | 能力 | 现状 | 证据 |
|---|---|---|---|
| 02 | 图层分离：模型 `layer` 分层 + 本地图层合成 | P0–P6 已实施：节点内框选（工具栏/PromptBar 就地切换，提交后恢复）、四种输入、多选区（最多 4）、图层叠加、拖动/缩放、拖出/拖回、已分离放回、合并写回、三个 Agent 工具；P5 组件在线更新代码完成，详见下一行 | `src/renderer/src/canvas/nodes/LayerSplitOverlay.tsx`、`LayerEditorOverlay.tsx`、`layer-compose.ts`、`src/main/agent/tools/canvas.ts` |
| 02 | 节点内联操作编辑器 | 15 个源内容操作已改为节点内 UI：裁剪、框选抠图、框选去字幕、画面裁切、扩图、重绘、擦除、元素编辑、打光、多角度、色彩校正、人像质感、片段截取、宫格切分、深度动作捕捉；空模型显示去配置提示，面板内容滚动/按钮固定，提示词框完整边框；拖动隐藏浮层、媒体尺寸自愈完成；真实模型生成待有 Key 环境复测 | `NodeInlineEditorHost.tsx`、`InlineMaskEditor.tsx`、`InlineSphereEditor.tsx`、`InlineOutpaintEditor.tsx`、`InlineModelField.tsx`、`infrastructure.css`、`media-size.ts` |
| 02 | 组件在线更新 | 代码完成：六组件 checkUpdates、24h 持久化缓存、启动后台检查、更新按钮/红点、任务占用阻断；四个新 manifest 待随 release 上传 | `src/main/components/service.ts`、`src/main/ipc/components.ts`、`src/renderer/src/panels/ComponentsSection.tsx`、`src/renderer/src/stores/components.ts` |
| 04 | 场景图 → 白膜 | VLM 解析已消费 sizeClass/facing/room/scale/pitch；深度校准未接，`depth` 默认为空 | `src/main/scene/analyze.ts`、`src/shared/stage-from-scene-build.ts` |
| 04 | 舞台对象资产 | 只有 human/box/sphere/plane/gltf/crowd；无家具/建筑/自然资产库 | `src/shared/scene-object-presets.ts` |

| 06 | Agent 运行时 v3（pi） | M1–M3 已接入动态 import、v2 会话、63 工具审计、确认、撤销、自动续跑、前端新事件；M4 四空间回归通过（canvas/stage 真模型，timeline/film 桥接），正式 asar 待复测 | `src/main/agent/pi/` |

## 仅文档 / 计划中

| 模块 | 能力 | 文档 | 状态 |
|---|---|---|---|
| 04 | 四视图、EDL | 同上 | 按需 |

## 维护规则

1. 能力状态变化时，只改本表，不改方案文档的「已实现」表述。
2. 新增能力：先有代码与测试，再标「已实现」；只有文档的标「仅文档」。
3. 删除能力：从本表移除，并在对应模块文档的「已知限制」里说明。
4. 每季度或每次发版核对一次；`docs/README.md` 的最后核对日期同步更新。
