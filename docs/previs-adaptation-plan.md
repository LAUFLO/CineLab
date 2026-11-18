# Previs 能力落地方案（Bloomway 借鉴 + 场景图白膜）

日期：2026-11-18
状态：实施中（M1–M5 已完成，M6 收尾）
适用版本：v0.2.x
最后核对：2026-11-18

> 来源：对 Bloomway World Director（MIT，Copyright 2026 Bloomway AI Inc.）的代码级调研。
> 本方案只借鉴其数据契约与算法思想；直接移植部分在 `THIRD_PARTY_NOTICES` 中声明。
> 目标：导演台从「手工摆机位」升级为「AI 可写语义、代码解算几何、场景可自动生成」。
> 交付方式：AI 全程开发，一个 PR，按里程碑分 commit；不按人日估算，按执行批次推进。

---

## 1. 背景与目标

### 1.1 调研结论

Bloomway World Director 可复用的能力有三块：

1. **语义镜头 → 坐标求解**：模型只写 `relation / distance / height / aim`，坐标由代码解算，并处理过肩、越轴、双人构图。
2. **确定性程序化世界**：整数 RNG、1 cm 取整、90° 朝向、查表三角函数，保证云端与浏览器生成同一个城市。
3. **预演数据契约**：`plan.json` + `world-ref.json` 的结构，适合作为 AI 与 3D 之间的中间层。

CineLab 已有更完整的 Stage 对象模型、Agent 工具链和 ffmpeg 导出管线，缺的是第 1 和第 2 块。

### 1.2 本方案交付的能力

| 能力 | 里程碑 | 用户价值 |
|---|---|---|
| Hermite 相机插值（全默认） | M1 | 一次运镜到底，转弯不顿 |
| 语义镜头层 + 求解器（含双人/群体） | M2 | CineBot 说「过肩拍 A 看 B」就能落地 |
| 完整 Previs 世界 | M3 / M4 | 街道/地标/水/室内，一键出白膜环境 |
| 场景图 → 白膜 | M5 | 一张概念图生成可开拍的 3D 场景 |
| 自测报告与文档 | M6 | 可验收、可回溯 |

### 1.3 明确不做

- 不做独立物理校验器、阈值配置、导出阻断（预演是给 AI 做参考，物理速度不是硬边界）。
- 不做单物体 3D 生成（`model.i2m`、GLTFLoader、`OutputKind='model'`）；保持盒子。
- 不做 Bloomway 的完整 Studio UI。
- 不做关键词 composer（CineLab 有真 LLM）。
- 不做 MediaRecorder 导出（Electron + ffmpeg 更合适）。
- 不把 3DGS / NeRF 作为白膜主路线。

---

## 2. 已确认决策

| 决策 | 结论 |
|---|---|
| Hermite | **全部默认 Hermite**，旧文档也按 Hermite 解释；`linear` 保留为显式逃生口 |
| 行为变更提示 | 不做（当前没有用户） |
| 物理校验 | **不做**；保留现有 `validateStageDoc`（数据合法性） |
| 求解器 | **零修改**：不自动延迟、不降级、不改时间；只解释语义 |
| P3 范围 | **直接移植 Bloomway 世界生成，做完整** |
| 上游跟进 | 不跟进；记录 commit + `PROVENANCE.md` |
| 世界存储 | **拆文件**：`stages/<stageId>.world.json`，只存 `PrevisWorldRef` |
| 世界导出 | 参与导出 |
| 语义镜头粒度 | 每个 shot 一条 intent 轨 |
| 主体字段 | `subjectIds: string[]` 直接替换 `subjectId` |
| 双人/群体 | 本次完整支持（`single / two_shot / group`） |
| B 路线 | **砍掉**，保持盒子；保留 `gltf` 类型和 `assetPath` 字段 |
| 外部图 | 全局资产库 + 创建图片节点 + 自动连线到 StageNode；不新增项目 assets IPC |
| 参考图数量 | StageNode 只消费第一张入边图 |
| 类别表 | 全局级 `%APPDATA%\cinelab\stage-object-presets.json`；内置 60–80 类；支持自定义与导入/导出 |
| 形状 | 只限 `box / sphere / plane / human / crowd` |
| 交付 | 一个 PR，按里程碑分 commit，每周 rebase main；你控制发版 |
| 验收 | 你最终验收；我交付一份自测报告 |

---

## 3. 设计原则

1. **纯函数优先**：求解、世界生成、场景校准全部放 `src/shared/`，不依赖 DOM/Electron。
2. **零修改**：求解器严格按用户给的语义和时间生成；不替用户改镜头。
3. **双模式互斥**：语义镜头（intent）与手工关键帧（cameraTrack）二选一，切换时明确提示。
4. **单位统一**：米、弧度、毫秒、Y-up；Previs 内部保持 X/Y + H，渲染时转换。
5. **AI 写语义，代码算几何**：Agent 不直接猜相机坐标。
6. **失败降级**：世界/场景图生成失败时保留原白膜，不阻塞镜头。
7. **分层验收**：纯函数 → UI → Agent 工具 → 导出，每层可独立验证。

