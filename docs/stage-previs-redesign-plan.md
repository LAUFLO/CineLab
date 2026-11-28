# 导演台 3D 白模预演改进方案

日期：2026-11-26
状态：三个阶段均已实施（阶段一 PR #143、阶段二 PR #144）；阶段三待推送
类型：跨模块功能（04 导演台 / 01 画布 / 07 IPC / 10 UI / 06 Agent）

## 交付顺序（已拍板）

1. **PR 1**：阶段 1 + 阶段 2.4（全景、重命名/组织性打组、关键帧拖拽、运镜预设、UI 清理）——已合并（PR #143）。
2. **PR 2**：阶段 2（GLB 导入、生成闭环、生成消费字段）——已实施（本轮），待推送。
3. **PR 3**：第五节对话式智能预演（工具/Skill/计划确认/上下文一致性）——已实施（本轮），待推送。

## 背景与目标

竞品 LibTV（liblib.tv）「3D-BOX / 导演台」与 TapNow「3D 片场 / 智能预演 / CineMap」的 3D 白模预演，与我们的导演台属于同一形态：无限画布里的 3D 节点、白模摆位、机位、运镜、截图或白模视频回画布作为生成参考。其效果领先不是因为模型更聪明，而是几个具体设计选择：720° 全景承载场景、用户可编辑的中间态、机位/时间轴运镜、白模当结构约束喂给生成模型。

本方案把竞品模式拆解为可落地的改动，目标是让导演台从「一次性 VLM 出盒子」升级为「生成初稿 → 人工摆位/运镜 → 白模预演 → 回画布当生成参考」的完整链路。

**命名决策：不改名。** 保留中文「导演台」与技术标识 `stage`（目录、IPC channel、`stage_*` 工具/快捷键 ID、`stages/` 存储、`model:'导演台'` 兜底键），避免兼容风险。仅在需要向用户说明用途时，使用副标题式表达（如「导演台 · 3D 白模预演」），不替换主名称。

## 一、竞品对照与差距

| 能力 | 竞品做法 | 我们已有 | 缺口 |
|---|---|---|---|
| 白模摆位 | 人体素模/基础几何/群众阵列，V/R/S，改名/打组/隐藏/改色 | human/box/sphere/plane/crowd + 变换/姿势/颜色/可见 + 左右栏 | 对象不能重命名、不能打组；无 gltf 选项 |
| 场景表示 | 普通图转 720° 全景，导入片场 | `panorama` 图片操作 + `PanoramaViewer` 只读查看器 | 导演台 schema 声明 panorama 但视口/导出不渲染；查看器与导演台无联动 |
| 机位/运镜 | 时间轴打关键帧、手绘轨迹、推拉/环绕/跟拍预设 | `CameraKeyframe` + Hermite 插值 + 播放 + 语义镜头 + 自动分镜 | 关键帧只能点击 seek，不能拖拽；无手绘轨迹；无运镜预设 |
| 回画布闭环 | 截图/白模视频回画布，作为「位置/镜头不变」的结构参考 | `stage.capture` + `exportStagePreviewToCanvas`（整片/片段/分镜图/鸟瞰/镜头表，自动打组） | 已实现，链路完整；缺少配套结构约束提示词 |
| 资产互通 | 上传 GLB、导出场景 | `gltf` 类型 + `assetPath` 字段声明 | 无 GLTFLoader、无上传 IPC、无场景导出，实际是 wireframe 人形 |
| 生成质量 | 受控资产 + 人工摆位 | `scene.analyze` → 5 字段 JSON → 预设盒子 | `sizeClass`/`facing`/`room`/`scale`/`pitch` 被丢弃，用户类别表未接 |

## 二、现状（代码事实）

