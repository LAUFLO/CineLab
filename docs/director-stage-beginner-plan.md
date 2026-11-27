# 导演台小白友好化方案

日期：2026-11-27
状态：P0–P3 已实施并通过静态校验；P3 仅做文案小白化，代码化 `stage_get` 硬约束按风险评估未实施
类型：跨模块功能（04 导演台 / 10 UI / 06 Agent / 01 画布）

> 本文只描述设计与实施计划，不含代码改动。所有「现状」以代码为准，方案文档只作设计意图。
> 用户反馈原文：导演台太专业、很多参数不知道如何设置；例如添加摄像机后希望能直接拖动摄像机的位置与朝向。要求整体调研如何让小白也能容易做出预演视频。

## 背景与目标

调研结论：让小白卡住的不是「缺功能」，而是三件事——**不懂术语、看不见可操作对象、不知道前置条件**。项目里已经备齐了自动分镜、对白分镜、运镜预设、语义求解器、对话式预演等降门槛资产，真正断点在交互条件写死、提示误导、选项收敛过度。

目标：

1. 机位可**所见即所得摆位**：导演视角下拖机身改位置、拖注视点手柄改朝向，数字输入仍双向同步。
2. 小白**不懂摄影术语也能出片**：空场景三步向导 + 成片预设卡片，底层复用已有自动分镜与求解器。
3. 前置条件与导出**显式提示**：无图、无人物、长导出不再靠猜。
4. 已有对话式预演能力**文案小白化**，不新增入口、不改已拍板的产品决策。

---

## 一、现状（代码事实）

### 1.1 相机为什么拖不动：三重阻断

视口已存在 `TransformControls`（`src/renderer/src/stage/StageViewport.tsx:263-270`），但被三处条件限制，只能作用于舞台对象：

| 阻断点 | 位置 | 代码事实 |
|---|---|---|
| gizmo 只认对象 | `StageViewport.tsx:815-840` `syncTransformControls` | `state.viewMode !== 'director' || !state.selectedObjectId` 即 detach；只在 `objectsGroup.children` 中按 `stageObjectId` 找目标（828-830） |
| 拖完只发对象命令 | `StageViewport.tsx:272-300` `onTransformDragging` | 只读 `userData.stageObjectId`，提交 `transformObject`（280-298）；`StageCommand` 联合类型无 `transformCamera`（`src/shared/stage-commands.ts:25-91`） |
| 选中机位即藏起 gizmo | `stageStore.ts:447-459` `selectCamera` 强制 `viewMode='camera'`、清空 `selectedObjectId`；`StageViewport.tsx:937-943` 机位视角 `cameraGroup.visible=false` | 选中机位后机身标记与 gizmo 都无显示时机 |

结果：添加机位后（`stageStore.ts:1040-1064`，默认 `position:[5,2.4,6]`、`target:[0,1,0]`、`fov:50`，自动切机位视角），用户只能在右栏填位置 XYZ + 注视点 XYZ + FOV 共 7 个无单位数字（`StageInspector.tsx:331-352`）。而 `StageInspector.tsx:449-451` 的场景提示写着「也可以在视口里拖拽变换」，对相机不成立，属误导。

### 1.2 从零到出片的全路径与卡点

1. 画布打开导演台节点 → 全屏工作台；空场景无引导，仅右下角提示「拖拽旋转 · 滚轮缩放 · 点击对象或机位」（`StageWindow.tsx:1171-1173`）。
2. 左栏 `+` 加人物/几何体，或 header「从参考图生成」；后者需先连接图片节点且配置支持 image 输入的 `text.chat` 模型，否则按钮禁用且只有静态 `title`（`StageWindow.tsx:745-749`，`docs/stage-previs-redesign-plan.md:103` 要求改显式提示至今未做）。
3. 左栏机位 `+` → 只能填数字；自动分镜要求场景里先有 `human`，否则报错（`StageTimeline.tsx:214-218`）。
4. 时间线 `+` 建镜头（默认 5 秒，`stageStore.ts:652-677`）；运镜四选一：捕获关键帧 / 5 个预设 / 手绘路径 / 语义镜头 intent。语义面板需理解构图、机位关系 7 选 1、左右、景别、高度、瞄准、角度偏移（`ShotInspector.tsx:183-215`），虽有中文 `LABEL`（29-51）仍是专业语言。
5. 「捕获关键帧」写的是 `shot.cameraTrack`（`stageStore.ts:836-880`），不修改相机本体，用户容易误以为在移动相机。
6. Header「导出预演 / 导出整片」按钮行为随 `playbackScope` 变化，固定 720p/24fps（`StageWindow.tsx:329-330`），逐帧渲染较慢；产物回画布**不自动成组、不附带结构提示词**（`docs/stage-previs-redesign-plan.md:218-220` 的主动取消决策）。