---

## 4. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│ src/shared/                                                  │
│  stage-schema.ts        扩展 cameraSmoothing / intent / world│
│  stage-timeline.ts      Hermite 采样（默认）                  │
│  stage-shot-intent.ts   语义镜头类型 + 求解器（含双人/群体）   │
│  stage-world-types.ts   PrevisWorldRef / PrevisWorld          │
│  stage-world-coords.ts  stage ↔ world 坐标转换                │
│  scene-draft.ts         场景图 JSON schema + 校验             │
│  scene-calibrate.ts     深度/地平线/FOV/尺度校准              │
│  scene-object-presets.ts 全局类别表加载/合并                  │
│  previs/                从 Bloomway 移植的生成器              │
├─────────────────────────────────────────────────────────────┤
│ src/renderer/src/stage/                                      │
│  stage-world-scene.ts   世界 → Three.js（合并 geometry）      │
│  StageInspector.tsx     镜头语义面板                          │
│  StageTimeline.tsx      intent 标记                           │
│  StageWindow.tsx        世界设置 / 场景图入口                 │
│  stageStore.ts          world / intent 状态                   │
├─────────────────────────────────────────────────────────────┤
│ src/main/                                                    │
│  agent/tools/stage.ts   新增语义镜头/世界/场景图工具          │
│  stage/storage.ts       world 文件拆分/合并                   │
│  stage/export.ts        导出时构建世界                        │
│  media/scene-analyze.ts VLM + 深度调用                        │
│  settings/object-presets.ts 全局类别表读写                    │
├─────────────────────────────────────────────────────────────┤
│ resources/                                                   │
│  scene-worker/worker.py 深度统计（复用 depth-runtime）        │
└─────────────────────────────────────────────────────────────┘
```

数据流：

```
场景图 ──VLM──> scene draft ──深度校准──> PrevisWorldRef + StageObjects
                                              │
导演台 ──intent──> solveStageShotIntent ──> cameraTrack ──> 预览/导出
                                              │
                                   notes（只解释语义，不评价物理）
```

---

## 5. 代码与文档落点总表

| 能力 | 新增文件 | 修改文件 |
|---|---|---|
| Hermite | — | `stage-timeline.ts`、`stage-schema.ts` |
| 语义镜头 | `stage-shot-intent.ts`、`__tests__/stage-shot-intent.test.ts` | `stage-schema.ts`、`stageStore.ts`、`StageInspector.tsx`、`StageTimeline.tsx`、`stage.ts` |
| Previs 世界 | `previs/*`、`stage-world-types.ts`、`stage-world-coords.ts`、`stage-world-scene.ts`、`__tests__/previs-*.test.ts` | `stage-schema.ts`、`stage-render.ts`、`stage/storage.ts`、`StageWindow.tsx`、`stageStore.ts`、`stage.ts` |
| 场景图白膜 | `scene-draft.ts`、`scene-calibrate.ts`、`scene-object-presets.ts`、`media/scene-analyze.ts`、`__tests__/scene-*.test.ts` | `stage.ts`、`StageWindow.tsx`、`ipc-contract.ts`、`Canvas.tsx`、`preload/index.ts` |
| 类别表 | `settings/object-presets.ts`、`panels/settings/ObjectPresetsPanel.tsx` | 设置页路由、`ipc-contract.ts` |

---

## 6. M1：Hermite 相机插值

### 6.1 目标

- 相机轨道默认使用 Hermite 插值，改善长距离运镜。
- 不新增任何校验、提示或阻断。

### 6.2 数据模型

```ts
// stage-schema.ts
export type CameraTrackSmoothing = 'linear' | 'hermite'

export interface StageShot {
  // ...现有字段
  /** 关键帧插值模式；缺省按 'hermite' 解释 */
  cameraSmoothing?: CameraTrackSmoothing
}
```

### 6.3 采样接口

```ts
export function sampleCameraTrack(
  camera: StageCamera,
  shot: Pick<StageShot, 'durationMs' | 'cameraTrack' | 'cameraSmoothing'>,
  timeMs: number
): SampledCamera
```

- `cameraSmoothing` 缺省为 `'hermite'`。
- `'linear'` 时完全保持现有 easing 行为。
- 位置与 target 均使用 Hermite；FOV 使用 smoothstep。
- 端点用单侧差分；重复时间戳退化为线性。

顶点切线：

```
m_i = (p[i+1] - p[i-1]) / (t[i+1] - t[i-1])
p(u) = h00·p_i + h10·m_i·dt + h01·p[i+1] + h11·m[i+1]·dt
h00 = 2u³ - 3u² + 1
h10 = u³ - 2u² + u
h01 = -2u³ + 3u²
h11 = u³ - u²
```

### 6.4 不做的事

- 不新增 `validateStagePlayback`。
- 不新增 `stage_validate` 工具。
- 不做速度/穿模/距离/接触提示。
- 不自动修改用户镜头。

### 6.5 验收

- 三点直线、端点、单 key、重复时间、非均匀时间均有单测。
- 旧文档按 Hermite 解释；显式 `linear` 可复刻旧观感。
- 现有 `typecheck`、`test` 通过。

---

## 7. M2：语义镜头层（含双人/群体）

### 7.1 类型

```ts
// stage-shot-intent.ts
export type StageCameraRelation =
  | 'front' | 'front_side' | 'side' | 'back_side'
  | 'behind' | 'over_shoulder' | 'hold'