- **全景**：`node-operations.ts:376-384` 有 `panorama` 操作（`PROMPT_PANORAMA` 要求 2:1 等距柱状投影，走通用图模型，产出普通 image 节点，`op='panorama'`）；`PanoramaViewer.tsx:15-199` 是纯只读球体查看器（`BackSide` + `TextureLoader`，拖拽/滚轮/ESC），无编辑、无机位、无与导演台联动。`stage-schema.ts:19,160-163` 声明 `background.kind='panorama'`，但 `StageViewport.tsx:443-448` 与 `stage-render.ts:94-135` 只渲染纯色；`stage_set_background` 工具可写但写了不显示。
- **UI**：`StageWindow.tsx` 全屏 portal，`top(48)/left(240)/viewport/right(280)/timeline(168)` 网格；header 有光照、导入图片/模型、从参考图生成、视角切换、播放范围、导出预演（无选项菜单）、截图、关闭；左栏是对象/机位/镜头清单（可重命名、多选打组）；`StageInspector` 对象名称可编辑；`CameraInspector` 名称可编辑。
- **打组**：`StageObject.parentId` 存在（`stage-schema.ts:35`），无 group/setParent 命令（`stage-commands.ts:23-70`）。
- **运镜**：`stage-timeline.ts` 有 `sampleCameraTrack` + Hermite 插值；`StageTimeline.tsx:645-685` 关键帧圆点只能点击 seek 与选中，不能拖拽；无手绘轨迹、无推拉/环绕/跟拍预设；语义镜头求解在 `ShotInspector.tsx:92-291`，自动分镜在 `StageTimeline.tsx:351-415`。
- **回画布**：`StageWindow.tsx:393-436` → `stage.capture` IPC（`main/ipc/stage.ts:121-150`）→ `ingestAsset(model:'导演台')` → `addAssetNodes`；`preview-runner.ts:24-201` 已导出整片视频/每镜片段/分镜图/鸟瞰/镜头表并自动打组；`main/stage/export.ts:93-225,368+` 有完整逐帧渲染链路。
- **GLB**：`stage-scene.ts:41-59` 的 `gltf` 与 crowd 共用 wireframe 人形，不读 `assetPath`；全库无 `GLTFLoader`、无上传/导出 IPC；`OBJECT_OPTIONS`（`StageWindow.tsx:35-41`）无 gltf。
- **生成降维**：`stage-from-scene.ts:41-74` 忽略 `sizeClass`/`facing`/`room`/`calibration.scale`/`pitchDeg`，坐标系硬编码，只用 `builtinObjectPresets()`，用户类别表未接。
- **测试**：有 `stage-timeline/commands/program/shot-intent/preview/lighting` 单测；无 PanoramaViewer、glTF、StageWindow UI 测试。

## 三、已有实现检查

- **复用**：`StageWindow` 全屏 portal 与网格布局、`stageStore` 命令/播放/`captureFrame`、`stage-timeline` 插值、`panorama` 图片操作、`PanoramaViewer` 球体贴图、`stage.capture` + `exportStagePreviewToCanvas`、`stage_set_background` / `stage_set_camera_track` Agent 工具、`mergeObjectPresets`（`scene-object-presets.ts`）。
- **扩展**：`StageViewport` / `stage-render` 的全景背景渲染；`StageInspector` 对象重命名；`StageCommand` 加 group/setParent；`StageTimeline` 关键帧拖拽；`scene.analyze` 消费已有字段。
- **新建**：GLB 上传/导出 IPC + GLTFLoader 渲染；运镜预设与手绘轨迹；导演台内「取景器拍摄」；白模预演导出配套结构 JSON 与生成参考提示词模板。

## 四、改动点

### 阶段 1：把已有零件接起来（优先实施）

**1.1 全景背景真渲染（对标 LibTV 720°）**
- `src/main/ipc/scene.ts`：新增 `scene:panorama-to-stage`，把画布里 `op==='panorama'` 的图片路径写入 `doc.background={kind:'panorama',value}`。
- `src/shared/ipc-contract.ts` / `src/preload/index.ts`：声明并暴露该 API。
- `StageWindow.tsx` header：加「全景背景」入口——从画布选全景图，或对当前参考图调用 `panorama` 操作生成后再导入；入口提供图模型选择（`modelKey`，Q2），让用户挑一个图模型专门跑全景，质量不佳时再评估外部服务，当前不引入新依赖。
- `StageViewport.tsx:443-448`、`stage-render.ts:94-135`：用 `TextureLoader` + 内视球体（复用 `PanoramaViewer.tsx:29-61` 的贴图方式）渲染全景背景，替换纯色 fallback。
- `PanoramaViewer.tsx`：加「在导演台中使用」按钮，联动 `scene:panorama-to-stage`。