### 1.3 已有降门槛资产（可直接复用）

| 资产 | 证据 | 小白价值 |
|---|---|---|
| 语义镜头求解器（7 关系 / 3 距离 / 5 高度 / 3 构图、双人自动拉远、中文 notes） | `src/shared/stage-shot-intent.ts:365`、`:20-40` | 代码算坐标，用户不必猜 |
| 现成中文术语表 `LABEL` | `ShotInspector.tsx:29-51` | 可直接做向导/卡片文案 |
| 自动分镜（单人三镜 / 双人正反打 / 群戏，`source='auto'` 不污染手工） | `stage-auto-coverage.ts:67-200`、`StageTimeline.tsx:419-469` | 一键免术语 |
| 对白分镜（「角色：台词」→ 正反打 + 字幕） | `stage-dialogue.ts:38-139`、`StageTimeline.tsx:471-481` | 写台词出分镜 |
| 5 个运镜预设（推近/拉远/环绕/跟拍/升降） | `stage-camera-moves.ts:10-80`、`StageTimeline.tsx:482-498` | 免打关键帧 |
| 场景图→白模一键按钮 + 内置类别表 + 隐私 Dialog | `src/main/scene/analyze.ts:96`、`stage-from-scene-build.ts:31-125`、`StageWindow.tsx:738-752` | 一张图出场景 |
| 对话式预演设施 | `resources/skills/stage-previs/SKILL.md`、`src/main/agent/tools/stage.ts`、`stageBridge.ts:953-978`、`prompt.ts:61-82` | 一句话全流程，刻意不新增对话 UI |
| 10 光照预设 / 雨雪粒子 / 17 动作 | `stage-lighting.ts`、`stage-motions.ts` | 一键氛围与表演 |
| 导出同源链路 | `preview-runner.ts:37-197`、`src/main/stage/export.ts:93-735` | UI 与 Agent 单按钮出片 |
| 注视点拖拽交互基座 | `StageViewport.tsx:372-478` 路径控制点拖拽 | 屏幕坐标→水平面求交 / Alt 改高度，与 `target: StageVec3` 同构 |

### 1.4 文档已提未做 / 已取消的决策

- 已提未做：自动分镜「模式/节奏小面板」（`docs/stage-previs-upgrade-plan.md:729-730`，代码写死 `mode:'auto', pace:1`）；导出后「查看」按钮定位新节点（`:616-617`，现仅 toast）；无上游图显式提示（`stage-previs-redesign-plan.md:103`）；`AgentPanel` 建议提示词升级为含运镜+导出的完整示例（`:158`，现仍是「搭成雨夜街道，加两个人物」）；代码化「写工具前必须 `stage_get`」（`:183`，现仅软提示）；CineBot 面板与 Inspector 布局协调（`:159`）。
- 已取消、**本方案不恢复**：导出结构 JSON / 生成参考提示词节点、预演节点自动成组（`stage-previs-redesign-plan.md:218-220`）；独立入口、手动/智能模式切换、新对话 UI、改名（同文档 119-127）。

---

## 二、已有实现检查（复用 / 扩展 / 新建）

- **复用**：`createCameraMarker` 的带 `stageCameraId` 的 `THREE.Group` + 视锥线框（`StageViewport.tsx:54-148`）；`updateCamera { cameraId, patch }` 命令与 `validateCamera`（`stage-commands.ts:40-43`、205-216）；`registerViewCapture` 中 `position + direction*6` 的朝向→target 换算（`:650-678`）；路径控制点拖拽器（`:372-478`）；全部降门槛资产（1.3 节）。
- **扩展**：`syncTransformControls` / `onTransformDragging` 增加相机分支；`selectCamera` 与 `addCamera` 的视角行为；变换工具条显示条件；`autoCoverage` 调用增加简版节奏参数；导出 toast 增加「查看」；`AgentPanel` suggestion 文案。
- **新建**：相机注视点手柄的控制点可视化（复用路径控制点画法，`StageViewport.tsx:1075-1089`）；空场景三步向导卡片与成片预设卡片（纯 UI 组装，不改 schema）。

---

## 三、改动点（按阶段，可独立交付）

### P0｜相机可视化摆位（最小改动，优先实施；2026-11-27 已实施）

**`src/renderer/src/stage/StageViewport.tsx`**