export type StageCameraDistance = 'close' | 'medium' | 'far'
export type StageCameraHeight = 'floor' | 'low' | 'eye' | 'high' | 'crane'
export type StageCameraAim = 'feet' | 'body' | 'face'
export type StageShotFraming = 'single' | 'two_shot' | 'group'

export interface StageShotIntentKey {
  timeMs: number
  subjectIds: string[]          // 1–8，[0] 主、[1] 次
  framing: StageShotFraming
  relation: StageCameraRelation
  side?: 'left' | 'right'
  towardId?: string             // 仅 over_shoulder
  distance?: StageCameraDistance
  height?: StageCameraHeight
  aim?: StageCameraAim
  angleOffsetDeg?: number       // 0–360
  fovDeg?: number
  still?: boolean
}

export interface StageShotIntent {
  version: 1
  keys: StageShotIntentKey[]
}
```

约束：

- `framing='single'`：`subjectIds.length === 1`。
- `framing='two_shot'`：`subjectIds.length === 2`。
- `framing='group'`：`subjectIds.length` 2–8。
- `towardId` 只在 `over_shoulder` 生效；其他情况传了报参数错误。
- 超过 8 个截断前 8 个并提示。

常量：

```ts
const DISTANCE_M = { close: 1.5, medium: 2.5, far: 4 }
const HEIGHT_M   = { floor: 0.4, low: 0.9, eye: 1.6, high: 2.4, crane: 3.2 }
const AIM_H      = { feet: 0.25, body: 1.2, face: 1.7 }
const RELATION_DEG = { front: 0, front_side: 45, side: 90, back_side: 135, behind: 160 }
```

### 7.2 求解器

```ts
export interface StageShotSolveResult {
  track: CameraKeyframe[]
  notes: string[]   // 只解释语义解算，不评价物理可行性
}