**1.2 对象重命名与打组（对标左侧栏元素清单）**
- `stageStore.ts:111-119,776-791`：`updateObject` patch 类型加 `name`。
- `StageInspector.tsx:200-298`：对象名称改为可编辑，复用 `CameraInspector:316-320` 的 TextField 模式。
- `stage-commands.ts:23-70`：新增 `setParent` / `groupObjects` 命令与执行分支；`stage-commands.test.ts` 补测试。**范围仅限组织性打组**：写 `parentId`、左栏按组折叠/展开/整体隐藏；**不做变换级联**（移动父对象不带子对象）、**不在 three.js 建父子层级**（`stage-scene.ts` 不读 `parentId` 的现状保持）。
- `StageWindow.tsx:694-762`：左栏加多选 +「打组」按钮，复用 `parentId` 字段。撤销/重做天然支持：历史栈是 doc 快照级（`stageStore.ts:255-315`），命令走 `applyCommands` 即自动进历史。

**1.3 时间轴关键帧可拖拽 + 运镜预设（对标 TapNow）**
- `StageTimeline.tsx:645-685`：关键帧圆点支持拖拽改 `timeMs`；拖拽时通过 `viewCaptureHandler` 实时写回 `cameraTrack`（`stageStore.ts:532-579` 已有 `captureFrame`）。
- 新建 `src/shared/stage-camera-moves.ts`：`dolly-in / dolly-out / orbit / follow / crane` **5 个预设全做**（Q4=B，非仅 3 个），按当前机位与选中主体生成 2–3 个相机关键帧，走 `setCameraTrack` 命令。
- `StageWindow.tsx` 或 `StageTimeline.tsx` 加「运镜预设」下拉；**手绘轨迹一期一起做**（Q4=B）：视口 overlay 画线 → 采样为 N 个 `cameraTrack` 关键帧（复用 `sampleCameraTrack` 插值）。

### 阶段 2：资产互通与生成闭环

**2.1 GLB 导入（不做导出）**
- 引入 `three/examples/jsm/loaders/GLTFLoader`（与项目 three 版本一致）；`stage-scene.ts:41-59` 真正读 `assetPath` 渲染模型；`OBJECT_OPTIONS` 恢复 gltf。
- 扩展 `src/main/assets/ingest.ts` 增加 `model` kind（MIME `model/gltf-binary`、扩展名 `.glb`、目录 `assets/model/`；当前只有 image/video/audio，非媒体会错误落到 `assets/txt/`）。
- 新增 IPC `scene:pick-model`（`dialog.showOpenDialog` filters `*.glb/*.gltf` → `readFile` → `ingestAsset` → 项目内相对路径），复用现有 `scene:pick-image` 模式（`main/ipc/scene.ts`）。契约与 preload 同步暴露。
- `StageInspector` 显示模型名/缩放；**不做** `stage:export-scene`、不在 header 加「导出场景 GLB」（按决策只导入不导出）。

**2.2 白模预演 → 生成参考的结构化约束**
- 复用 `exportStagePreviewToCanvas`，导出时额外生成结构 JSON（机位、对象位置/朝向、镜头时间线）随视频节点保留。
- 新增生成参考提示词模板：「保持人物位置、镜头运动方向、起始构图不变；参考这张图的角色与场景风格」（竞品原文做法），接入 `stage_from_scene_image` 与画布生成节点。

**2.3 场景生成消费已有字段**
- `stage-from-scene.ts:41-74`：`sizeClass`→scale 倍率、`facing`→`rotation[1]`、`room`→四面墙+天花板、`calibration.scale`→全局尺寸、`pitchDeg`→相机 target、`confidence==='low'` 时提示。
- **物体类别表：用户可编辑部分已删除（不恢复）**。历史上存在「物体类别表」（`ObjectPresetsSection` + `stage-object-presets.json` + 4 个 IPC），但用户表从未接入生成链路——`stage-from-scene.ts:37` 一直只用 `builtinObjectPresets()`。按用户决定已彻底删除用户可编辑表及其 IPC/preload/契约/测试，仅保留 51 条内置映射（`BUILTIN` / `builtinObjectPresets` / `findObjectPreset` / `FALLBACK`）。白模生成继续只用内置表，本方案不恢复用户表。
- `analyze.ts:47,67` 模型选择增加 `inputs?.includes('image')` 过滤；UI 传 `modelKey`；加 `response_format` 与失败重试一次。