1. `syncTransformControls`（815-840）：保留对象分支；新增「导演视角 + 选中相机」分支，从 `cameraGroupRef.current.children` 按 `stageCameraId === state.selectedCameraId` 找 marker 并 `transform.attach(target)`；两者都未选中则 detach。
2. `onTransformDragging`（272-300）：优先读 `userData.stageCameraId`，提交 `updateCamera({ cameraId, patch:{ position:[x,y,z] } })`；原 `stageObjectId` 分支保持不变。
3. 注视点手柄：在相机组旁新增 `cameraTargetGroupRef`，为每个机位按 `camera.target` 画小球（复用 `StageViewport.tsx:1075-1089` 的控制点样式），`userData` 写入 `{ stageCameraId, stageCameraTarget:true }`。扩展 `pathPointAt`（372-391）为通用命中，新增 `cameraTargetAt`；`onPointerDown`（393-420）记录 `worldPerPixel`、`mode = altKey ? 'height' : 'plane'`；`onPointerMove`（422-453）复用水平面求交/Alt 高度；`onPointerUp`（455-478）提交 `updateCamera({ cameraId, patch:{ target:[x,y,z] } })` 并恢复 `controls.enabled=true`。
4. 可见性：手柄随 `cameraGroup` 在机位视角/播放时一并隐藏（复用 879-885、937-943 的显隐逻辑）。
5. **不用 rotate gizmo 写朝向**：`target` 是独立字段，视锥长度依赖 `distance`（`:64`），旋转角无法直接存成 target。选中相机时工具条只开放「移动」，旋转/缩放置灰并提示拖注视点手柄。

**`src/renderer/src/stage/stageStore.ts`**

6. `selectCamera`（447-459）：保留 `setActiveCamera`，但 `viewMode` 改为 `'director'`，清空 `selectedObjectId`/`selectedPathId`，不清空 `selectedShotId`（运镜仍需镜头）。机位画面预览改由显式入口触发（见第 8 点）。
7. `addCamera`（1040-1064）：默认视角同样改为 `'director'`，使刚添加的机位立即可拖。
8. `updateCamera`（1105-1107）已支持 `patch.position/target`，无需新增命令。

**`src/renderer/src/stage/StageWindow.tsx`**

9. 变换工具条（1140-1160）显示条件扩展为「导演视角 &&（选中对象 || 选中相机）」；`TRANSFORM_OPTIONS`（44-48）在选中相机时仅「移动」可用，旋转/缩放 `disabled` 并 `title` 说明。
10. header 视角切换（763-790）：「机位视角」保持不变，作为显式预览入口；机位列表项单击选中并留在导演视角，双击可切机位视角预览（或加一个小预览按钮，实现时按 UI 规格择一）。
11. 视口提示（1171-1173）补充「拖机身改位置 · 拖黄色手柄改朝向 · 按住 Alt 改高度」。

**`src/renderer/src/stage/StageInspector.tsx`**

12. 修正 449-451 的误导文案；相机字段本身（`name/position/target/fov/aspect`）不改。

**`src/shared/stage-commands.ts`**：无需改动，复用 `updateCamera` 与 `validateCamera`。

### P1｜新手三步向导（免术语起步；2026-11-27 已实施）

**`src/renderer/src/stage/StageWindow.tsx` + 新建向导组件（放 `src/renderer/src/stage/`）**

13. 触发条件：`doc.objects/cameras/shots` 全空且本机未标记已引导（用 `localStorage` 键记录，**不改 StageDoc schema**）。场景一有内容即隐藏；提供「跳过/不再显示」。
14. 三步卡片：① 起点（从参考图生成 / 空白场景）；② 放人物（一键添加 `human`）；③ 一键分镜（调用 `autoCoverage({ subjectIds, mode:'auto', pace, replace:true })`）。
15. 简版节奏映射：快 `pace=0.6` / 标准 `pace=1` / 舒缓 `pace=1.6`，替代专业参数（补文档已提未做的模式/节奏面板意图）。
16. 成片预设卡片：单人三镜 / 双人对话 / 群戏，分别复用 `buildAutoCoverage` 的 `single`/`dialogue`/`group` 模式，文案直接用 `ShotInspector.tsx:29-51` 的中文 `LABEL`。
17. `ShotInspector` 语义术语面板默认折叠为「高级设置」，主推预设卡片；折叠态仍可展开微调，不删能力。
18. 显式前置提示：无上游图时把静态 `title` 改为可见文案（`StageWindow.tsx:745-749`）；无人物时自动分镜按钮给出「先添加人物」引导而非报错。

### P2｜出片与协作闭环（2026-11-27 已实施）

19. `src/renderer/src/stage/preview-runner.ts:87-193`：收集新建节点 id，完成 toast 增加「查看节点」按钮定位（补 `stage-previs-upgrade-plan.md:616-617` 未做项）。
20. `src/renderer/src/agent/AgentPanel.tsx:171-172`：suggestion 升级为含运镜与导出的完整示例（如「把这个场景搭成雨夜街道，加两个人物，排一段 10 秒推拉镜头并导出预演」），与已升级的欢迎语一致。
21. 长导出确认与全局单导出锁：扩展现有导出状态（`StageWindow.tsx:284-355`、`stageStore.ts` 导出中状态）为全局锁，>5 分钟确认、>10 分钟警告（文档意图 `stage-previs-upgrade-plan.md:590-593`）；复用现有 `cancelExport` 作为取消路径。
22. 导出前明确提示「当前逐帧渲染，720p/24fps，请耐心等待」，避免小白以为卡死。