export function solveStageShotIntent(
  doc: DirectorStageDoc,
  shot: StageShot,
  options?: { maxKeys?: number }
): StageShotSolveResult
```

算法：

1. 校验 intent keys 时间递增、subject/toward 存在（数据合法性）。
2. 采样每个主体位置：`object.transform.position` + 该 shot 的 `actionTracks` 位置插值。
3. 采样朝向：action rotation > 运动方向 > object rotation > 默认 -Z。
4. `single`：按 relation 角度 + distance 计算相机位置。
5. `two_shot`：相机在两人连线的法线上，`side` 决定哪一侧；距离先按景别取基础值，再按两人投影宽度扩展，保证两人都在画面内且留 10% 边距；扩展后超过 `far` 降级为 `group` 并在 notes 说明。
6. `group`：用所有主体的包围盒中心，距离按包围盒宽度自适应，上限 `far`。
7. `over_shoulder`：以 `subjectIds[0]` 为肩后主体，`towardId` 为看向对象，相机在背后偏 15–20°。
8. 密集采样：`step = clamp(durationMs / 1000 / 90, 0.15, 0.5)`，总 key ≤ 100。
9. 轴线：同一 subject 连续 key 缺省沿用上一个 `side`；跨 shot 不自动继承。
10. 输出 `cameraTrack`，`easing: 'linear'`，写 `intentSolvedAt`。

### 7.3 零修改

- 不自动延迟取景时间。
- 不自动降级为 `hold`。
- 不自动挪机位。
- 超速/不可达只写 `console.debug` 或诊断日志，用户不可见。
- `notes` 只解释「按你的语义做了什么」，例如：
  - 「过肩镜头原本看错方向，已按 B 校正。」
  - 「为了不越轴，这个镜头保持在上一镜的同一侧。」
  - 「两人间距较大，已按构图需要把机位拉远。」

### 7.4 双模式

- 存在 `intent` 时，`cameraTrack` 为求解结果，不可手工拖拽。
- 「转手工」删除 `intent`，保留当前 `cameraTrack`。
- shot 时长变化时按比例重映射 intent key 并重新求解。

### 7.5 UI

- `StageInspector` 新增「镜头语义」面板：framing、主体多选、关系、左右、toward、景别、高度、瞄准、FOV、角度偏移、添加/删除 key。
- `StageTimeline` 只显示 intent key；求解 key 灰显；顶部显示「语义镜头」标签和「转手工」。
- `notes` 显示在 Inspector 底部，语气通俗，不出现 `hold/drift/retarget/m/s` 等词。

### 7.6 Agent 工具

| id | name | 说明 |
|---|---|---|
| `stage.setShotIntent` | `stage_set_shot_intent` | 设置/替换 shot 的 intent 轨，返回 notes |
| `stage.clearShotIntent` | `stage_clear_shot_intent` | 转手工，保留 track |

工具描述必须写：

> 优先用 `stage_set_shot_intent` 描述机位关系，不要直接猜相机坐标。

### 7.7 验收

- 单主体 7 种 relation 求解正确。
- 双人：两人都在画面内，左右不越轴，间距大时自动拉远。
- 群体：2–8 人都能被框住，超过 8 个截断提示。
- 过肩 A 看 B：相机在 A 背后、B 在画面中心。
- 求解器不修改用户给的时间/机位；只输出原始解 + notes。
- 手工 ↔ 语义双向切换不丢数据。

---

## 8. M3：Previs 世界数据层

### 8.1 范围

完整移植 Bloomway 的世界生成，不做裁剪：

- 布局：`street` / `crossroad` / `t_junction` / `plaza`
- 风格：`modern_city` / `jp_modern` / `edo` / `custom`
- 密度：`low` / `medium` / `high`
- 时段：`day` / `dusk` / `night`
- 天气：`clear` / `rain` / `snow`
- 地标：23 种
- 水：`river` / `river_along` / `canal` / `waterfront`，含桥、码头、栏杆
- 地形：`slope`（0.03–0.2）、`hills`
- 室内：房间类型、尺寸、家具布局
- 主题：`mars` / `orbital` / `future` / `cyberpunk`
- 霓虹、电线、车辆
- `overrides`：`move` / `resize` / `remove` / `restore` / `add`

### 8.2 移植清单

| Bloomway 源文件 | CineLab 落点 | 改动 |
|---|---|---|
| `packages/core/src/previsWorldGen.ts` | `src/shared/previs/world-gen.ts` | 导入路径、类型 |
| `packages/core/src/previsWorldWater.ts` | `src/shared/previs/world-water.ts` | 导入路径 |
| `packages/core/src/previsInterior.ts` | `src/shared/previs/interior.ts` | 导入路径 |
| `packages/core/src/previsRoom.ts` | `src/shared/previs/room.ts` | 导入路径 |
| `packages/core/src/previsWorldPlan.ts` | `src/shared/previs/world-plan.ts` | 导入路径 |
| `packages/core/src/previsVehicles.ts` | `src/shared/previs/vehicles.ts` | 车辆/ride |
| `apps/studio/src/director/v2/world3dThemes.ts` | `src/renderer/src/stage/world-themes.ts` | 主题配色 |
| `apps/studio/src/director/v2/world3dContent.ts` | `src/renderer/src/stage/world-content.ts` | 适配 StageObject/相机/材质 |
| `world3dScene.ts` | 不移植 | CineLab 已有视口 |
| `world3dRecorder.ts` | 不移植 | CineLab 用 ffmpeg |

### 8.3 坐标约定

Previs 内部保持 Bloomway 的 `(x, y, h)`：x 向东、y 向北、h 向上，原点为世界中心。

渲染时转换为 CineLab 的 Y-up：

```ts
// stage-world-coords.ts
export function previsToThree(x: number, y: number, h: number): [number, number, number] {
  return [x, h, -y]
}

export function threeToPrevis(x: number, y: number, z: number): [number, number, number] {
  return [x, -z, y]
}
```

舞台锚点：

```ts
interface PrevisWorldStageAnchor {
  x: number
  y: number
  headingDeg: 0 | 90 | 180 | 270
}