**阶段二实施备注（与方案的细节偏差）**：
- 纯映射逻辑抽到 `src/shared/stage-from-scene-build.ts`，`stage-from-scene.ts` 只保留 store/IPC 副作用壳，便于单测。
- 室内墙生成了四面墙 + 天花板，但面向机位的「前墙」默认 `visible=false`，避免导出第一帧被遮挡，用户可在 Inspector 打开。
- 模型导入是本地文件复制、不外发，未走「从参考图生成」的隐私确认 Dialog。
- GLB 渲染保证自包含 `.glb` 完整显示；外部依赖的 `.gltf` 可能丢贴图，加载失败回退 wireframe 人形。
- 导出渲染的 `__setStagePreview` / `__setStageProgram` 改为 async，等待模型加载完成（10s 超时兜底）后才返回。
- **天气预设补齐（2026-11-26）**：原「雨天/雪天」预设只标了 `weather` 却没有实现，实际只有曝光变化；现已把 `weather` 写入 `StageLightingOverride`，并用 `stage-weather.ts` 的粒子系统（雨线/雪点）在视口按真实时钟、导出按帧时间确定性更新。左栏改为对象/机位/镜头三块均分高度、各自独立滚动。

### 阶段 2.4：导演台 UI 清理（去冗余 + 修无效）

基于导演台 UI 全量盘点的结论：**不需要大改，主要是去冗余与消除误导**。逐项清单：

- **合并重复控件**：`StageWindow.tsx:495-504` 的返回箭头与 `:681-690` 的 `×` 都调 `closeStage`，留一个。
- **导出项收敛（最终决策）**：移除整个「选项」菜单，只保留 header 的「导出预演」按钮；整片导出缺省只生成白模预演视频（外加阶段二自动附带的结构 JSON 与生成参考提示词）。每镜片段/分镜图/鸟瞰/镜头表/分镜脚本不再在 UI 暴露，仅当 Agent 显式传 `items` 时生成。
- **收敛重复选中态**：镜头的选中状态同时出现在左栏列表、时间轴镜头下拉、成片列表三处，可收敛为一处主控件。
- **完善禁用提示**：「从参考图生成」`disabled={!doc || generatingScene || !stageReferenceImage()}`（`:484-494`）目前只有静态 title，应在无上游图片节点时明确提示「需要先连接一张图片节点到导演台」。
- **标灰/实现无效功能**：背景 `panorama/model` 在 schema 与 `stage_set_background` 可写，但视口与导出只渲染纯色（`StageViewport.tsx:442-448`、`stage-render.ts:94-135`），`StageInspector:407` 还显示背景 kind 形成误导——按阶段 1.1 真渲染全景，否则标「暂不支持显示」；`gltf` 的 `TYPE_LABEL:'模型'` 与 wireframe 人形占位（`stage-scene.ts:41-59`）应标灰提示。
- **对象重命名/打组**：左栏对象名只读、无打组——按阶段 1.2 实现后再在左栏放开，不提前暴露。
- **保留不动**：光照下拉、截图到画布、导出按钮（无选项菜单）、视角切换、播放范围、三类清单、Inspector 属性、自动分镜/按对白/成片排序/捕获关键帧、视口变换工具——都有真实命令与渲染链路支撑。
- **不新增**：独立 Agent 输入框、手动/智能模式切换、独立入口/新窗口（见第五节）。

验收补充：导演台无重复关闭入口；导出仅生成白模预演，无冗余选项菜单；无上游图时按钮有明确提示；无效功能不再误导用户。

### 阶段 3：命名（本方案不实施）

保留「导演台」与全部 `stage` 技术标识。仅在需要说明用途的场合使用副标题式文案（如「导演台 · 3D 白模预演」），不替换主名称，不触碰 `model:'导演台'` 兜底键、`stage_*` 工具名、IPC channel、快捷键 ID、`stages/` 存储目录。

## 五、对话式智能预演（独立专题）

### 5.1 是否需要独立功能与独立 UI

**最终结论：单入口、无模式切换、无新增对话 UI。** 前几版曾考虑独立入口、手动/智能模式切换、左侧新增对话输入区，均被否决：

- **不新增入口**：竞品分入口是产品分层/收费需要；我们是本地工具，没有这种需求。双击画布仍然只有「导演台」一个入口。
- **不分模式**：用户在导演台里的操作是混着来的（手动摆位后对话微调、对话生成后手动改），分「手动/智能」会人为割裂，每次混合操作都要切换。
- **不新增对话输入区**：CineBot 面板已常显且浮在导演台之上——`AgentPanel.tsx:427` 是 `fixed right-3 top-12 bottom-4 z-[95]`、宽 420px，导演台是全屏 `z-[90]`（`StageWindow.tsx:418`），所以导演台打开时 CineBot 本来就可见可用；且它已监听 `stageMode` 与 `stageStore.open/nodeId` 同步会话上下文（`:91`、`:135-139`）。再加输入区是重复建设。