### P3｜对话式预演打磨（可选，不新增 UI；2026-11-27 已做文案部分）

23. 仅文案小白化：批量计划确认 Dialog 说明「这是一串自动操作，可取消」，Skill 示例前置条件写清。
24. 代码化「写工具前必须 `stage_get`」（现仅软提示 `prompt.ts:64/73`）：**未实施**。评估后认为硬约束会误伤单步编辑与正常工具调用，收益不确定；保留现有软提示与精简场景快照双保险。

---

## 四、明确不做

- 不改名「导演台」、不新增独立预演入口、不新增对话输入区、不做手动/智能模式切换（沿用 `stage-previs-redesign-plan.md:119-127` 已拍板结论）。
- 不恢复导出结构 JSON / 生成参考提示词节点、不自动成组（`stage-previs-redesign-plan.md:218-220`）。
- 不新增 `transformCamera` 命令、不改 `StageCamera` schema、不引入新依赖；three 版本已有 `TransformControls`（`^0.187.0`）。
- 不做影视资产库、四视图、EDL、场景真实深度校准（沿用 `code-map/04-director-stage.md:141-157` 的当前边界）。

---

## 五、影响模块

| 模块 | 涉及文件 | 说明 |
|---|---|---|
| 04 导演台 | `StageViewport.tsx`、`StageWindow.tsx`、`StageInspector.tsx`、`stageStore.ts`；向导新组件 | 主要改动面；命令层 `stage-commands.ts` 不改 |
| 10 UI | `AgentPanel.tsx`、`components/ui/` | 复用 `Button/Select/Menu/Popover/Dialog` 与 `tokens.css`，禁止硬编码色值 |
| 06 Agent | 仅 P3 改 Skill/工具提示时 | 若改工具描述，须同步 MCP 元数据并跑 `check:agent-coverage` |
| 01 画布 | `preview-runner.ts` | 导出回画布节点与 toast |
| 文档 | `code-map/04`、`08`、`11`、`docs/README.md` | 实施后运行 `map:code` 并 `check:docs` |

---

## 六、验收

1. 添加机位后，导演视角可拖机身改 `position`、拖注视点手柄改 `target`；切换「机位视角」画面与导出结果一致；右栏数字输入双向同步；撤销/重做可用。
2. 选中相机时旋转/缩放按钮置灰并有说明；机位视角与播放时 gizmo、手柄、机身标记均隐藏，不穿帮。
3. 空场景出现三步向导，无摄影术语经验的用户可在 3 步内得到一段可播放的自动分镜；预设卡片产物可继续手改。
4. 无上游图、无人物、长导出均有可见提示；导出完成 toast 可定位新建节点。
5. `corepack pnpm typecheck` / `test` / `check:ui` / `check:docs` / `check:agent-coverage` 通过；`dev:isolated` 实测上述路径。
6. **人工走查项**：找一位不了解「过肩 / 景别 / FOV」的用户，在无指导情况下完成一次预演出片；不写脆弱的截图回归测试。

---

## 七、风险与约束

- 机位视角隐藏 `cameraGroup` 是现有设计（`StageViewport.tsx:937-943`）；P0 在导演视角编辑机位、机位视角只做预览，不动视角语义。
- `target` 与视锥长度耦合（`StageViewport.tsx:64`），拖 target 后需依赖现有 `doc` 变化 effect 重建 marker（776-788、903-919）。
- `selectCamera` 行为变化会影响「点机位即看画面」的旧习惯，须用显眼的预览入口补偿，实测走查。
- `stageStore.ts` 等文件受企业透明加密影响，读取需走 Node/Vite 明文链路；pnpm 命令统一用 `corepack pnpm`。
- 新增文件/功能后按项目约定更新代码地图与能力清单，运行 `map:code`、`check:docs`、`check:ui`、`check:agent-coverage`。
- 本方案为设计意图，不代表已实现；实施进度以 `code-map/04` 与 `08-capabilities.md` 的状态更新为准。

---

## 八、实施顺序

1. **P0 相机可视化摆位**：先做，独立可交付，直接回应用户反馈。
2. **P1 三步向导**：复用自动分镜与求解器，纯 UI/文案组装。
3. **P2 出片闭环**：toast 查看、suggestion、长导出提示。
4. **P3 对话式打磨**：可选，按 P2 后的实际体验决定是否做。

每阶段完成后更新 `code-map/04`、`08-capabilities.md`、`11-feature-index.md` 与方案状态，并留一条验证记录。