export function stageToWorld(anchor, x, y): { x: number; y: number }
export function worldToStage(anchor, x, y): { x: number; y: number }
```

往返单测误差 < 1e-6。

### 8.4 数据模型与拆文件

```ts
// stage-schema.ts
export interface DirectorStageDoc {
  // ...现有字段
  /** 完整 previs 世界；缺省行为不变 */
  world?: PrevisWorldRef
}
```

存储：

- 内存模型保持 `doc.world`。
- `storage.ts` 保存时把 `world` 写到 `stages/<stageId>.world.json`，stage JSON 中不出现路径。
- 加载时先读 stage JSON，再读同名 world 文件合并；world 文件缺失时忽略并保留 `doc.world` 为空。
- 只存 `PrevisWorldRef`（参数），不存生成后的几何。

### 8.5 许可

直接移植必须在 `THIRD_PARTY_NOTICES` 增加：

> Portions adapted from Bloomway World Director (MIT, Copyright 2026 Bloomway AI Inc.)

保留原 MIT 文本与版权声明，记录上游 commit 到 `PROVENANCE.md`。

### 8.6 验收

- 4 布局、4 风格、23 地标、4 水、3 天气、3 主题均可生成。
- 同 seed 数据层逐字段一致；不同 seed 不同。
- 坐标往返测试通过。
- 世界文件拆分/合并后，文档内容与拆分前等价。
- 上游更新不自动跟进。

---

## 9. M4：世界渲染 / UI / 导出

### 9.1 渲染

`stage-world-scene.ts`：

- 地面、道路、人行道、斑马线、车道线各一个合并 mesh。
- 建筑按材质合并，屋顶按类型合并。
- 目标 < 300 draw calls。
- 雨/雪用 `THREE.Points`。
- 夜景窗户自发光；霓虹 per-building 材质。
- 世界构建一次，文档变化时重建，相机移动不重建。

`stage-render.ts`：

- `buildScene` 同时构建 `doc.world`。
- 导出预览包含世界与白膜对象。
- 舞台 anchor 内清空建筑，保证演员不被遮挡。

### 9.2 UI

- `StageWindow` 顶部「世界」按钮：预设（现代街道/江户/雨夜/雪地/火星）、seed、重新随机、清除。
- 设置面板：风格、布局、密度、时段、天气、地标、水、坡地、主题。
- 建筑不可选中、不可编辑（v1）。

### 9.3 Agent 工具

| id | name | 说明 |
|---|---|---|
| `stage.setWorld` | `stage_set_world` | 设置世界 ref，返回生成统计 |
| `stage.randomizeWorld` | `stage_randomize_world` | 换 seed |

`stage_capabilities` 增加世界预设、风格、地标、天气列表。

### 9.4 性能预算

| 项 | 目标 |
|---|---|
| 生成 160×160 | < 30 ms |
| 首次构建 mesh | < 150 ms |
| 常驻 draw calls | < 300 |
| 15 s @30fps 导出 | 世界增加 < 20% 时长 |

### 9.5 验收

- 世界可开关；关闭后行为与现在完全一致。
- 导出视频包含世界。
- 舞台内无建筑遮挡。
- 性能达标。

---

## 10. M5：场景图 → 白膜

### 10.1 目标

输入一张场景图（AI 生成图、参考图、截图），输出可编辑、比例合理的 3D 白膜 StageDoc，打开即可摆机位。

### 10.2 路线

采用路线 A：VLM 语义 + 深度校准 + 程序化白膜。

不做：

- 单物体 3D 生成（GLTFLoader / `model.i2m`）。
- 3DGS / NeRF 环境。
- 多图融合。

### 10.3 外部图上传与连线

```
拖入 / 粘贴外部图
  → library.importAssets('场景')（全局资产库）
  → 创建图片节点（scope: 'global'）
  → 自动连线到当前 StageNode（导演台开着时）
  → StageNode 只取第一张入边图作为主参考
  → 生成白膜时按 scope 解析路径