「智能预演」不是另一个功能或界面，而是 **CineBot 在导演台模式下被升级后的能力**。用户不需要知道这个概念，只是在导演台里说话，Agent 能把预演全流程干完。只有将来需要「预演作品库 / 批量预演队列」时才考虑独立页面，当前阶段不做。

**命名结论：不改名，尤其不改名为「智能预演」。** 导演台是 3D 构图/摆位/机位/镜头/时间轴的工作区，手动操作是主体、预演只是产出之一；改名为「智能预演」会把手动能力藏起来，且与「不做独立智能预演功能」的收敛结论自相矛盾。改名触及面巨大（中文文案 A、Agent 工具 category / 提示词 / MCP 元数据 B、`model:'导演台'` 旧项目兜底键 C、IPC / `stage_*` 工具名 / 快捷键 ID / `stages/` 目录 D、大量文档 E），收益几乎为零。如需区分可用副标题式表达（「导演台 · 3D 白模预演」），不替换主名称。

### 5.2 现状：B 级（有原子工具，无端到端编排）

- 22 个导演台工具已注册，CineBot 与 MCP 都可调用；`STAGE_SYSTEM_PROMPT`（`pi/prompt.ts:61-79`）确实引导多步搭景与分镜。
- 无任何单一入口接收「一句话/参考图」后自动跑完搭景 → 摆人 → 机位 → 动作 → 运镜 → 导出；无 stage/previs Skill。
- `stage_from_scene_image` 只收参考图（无描述参数），产物仅静态对象 + 1 机位，无镜头/运镜/动作/背景/导出（`stage.ts:645-662`、`stage-from-scene.ts:41-80`）。
- Agent 无法编排动作：`setActionTrack` 命令存在（`stage-commands.ts:57,682-707`）但未暴露为工具，只能设静态 `pose`。
- `capability_catalog` 在 stage 空间只返回 9 个工具（`canvasBridge.ts:320-330`），漏了 `stage_add_objects`、`auto_coverage`、`dialogue_coverage`、`from_scene_image`、`set_camera_track`、`set_shot_intent`、`add_shot`。
- `STAGE_SYSTEM_PROMPT` 未点名 `stage_export_preview`（只在 `:76` 要求导出前等用户确认）。
- 校验 bug：`stage_export_preview` schema 允许 `scope=program` 不带 `shotId`，但 `validateStageToolArgs` 无条件要求 `shotId`（`stage.ts:1087-1093`），CineBot 侧整片导出被误拦截。
- CineBot 已常显并适配导演台（`AgentPanel.tsx:427` 面板 `z-[95]` 浮于导演台 `z-[90]` 之上；`:91` `stageMode`、`:135-139` 会话同步；`:580-581` 导演台欢迎语），但能力只到搭景——suggestion 只引导到「把这个场景搭成雨夜街道，加两个人物」。这是能力缺口，不是 UI 缺口。

### 5.3 要新增的工具 / 编排 / Skill / 入口

**新增工具**
- `stage_set_action_track`：把已有 `setActionTrack` 命令暴露为 Agent/MCP 工具，参数 `objectId`、`keyframes`（`timeMs` / `pose` / `position` / `rotation`）、`loop`，让对话能编排「人物怎么走」。
- `stage_from_scene_image` 增加 `prompt` 参数：支持「一句话描述场景」与参考图并用，VLM 提示词同时接收 description（`scene/analyze.ts:10-38`）。
- `stage_generate_previs`（二期可选编排工具）：输入 `prompt` / `imagePath` / `duration` / `shotCount`，内部顺序调用解析 → 搭景 → 分镜 → 动作 → 运镜 → 导出。一期先以 Skill SOP 实现，避免把灵活性锁死在单一工具里。

**修复已有工具**
- `capability_catalog` 的 `SPACE_TOOLS.stage`（`canvasBridge.ts:320-330`）从 9 个补全到全部可用工具。
- `stage_export_preview` 校验（`stage.ts:1087-1093`）：`scope=program` 时不强制要求 `shotId`，补测试。
- `STAGE_SYSTEM_PROMPT` 点名 `stage_export_preview` 与动作轨工具。
- **新增「计划确认」机制（Q7/Q11）**：现有两套机制不匹配——工具确认是「单调用、单槽、60 秒超时、不落盘」（`pi/permissions.ts:25-27`、`runtime.ts:173-215`、`agentStore.ts:1095-1103`），生成提案是「单个 GenerateRequest、落盘、仅 canvas profile」（`proposals.ts`、`generation.ts:76`）。因此新增轻量机制：CineBot（经 previs Skill）先输出一份结构化工具计划 → 渲染侧用一个 Dialog 列出计划全文 +「允许执行 / 取消」→ 确认后逐条跑（串行）；**只用于 previs Skill 的批量流程**，其他单工具调用（删除对象、设置运镜、导出等）继续走现有 `toolConfirmationReason`，两条路互不干扰。对标 LibTV「生成前先给确认、不白烧积分」。

**新增 Skill**
- `resources/skills/stage-previs/SKILL.md`：定义对话式预演 SOP（取场景 → 解析描述/参考图 → 搭景摆位 → 机位与语义镜头 → 自动分镜 → 动作轨 → 运镜 → 导出 → 回画布），每阶段产出可检查的中间态，关键节点由用户确认后继续。
- 运行 `corepack pnpm map:skill` 刷新枚举与指纹，再跑 `check:docs`。

**UI 适配（小改动，不是新 UI）**
- `AgentPanel.tsx:580-599`：导演台欢迎语与建议提示词从「只到搭景」升级，加入预演示例（如「把这个场景搭成雨夜街道，加两个人物，排一段 10 秒的推拉镜头并导出预演」）。
- CineBot 面板（420px，`right-3`）会盖住导演台右侧 Inspector（280px）与部分视口：导演台打开时做布局协调——把 Inspector 收进 CineBot 面板做 Tab，或调整面板停靠/宽度。属体验优化，可在能力升级之后单独做，不阻塞。

**明确不做**：独立入口、手动/智能模式切换、`PrevisWindow` 独立组件、左侧新增对话输入区、画布新增「智能预演」菜单项。

### 5.4 对话式验收

1. 在导演台直接对已常显的 CineBot 说一句话/附参考图，Agent 输出节点计划经用户确认后自动执行（无需切换模式或入口）。
2. 产物包含可编辑白模对象、机位、镜头、动作轨、运镜关键帧，用户可在现有 UI 上继续手改。
3. 导出预演视频回画布，提示词模板明确「保持位置与运镜不变」。
4. `capability_catalog` 返回完整工具清单；整片导出不再被 `shotId` 校验误拦截。
5. Skill 枚举与指纹同步，`check:docs` / `check:agent-coverage` 通过。

### 5.5 手动修改的感知与上下文一致性（CineBot 继续编辑的关键）

**现状结论：CineBot 是否知道用户手动改过，取决于它本轮是否调用 `stage_get`——而且即使调用，也看不到关键帧细节。**

- **实时通道是通的**：用户手动编辑经 `applyCommands` 写回 `useStageStore.getState().doc`（`stageStore.ts:255-285`）；`stage_get` 经 `stageBridge.ts:75-87` 的 `readDoc()` 在导演台打开且 nodeId 匹配时直接读 live doc（不读磁盘旧文件），因此调用 `stage_get` 能拿到最新状态。
- **但上下文不注入场景快照**：`STAGE_SYSTEM_PROMPT`（`prompt.ts:61-79`）与 `stageContext()`（`:95-98`）每轮重建（`runtime.ts:417-426`）却只注入 nodeId，没有任何对象/机位/关键帧数据；模型对场景的认知只能来自会话历史里旧的 `stage_get` 结果（`pi/session.ts:124-133`）。
- **"先读后改"只是软约束**：`prompt.ts:64/77` 要求先 `stage_get`，但 `pi/tools.ts`、`validateStageToolArgs`（`stage.ts:714-1264`）不强制调用顺序。模型若不调 `stage_get`，会拿旧摘要继续修改，可能覆盖用户手改。
- **`syncContextSession()` 与场景内容无关**：上下文 key 只含 `canvasId/scope/nodeId`（`agentStore.ts:315-316`），用户改场景不触发会话同步；`loadSession` 也不含任何 doc 字段。
- **`stage_get` 摘要不全**：`stageSummary`（`stageBridge.ts:146-173`）对镜头只给关键帧**条数**，不含数值，也没有背景、语义意图、shot source——用户手改的关键帧/背景即使读到了也看不见。