```

- 不新增「外部文件导入项目 assets」的 IPC。
- 图片随全局资产库走，不随项目导出；设置页说明。
- 粘贴继续走现有剪贴板链路（落项目 assets），同样创建节点 + 连线。
- 多张入边时只消费第一张，UI 提示「只使用第一张，其余已忽略」，提供「更换主参考」。
- Canvas 新增 `onDrop`；无文件拖入时忽略。

### 10.4 VLM 输出 Schema

只允许相对位置，不允许米制坐标：

```jsonc
{
  "set": { "kind": "outdoor", "description": "rainy Edo street at night" },
  "world": {
    "style": "edo",
    "layout": "street",
    "density": "medium",
    "timeOfDay": "night",
    "weather": "rain",
    "landmarks": [{ "kind": "pagoda", "spot": "far_north" }],
    "water": { "kind": "canal" }
  },
  "room": null,
  "objects": [
    {
      "label": "street lamp",
      "sizeClass": "medium",
      "relativeX": 0.18,
      "depthLayer": "near",
      "facing": "toward_camera"
    }
  ],
  "camera": {
    "heightHint": "eye",
    "pitchHint": "level",
    "fovHintDeg": 45,
    "horizonY": 0.42
  }
}
```

约束：

- `relativeX` ∈ [0, 1]
- `depthLayer` ∈ {near, mid, far}
- `sizeClass` ∈ {small, medium, large}
- 未知字段拒绝，解析失败重试一次，再失败回退到「纯世界生成」。

### 10.5 深度校准

| 量 | 方法 |
|---|---|
| 地平线 | 深度突变 + 天空/地面分割 |
| 地面平面 | RANSAC 拟合 |
| 相对距离 | near/mid/far → 米数（结合世界尺寸） |
| FOV | 灭点距离估算，与 `fovHintDeg` 交叉验证 |
| 尺度 | 门高 2.1 m / 层高 3 m / 人高 1.7 m 先验，取最可信 |

校准结果由 `scene-calibrate.ts` 纯函数输出。

### 10.6 物体类别表

全局级 `%APPDATA%\cinelab\stage-object-presets.json`：

- 内置 60–80 类，覆盖室内、室外、人物、自然、交通、道具。
- 字段：`name`、`aliases`、`w`、`d`、`h`、`color`、`shape`、`type`。
- `shape` 只限 `box / sphere / plane / human / crowd`。
- 支持用户新增、覆盖内置类别；未识别类别回退 `box` 1×1×1 灰色。
- 设置页提供简单列表编辑器（增删改）+ 导入/导出 JSON。
- 不做拖拽排序、不做缩略图预览。

### 10.7 生成与回填

- 室外：`normalizePrevisWorldRef(draft.world)` → `generatePrevisWorld`。
- 室内：`createPrevisRoomPlan` → 房间尺寸 + 家具。
- 物体：按类别表映射为 `StageObject`，按相对布局放到世界坐标。
- 相机：放到估定机位，FOV 用校准值。
- 原图可作为参考层。

### 10.8 置信度与降级

返回 `confidence: high | medium | low`。

- `low`：只生成世界，不生成物体。
- 校准失败：使用默认机位（人眼高度、水平朝向）。
- VLM 失败：回退到「按描述生成世界」或让用户选预设。

### 10.9 隐私提示

- 首次使用「场景图 → 白膜」时弹窗：图片会发送给用户配置的多模态模型，可勾选不再提示。
- 设置页保留说明。

### 10.10 Agent 工具

| id | name | 说明 |
|---|---|---|
| `stage.fromSceneImage` | `stage_from_scene_image` | 图片资产 → 白膜 StageDoc，返回 draft + 校准 + 置信度 |

参数：`nodeId`、`imageAssetId`、可选 `styleOverride`、`seed`、`openStage`。

### 10.11 验收

- 室外/室内图片均可生成。
- 同图同 seed 结果稳定。
- 多张入边只消费第一张，可切换。
- VLM/深度失败有明确降级路径。
- 生成后可直接打开导演台。
- 全局类别表可编辑、导入/导出。

---

## 11. M6：收尾

### 11.1 自测报告

交付一份汇总报告，按里程碑分节：

- 验证命令
- 预期结果
- 实际结果
- 已知问题
- 未覆盖项

每个 commit message 写本次验证命令。

### 11.2 文档

- 更新 `docs/previs-adaptation-plan.md`（随实现同步）。
- 更新 `docs/agent-capabilities.md` 的新工具。
- 更新 `docs/ui-spec.md` 的导演台/场景图入口。
- 更新 `docs/architecture.md` 的世界存储与坐标约定。
- 更新 `THIRD_PARTY_NOTICES.md` 与 `PROVENANCE.md`。

### 11.3 测试

- 单测：Hermite、语义镜头、世界生成、坐标、场景 draft、校准、类别表。
- 本地 E2E：导演台语义镜头 → 播放；外部图 → 白膜 → 导演台。
- 不进 CI（当前 CI 不跑 Playwright）；交付时给本地运行命令。

---

## 12. 兼容与迁移

| 项 | 策略 |
|---|---|
| 旧 `stages/*.json` | 新字段可选；读取时补默认值，不写回 |
| Hermite 默认 | 旧文档按 Hermite 解释；`linear` 可显式回退 |
| `subjectId` 移除 | 没有真实用户；旧测试项目手工迁移到 `subjectIds` |
| 世界拆文件 | 加载时合并；world 文件缺失忽略 |
| 世界关闭 | `doc.world` 缺省时不构建世界，行为与现在一致 |
| 导出 | 有 world 时加载，缺失时跳过 |
| 外部图 | 全局资产库；不随项目导出，设置页说明 |

---

## 13. 测试计划

### 13.1 单元测试

| 文件 | 用例 |
|---|---|
| `stage-timeline.test.ts` | Hermite 直线/端点/单 key/重复时间/非均匀时间；linear 回归 |
| `stage-shot-intent.test.ts` | 7 种 relation；单/双/群体；左右不越轴；过肩重定向；间距自适应；超过 8 截断；零修改 |
| `previs-world.test.ts` | 确定性快照；不同 seed；4 布局；23 地标；水/桥；边界 extent |
| `stage-world-coords.test.ts` | stage ↔ world 往返；4 种 heading |
| `scene-draft.test.ts` | Schema 校验；非法字段拒绝；相对位置边界 |
| `scene-calibrate.test.ts` | 地平线/灭点/FOV/尺度；异常输入降级 |
| `scene-object-presets.test.ts` | 内置表加载；用户覆盖；非法 shape 拒绝；导入/导出 |

### 13.2 本地 E2E

- 新建世界 → 加人物 → 设语义镜头 → 播放 → 导出。
- 拖入图片 → 创建节点 + 连线 → 生成白膜 → 打开导演台。
- 多张图只取第一张 → 切换主参考。

### 13.3 性能

| 场景 | 目标 |
|---|---|
| 世界生成 160×160 | < 30 ms |
| 世界 mesh 构建 | < 150 ms |
| 场景图管线（不含排队） | < 20 s |
| 导出 15 s @30fps | 世界增加 < 20% |

---

## 14. 交付节奏

不按人日估算。按 6 个里程碑、约 10–12 个执行批次推进：

| 里程碑 | 批次 | 交付物 |
|---|---|---|
| M1 Hermite | 1 | 采样 + 单测 |
| M2 语义镜头 | 2–3 | 类型/求解器/UI/工具 |
| M3 世界数据 | 2 | 移植 + 坐标 + 存储 + 单测 |
| M4 世界渲染 | 2 | 渲染 + UI + 导出 |
| M5 场景图 | 2–3 | 外部图/连线 + VLM/校准 + 类别表 |
| M6 收尾 | 1 | 自测报告 + 文档 |

每个批次完成即报告：改了什么、验证命令、结果、已知问题。你随时可以叫停或调整。

---

## 15. 风险与回滚

| 风险 | 对策 | 回滚 |
|---|---|---|
| 移植代码类型不收敛 | 先 `tsc --noEmit`，删未使用导出，补关键单测 | 关闭世界 |
| 世界性能拖慢导出 | 合并 geometry + 预算门槛 + 开关 | 关闭 `doc.world` |
| 坐标/单位错误 | 转换函数 + 往返单测 | 纯函数回退 |
| VLM 空间幻觉 | 只给相对布局 + Schema + 代码映射 | 降级为纯世界生成 |
| 单图遮挡/歧义 | 允许换图；手动调整 | 只生成世界 |
| 外部图不随项目 | 设置页说明；未来可选复制到项目 | 手动导出图片 |
| 双人/群体取景越界 | 自动拉远 + 降级 group + 提示 | 转手工调整 |
| 求解器零修改导致镜头不可播 | 用户可手工改；只写开发者日志 | 转手工 |
| 一个 PR 过大 | 按里程碑分 commit；每周 rebase | 按 commit 回滚 |

---

## 16. 许可与来源

- Bloomway World Director：MIT，Copyright 2026 Bloomway AI Inc.
- 直接移植 `previsWorldGen` / `previsWorldWater` / `previsInterior` / `previsRoom` / `previsWorldPlan` / `previsVehicles` / `world3dContent` / `world3dThemes`，必须在 `THIRD_PARTY_NOTICES.md` 增加来源声明，并保留 MIT 文本。
- M5 为独立实现，仅参考接口设计，不复制源码。
- 商标不随代码授权，不得暗示 Bloomway 背书。

---

## 17. 验收清单

### M1

- [ ] Hermite 采样单测通过，旧文档按 Hermite 解释
- [ ] `linear` 可显式回退且行为与旧版一致
- [ ] 无新增校验/提示/阻断

### M2

- [ ] 单/双/群体三种 framing 求解正确
- [ ] 双人都在画面内、不越轴、间距大时自动拉远
- [ ] 过肩/朝向/轴线规则正确
- [ ] 求解器零修改，只输出 notes
- [ ] 语义 ↔ 手工双向切换不丢数据

### M3

- [ ] 4 布局 / 4 风格 / 23 地标 / 4 水 / 3 天气
- [ ] 同 seed 确定
- [ ] 坐标往返通过
- [ ] 世界文件拆分/合并等价

### M4

- [ ] 舞台内清空
- [ ] 导出包含世界
- [ ] 关闭世界行为不变
- [ ] 性能达标

### M5

- [ ] 拖入/粘贴外部图 → 节点 + 连线
- [ ] 只消费第一张，可切换
- [ ] 室外/室内均可生成
- [ ] 类别表全局可编辑/导入/导出
- [ ] 置信度与降级可用

### M6

- [ ] 自测报告交付
- [ ] 文档同步
- [ ] 本地 E2E 通过

---

## 18. 后续

### 18.1 GLB 导入（可选）

- 只做「导入现成 GLB → 替换白膜对象」，不做生成 API。
- 复用 `StageObject.type='gltf'` 与 `assetPath`，约 1 个批次。
- 不碰 `OutputKind` / 资产节点。

### 18.2 多图/多视角

- 同一场景的正/反两张图 → 更准确的布局。
- 作为 M5 的 v2。

### 18.3 3DGS 参考层

- 可选叠加 3DGS 环境作为氛围参考，不参与机位/走位。
- 依赖外部服务，不作为默认。

### 18.4 物理 lint（可选）

- 如果未来发现镜头跳变影响视频模型生成，可加可选的开发者 lint。
- 默认关闭，不弹 UI。

---

## 附录 A：接口签名

```ts
// stage-timeline.ts
export type CameraTrackSmoothing = 'linear' | 'hermite'
export function sampleCameraTrack(
  camera: StageCamera,
  shot: Pick<StageShot, 'durationMs' | 'cameraTrack' | 'cameraSmoothing'>,
  timeMs: number
): SampledCamera

// stage-shot-intent.ts
export function solveStageShotIntent(
  doc: DirectorStageDoc,
  shot: StageShot,
  options?: { maxKeys?: number }
): StageShotSolveResult

// stage-world-types.ts
export function normalizePrevisWorldRef(raw: unknown): PrevisWorldRef
export function generatePrevisWorld(ref: PrevisWorldRef): PrevisWorld

// stage-world-coords.ts
export function previsToThree(x: number, y: number, h: number): [number, number, number]
export function threeToPrevis(x: number, y: number, z: number): [number, number, number]
export function stageToWorld(anchor: PrevisWorldStageAnchor, x: number, y: number): { x: number; y: number }
export function worldToStage(anchor: PrevisWorldStageAnchor, x: number, y: number): { x: number; y: number }

// scene-draft.ts
export function parseSceneDraft(raw: unknown): SceneDraft

// scene-calibrate.ts
export function calibrateScene(draft: SceneDraft, depth: DepthStats): CalibratedScene

// scene-object-presets.ts
export function loadObjectPresets(): ObjectPresetTable
export function mergeObjectPresets(base: ObjectPresetTable, user: unknown): ObjectPresetTable
```

## 附录 B：StageShot 完整示例

```jsonc
{
  "id": "shot_1",
  "cameraId": "cam_1",
  "durationMs": 6000,
  "aspect": "16:9",
  "cameraSmoothing": "hermite",
  "intent": {
    "version": 1,
    "keys": [
      {
        "timeMs": 0,
        "subjectIds": ["actor_a", "actor_b"],
        "framing": "two_shot",
        "relation": "front",
        "side": "left",
        "distance": "medium",
        "height": "eye",
        "aim": "face"
      },
      {
        "timeMs": 6000,
        "subjectIds": ["actor_a"],
        "framing": "single",
        "relation": "over_shoulder",
        "side": "left",
        "towardId": "actor_b",
        "distance": "close",
        "height": "eye",
        "aim": "face",
        "angleOffsetDeg": 30
      }
    ]
  }
}
```

## 附录 C：场景图 draft 示例

```jsonc
{
  "set": { "kind": "indoor", "description": "a small detective office at night" },
  "world": null,
  "room": { "type": "office", "widthM": 5.5, "depthM": 4.5, "heightM": 2.8 },
  "objects": [
    { "label": "desk", "sizeClass": "large", "relativeX": 0.5, "depthLayer": "mid", "facing": "toward_camera" },
    { "label": "chair", "sizeClass": "medium", "relativeX": 0.5, "depthLayer": "near", "facing": "away" },
    { "label": "window", "sizeClass": "large", "relativeX": 0.8, "depthLayer": "far", "facing": "toward_camera" }
  ],
  "camera": { "heightHint": "eye", "pitchHint": "level", "fovHintDeg": 50, "horizonY": 0.48 }
}
```

## 附录 D：Bloomway 源文件与行数

| 文件 | 行数 | 用途 |
|---|---|---|
| `previsPlanCore.ts` | 3,039 | 计划模型、镜头求解、采样（**不移植**，仅参考契约） |
| `previsWorldGen.ts` | 1,302 | 程序化城市 |
| `previsWorldWater.ts` | 186 | 水/桥/码头 |
| `previsInterior.ts` | 203 | 室内 |
| `previsRoom.ts` | 461 | 房间 |
| `previsWorldPlan.ts` | 624 | 世界计划 |
| `previsVehicles.ts` | 673 | 车辆 |
| `world3dContent.ts` | 1,559 | Three.js 世界渲染 |
| `world3dThemes.ts` | 426 | 主题 |

镜头求解器为独立实现，参考其数据契约，不复制 `previsPlanCore.ts`。


## 19. 实施进度

日期：2026-11-18

| 里程碑 | 状态 | 说明 |
|---|---|---|
| M1 Hermite | 已完成 | 默认 Hermite，linear 可回退；14 个测试通过 |
| M2 语义镜头 | 已完成 | subjectIds + framing，单/双/群体；求解器零修改；Inspector 面板；8 个测试通过 |
| M3 世界数据 | 已完成 | 7 个文件移植 + 坐标转换 + world 文件拆分；4 个测试通过 |
| M4 世界渲染/UI | 已完成 | 视口/导出渲染、世界设置面板、Agent 工具 |
| M5 场景图白膜 | 已完成 | scene:analyze、参考图生成、粘贴/拖入自动连线、类别表设置页、隐私提示 |
| M6 收尾 | 进行中 | 待补全量测试、文档同步、自测报告 |

已知环境问题：

- `src/main/media/__tests__/concat.test.ts` 在本机 Windows 环境因 ffmpeg concat 列表编码失败，与本次改动无关。
- 真实 VLM 调用需要用户配置 `text.chat` 模型，本次未做真实 API 手测。