**要补的三项修复（并入本节实施）**
1. 每轮 `stageContext()` 注入**精简**实时快照（Q8）：`agentStore.ts:906-934` 的 chat 请求目前只带 `stageNodeId`，扩展为携带渲染侧生成的精简摘要——对象只给 `id/name/type/transform`、机位只 `id/name`、镜头只 `id/name/关键帧条数`，控制在 2–3k token（完整 `stageSummary` 约 1 万 token，占 32k 预算三分之一到一半，`AGENT_CONTEXT_BUDGET_TOKENS` 仅 UI 显示不参与裁剪）。详细数据仍靠 `stage_get` 按需读，软提示 + 快照双保险（Q3：不做硬阻断）。
2. 代码化「本轮写工具前必须 `stage_get`」：在 `pi/tools.ts` 的 custom tool `execute` 加轻量检查（软提示或硬阻断），不再只靠提示词。
3. 扩展 `stageSummary`（`stageBridge.ts:146-173`）：加入关键帧数值、背景、intent、shot source，让 `stage_get` 覆盖用户手改的全部维度。

**验收补充**：CineBot 生成预演 → 用户手动改对象位置/关键帧/背景 → 再让 CineBot 继续修改，它能基于改动后的状态操作（不覆盖、不复用旧 ID/旧构图），且能读写关键帧数值与背景。

## 六、影响模块

- `04 导演台与白模预演`：视口/UI/命令/生成/GLB 渲染
- `01 画布`：全景节点与导演台联动、预演结果节点
- `07 存储、IPC 与安全`：`scene:panorama-to-stage`、`stage:upload-model`、`stage:export-scene`
- `10 UI 组件与面板`：Inspector、Timeline、header 入口，复用现有组件库与 tokens.css
- `06 CineBot 与 Agent`：工具描述若需补充副标题，须同步 MCP 元数据并跑 `check:agent-coverage`
- 文档：本方案、`code-map/04`、`08`、`11`、`01`、`07`、`README.md` 索引

## 七、验收

1. 上传/生成 720° 全景 → 导入导演台作背景，视口与导出渲染都能环视；离轴机位不露馅。
2. 左栏对象可重命名、多选打组；隐藏/改色/变换保持正常。
3. 时间轴关键帧可拖拽；点「推拉/环绕/跟拍」预设生成运镜，播放验证构图与时长；手绘轨迹可采样成机位动画。
4. 上传 GLB 显示为真实模型（非 wireframe 人形），可导出场景 GLB。
5. 「从参考图生成」后，物体尺寸/朝向/房间结构生效（不再全是同尺寸盒子）；内置类别表映射正常，用户可编辑类别表已移除（按决定保留内置表）。
6. 白模预演视频回画布后，正式生成能保持站位与镜头运动（提示词模板生效）。
7. `typecheck` / `test` / `check:ui` / `check:docs` / `check:agent-coverage` 通过；`dev:isolated` 实测上述路径。
8. **人工实测项（Q6）**：验收 1「离轴机位不露馅」、6「保持站位与镜头运动」为视觉主观判断，不写脆弱的截图回归测试，在验收清单中标注为人工走查项；自动化只覆盖数据结构/命令/契约。

## 八、风险与约束

- 透明加密软件会拦截外部二进制读临时文件：GLTFLoader 读项目内资源走 Node/Vite 明文链路，注意新写入的模型文件路径；测试按既有方式处理。
- 新增 IPC 需同步 `ipc-contract.ts`、preload、测试断言与 code-map 自动区；`map:code` 后跑 `check:docs`。
- `panorama` 走通用图模型 + 提示词，全景质量依赖所用模型；若后续引入专用全景模型，只替换生成后端，不改导演台渲染链路。
- GLTFLoader 依赖需评估打包体积；先用项目已有 three 版本的 examples 模块，不引入新包。
- 每阶段独立可交付；阶段 1 不引入新依赖，风险最低，建议作为第一个 PR。

## 九、2026-11-27 调整

- 导出回画布不再生成「白模结构约束.json」与「生成参考提示词」节点，`exports/previs/<时间戳>/` 也不再写入这两个文件；
- 预演节点不再自动成组；
- 单镜视频标题使用镜头名，整片视频标题使用「<导演台名> · 成片」。
