# 导演台白模预演升级方案

日期：2026-11-19
状态：已实施（批次 1–6 代码完成，含世界光照统一与 Agent 工具，待验收）
适用版本：当前主线（版本号由维护者控制）
最后核对：2026-11-19

> **调研方法说明**：本文所有「现状」以代码为准，文档只作设计意图。能力状态分三档标注：**已实现 / 部分实现 / 仅文档**。上一版对比中出现过「文档写了、代码没有」的误判，本版已按代码事实修正，后续调研同样遵守此约定。
>
> 背景：对 Toonflow v2.0.11「白模预演 TrumanMap」的代码级调研结论是——对方把预演做成了独立的影视预演工作台，CineLab 把预演做成了生成管线中的一环。本方案不追对方的资产库与 AI 建模，只补齐 CineLab 这一环上的断点：**整片能不能看、人能不能动、光对不对、交付物有没有**。
>
> 本文只描述设计与实施计划，不含代码改动。

---

## 1. 背景与判断

### 1.1 调研结论

Toonflow 的白模预演（`packages/nodes/trumanMap`，约 15 万行）具备：

- 约 7500 条程序化资产原型，64 套一键布景；
- 胶囊人 + 24 骨骼人物，27 个库动作 + 13 个手势；
- 自动分镜（单/双/群戏、不越轴、遮挡推近）与按对白分镜；
- 5 档氛围 + 13 层天气 + 真实日月；
- 整片预演小样、每镜片段、分镜图、四视图、鸟瞰、镜头表、EDL 八类导出；
- 私有草稿 → 观察截图 → 校验 → 采用的 AI 变更协议。

CineLab 的导演台（`src/shared/stage-*`、`src/renderer/src/stage/*`、`src/main/stage/*`）具备：

- 语义镜头求解（7 关系 / 3 距离 / 5 高度 / 3 构图）——已实现；
- 程序化 Previs 世界（4 布局 × 4 风格 × 3 时段 × 2 天气，种子可复现）——已实现；
- 场景图 → 白面片场景——部分实现（VLM 有，深度校准未接）；
- Hermite 相机插值——已实现；
- `StageCommand` 单一命令层，UI 与 Agent 同源——已实现；
- 单镜头白模预演导出（720p/1080p，24/30fps，ffmpeg）——已实现；
- 画布节点「下载素材」（`CineNodeView.exportCurrent` → `window.api.export.asset`）——已实现。

### 1.2 核心差距

| 差距 | 用户影响 | 本方案优先级 |
|---|---|---|
| 只能导出单镜，没有整片播放/导出 | 无法把整场戏连续看一遍 | P0 |
| 没有镜头重叠/优先级 | 无法做插入、覆盖、多机位择一 | P0 |
| `pose` 只入文档，渲染未消费 | 8 种姿势是空承诺 | P0 |
| 舞台对象与程序化世界两套光照 | 夜景世界 + 白天人物，导出穿帮 | P0 |
| 没有每镜片段 | 无法逐镜交给生成/剪辑 | P0 |
| 没有自动分镜/按对白分镜 | Agent 需逐镜写 intent，新手难起步 | P1 |
| 没有镜头表/分镜图批量导出 | 预演结果无法交给导演/剪辑审阅 | P1 |
| 人物只有静态姿势，没有常用动作 | 表演像木桩 | P1 |
| 场景图校准未接真实深度 | 比例可能失准 | P2 |
| `gltf` 类型是 wireframe 占位 | 误导用户与 Agent | P2 |

### 1.3 产品判断

CineLab 不应变成 Toonflow：

- **不做** 7500 条程序化资产库——CineLab 的定位是白模，不是影视布景库；
- **不做** Kiln 式 AI 代码建模——AST 沙箱与代码建模成本极高，与“盒子白模”定位冲突；
- **不做** 13 层粒子天气/真实日月——投入产出比低；
- **保留** 语义镜头、程序化世界、场景图反推、Agent 同源这四个独有优势；
- **不拆**「白模预演」与「导演台」两套功能——保持一套内核，入口可按需增加；
- **不设**「仅本地导出」分支——回画布即入项目 `assets/`，本地导出由画布节点「下载素材」承担。

---

## 2. 现状核对（代码事实）

| 能力 | 代码现状 | 状态 |
|---|---|---|
| 播放 | `StageWindow` 只播 `selectedShotId`，`playbackMs` 在单镜内循环 | 部分实现（单镜） |
| 导出 | `StageExportInput { stageId, shotId, resolution, fps }`；`exportStagePreview` 逐帧 `toDataURL` → ffmpeg | 部分实现（单镜） |
| 成片顺序 | `doc.shots` 为数组，无顺序/重叠/优先级语义 | 仅文档 |
| 镜头语义 | `StageShot.intent` + `solveStageShotIntent` | 已实现 |
| 光照 | `stage-render.ts` 固定 ambient 1.4 + directional 1.8；`world-content.ts` 另有 `TIME_LOOK` | 部分实现（两套光照） |
| 人物 | `stage-scene.createHuman` 固定胶囊 + 球；`pose` 未消费 | 部分实现（姿势未生效） |
| gltf | `stage-scene` 对 gltf 走 `createHuman` + wireframe | 仅文档（占位） |
| 交付物 | 只有视频节点；截图是单帧 | 部分实现 |
| 场景图校准 | `scene-analyze` 只调 VLM；`calibrateScene` 的 `depth` 默认为空 | 部分实现（深度未接） |
| 画布分组 | `GroupNode` 支持 `normal` / `storyboard`，无嵌套；storyboard 上限 25 节点 | 已实现 |
| 节点下载 | 节点工具栏「下载素材」→ `window.api.export.asset` | 已实现 |
| 测试 | `stage-commands / stage-preview / stage-shot-intent / stage-timeline / previs-*` | 已实现（纯函数层） |

> 以上是代码核对结果，与部分文档描述存在差距。本方案实施时同步修正文档，不把未实现能力写成已实现。

---

## 3. 目标与非目标

### 3.1 目标

1. **整片可看**：镜头排序、重叠/优先级、复用、总时长、整片播放、整片导出。
2. **交付可用**：整片视频、每镜片段、每镜首/中/尾分镜图、场景鸟瞰、镜头表（CSV/HTML/Markdown）、分镜脚本，全部回画布并自动成组。
3. **光照一致**：舞台对象与程序化世界共用一套光照解析；10 个氛围预设 + 可调参数 + 补光。
4. **人物能动**：13 关节轻量骨架；8 个静态姿势 + 6 个常用动作；动作原地循环、按位移速度调速率。
5. **分镜可自动**：基于语义镜头求解器，一键出全景/中景/近景、双人正反打、群戏；可重复生成，不污染手工镜头。
6. **对白可切镜**：解析「角色：台词」，按句/标点切镜、配字幕。
7. **回画布即交付**：不设「仅本地」分支；`ingestAsset` 入项目 `assets/`，本地导出交给节点「下载素材」。

### 3.2 非目标

- 不做程序化资产库扩容（保持盒子/球/平面/胶囊）。
- 不做 AI 代码建模。
- 不做真实骨骼动作捕捉/外部动画库。
- 不做 13 层粒子天气/真实日月；只做 10 个氛围预设 + 雨/雪粒子。
- 不做四视图/EDL（后续按需）。
- 不做 glTF 加载（本期标灰提示，P2 再评估）。
- 不拆「白模预演」与「导演台」两套功能。
- 不做叠化/画中画；重叠只做覆盖剪辑。
- 不做镜头 in/out 裁切（预留字段，不实现）。

---

## 4. 总体设计

### 4.1 数据模型扩展（全部可选，向后兼容）

```ts
// src/shared/stage-schema.ts

/** 成片编排的一条 entry；shotId 可重复，表示复用同一镜头 */
export interface StageProgramEntry {
  shotId: string
  /** 成片时间轴起点（ms）；缺省接在上一条之后 */
  startMs?: number
  /** 重叠时播哪条；越大越优先，默认 0 */
  front?: number
}

export interface StageProgram {
  version: 1
  entries: StageProgramEntry[]
}

export interface StageShot {
  // ...现有字段
  /** 台词/画面说明，导出时作字幕与镜头表备注 */
  caption?: string
  /** 来源：手工或自动分镜；自动分镜可被整体重生成 */
  source?: 'manual' | 'auto'
}

export interface StageCamera {
  // ...现有字段
  /** 来源：手工或自动分镜 */
  source?: 'manual' | 'auto'
}

export interface DirectorStageDoc {
  // ...现有字段
  /** 成片编排；缺省时按 doc.shots 顺序串行 */
  program?: StageProgram
  /** 手调光照；缺省按 world/timeOfDay 推导 */
  lighting?: StageLightingOverride
  /** 人物动作库版本；缺省按当前默认 */
  motionsVersion?: 1
}
```

规则：

- `doc.shots` 是**素材库**，`program.entries` 是**唯一成片编排**；时间轴排序只改 entries，不改 shots。
- `entries` 的 `shotId` **可重复**（复用）；校验只要求 shot 存在。
- `startMs` 缺省时接上一条的 `endMs`；`cursor = max(cursor, endMs)`，保证缺省起点不倒退。
- `endMs = startMs + shot.durationMs`。
- 重叠时 `front` 最大者生效；`front` 相同则 entries 中靠后者生效。
- 未覆盖时间段为黑场（导出保留，便于剪辑）。
- `program` 缺省时按 `doc.shots` 顺序串行，旧文档零迁移。
- 删除 shot 时级联删除对应 entries，并提示“同时从成片移除 N 处”。
- 同一 shot 多次出现时，每镜片段只导一次（见 4.4），镜头表标注“复用第 N 镜”。

### 4.2 新增纯函数层

全部放在 `src/shared/`，不依赖 DOM/Electron，可单测。

```
src/shared/
  stage-program.ts           buildProgramTimeline / programAt / formatTimecode
  stage-auto-coverage.ts     buildAutoCoverage
  stage-dialogue.ts          parseDialogue / buildDialogueCoverage
  stage-shot-list.ts         buildShotList / shotListToCsv / shotListToMarkdown
  stage-lighting.ts          resolveStageLighting
  stage-lighting-presets.ts  STAGE_LIGHTING_PRESETS / applyLightingPreset
  stage-motions.ts           STAGE_MOTIONS / sampleStageMotion
```

#### 4.2.1 `stage-program.ts`

```ts
export interface ProgramSegment {
  shotId: string
  startMs: number
  endMs: number
  shotTimeMs: number   // 该镜内部时间
  index: number        // 素材镜号，从 1 开始
  programIndex: number // 成片镜号；未播时为 0
  front: number
  entryIndex: number
}

export interface ProgramTimeline {
  segments: ProgramSegment[]
  /** 从 1 开始、只含实际生效的镜号 */
  programShots: number[]
  durationMs: number
}

export function buildProgramTimeline(
  doc: Pick<DirectorStageDoc, 'shots' | 'program'>
): ProgramTimeline

export function programAt(
  timeline: ProgramTimeline,
  timeMs: number
): ProgramSegment | undefined

export function formatTimecode(ms: number, fps: number): string // 00:00:00:00
```

规则：

- 遍历 `entries`，解析 `startMs`（缺省接 `cursor`），计算 `endMs`；
- `cursor = max(cursor, endMs)`；`durationMs = max(endMs)`；
- `programAt` 过滤 `startMs <= t < endMs`，取 `front` 最大者；相同 `front` 取 `entryIndex` 最大者；
- 无匹配返回 `undefined`（黑场）；
- `entries` 不存在时退化为 `doc.shots` 串行；
- 无效 `shotId`（不存在）忽略并记录在 `notes`；
- `programShots` 按实际生效顺序去重，用于“成片镜号”列。

#### 4.2.2 `stage-auto-coverage.ts`

```ts
export interface AutoCoverageOptions {
  subjectIds: string[]
  mode?: 'auto' | 'single' | 'dialogue' | 'group'
  pace?: number          // 0.6 快 / 1 标准 / 1.6 舒缓
  maxShots?: number
  replace?: boolean      // 覆盖已有 source='auto' 的镜头
}

export interface AutoCoveragePlan {
  cameras: StageCamera[]
  shots: StageShot[]      // 已含 intent + 求解后的 cameraTrack，source='auto'
  notes: string[]
}

export function buildAutoCoverage(
  doc: DirectorStageDoc,
  options: AutoCoverageOptions
): AutoCoveragePlan
```

分镜规则（复用 `solveStageShotIntent`）：

| 模式 | 条件 | 镜头 |
|---|---|---|
| single | 1 人 | 全景（front/far/eye）→ 中景（front_side/medium/eye）→ 近景（front_side/close/face） |
| dialogue | 2 人 | 双人全景（two_shot/front/far）→ 过肩 A 看 B → 过肩 B 看 A |
| group | 3–8 人 | 群体全景（group/front/far）→ 每人一个近景轮切 |
| auto | 按 subjectIds 数量分流 | 同上 |

时长与命名：

- 默认 4 秒/镜 × `pace`，夹在 2–8 秒；
- 镜头数超过 `maxShots`（默认 12）时合并近景；
- 相机命名 `分镜·全景/中景/近景/过肩A/过肩B`；
- 不新写几何算法，只构造 `StageShotIntent` 再调用现有求解器；
- `source='auto'`，`replace` 只删 `source='auto'` 的镜头和相机；手工镜头永不删除。

#### 4.2.3 `stage-dialogue.ts`

```ts
export interface DialogueLine { speaker: string; text: string }

export function parseDialogue(script: string): DialogueLine[]
export function buildDialogueCoverage(
  doc: DirectorStageDoc,
  lines: DialogueLine[],
  options: { pace?: number }
): AutoCoveragePlan
```

规则：

- 支持「角色：台词」「【角色】台词」；
- 角色名与 `doc.objects[].name` 精确/包含匹配；找不到时返回 notes，不擅自新建人物；
- 单句按标点（。！？；）切分，单镜不超过 8 秒；无标点按字数硬切；
- 每句时长 `max(1.5, 0.8 + 字数 × 0.12)`，夹在 1.5–12 秒；
- 两人正反打、多人「全景 + 说话人近景」；
- 台词写入 `shot.caption`。

#### 4.2.4 `stage-shot-list.ts`

```ts
export interface StageShotRow {
  number: number        // 素材镜号
  programNumber: number // 成片镜号；未播为 0
  shotId: string
  startMs: number
  endMs: number
  durationMs: number
  cameraName: string
  framing: string       // single/two_shot/group
  shotSize: string      // 近景/中景/全景（由 intent.distance 映射）
  angle: string         // 平视/俯拍/仰拍/过肩（由 height/relation 映射）
  movement: string      // 固定/推/拉/摇/移/跟（由 cameraTrack 首尾差估算）
  subjects: string[]
  caption: string
  note: string          // 复用/未播/被覆盖等标注
}
```

回退规则：

- 无 `intent` 的旧镜头：`shotSize` 由 FOV 估算（≤30° 近景、≤60° 中景、其余全景）；
- `angle` 由相机与目标的高差估算；
- 输出 CSV（UTF-8 BOM，Excel 可开）与 Markdown；HTML 版由主进程拼每镜首/中/尾三张截图。

#### 4.2.5 `stage-lighting.ts`

```ts
export interface StageLighting {
  background: string
  ambient: { color: string; intensity: number }
  hemi?: { sky: string; ground: string; intensity: number }
  sun: { color: string; intensity: number; position: [number, number, number] }
  /** 补光：霓虹/室内冷暖的第二光源 */
  fill?: { color: string; intensity: number; position: [number, number, number] }
  fog?: { color: string; near: number; far: number }
  exposure: number
}

export function resolveStageLighting(
  doc: Pick<DirectorStageDoc, 'world' | 'lighting'>
): StageLighting
```

- 把 `world-content.ts` 的 `TIME_LOOK` 抽成纯数据；
- `stage-render.ts` 与 `StageViewport.tsx` 都调用它，只此一处真相；
- `doc.lighting` 存在时逐字段覆盖；
- 统一使用 ACES Filmic 色调映射，曝光参数才有意义；
- 阶段一不加阴影；阶段二在 `stage-render` 开 `PCFSoftShadowMap`（导出质量优先），视口保持关闭以保帧率。

#### 4.2.6 `stage-lighting-presets.ts`

```ts
export interface StageLightingPreset {
  id: string
  name: string
  lighting: StageLighting
  weather?: 'clear' | 'rain' | 'snow'
  timeOfDay?: 'day' | 'dusk' | 'night'
  note: string
}

export const STAGE_LIGHTING_PRESETS: StageLightingPreset[]

export function applyLightingPreset(
  doc: Pick<DirectorStageDoc, 'world' | 'lighting'>,
  presetId: string
): Pick<DirectorStageDoc, 'lighting' | 'world'>
```

10 个预设：

| 预设 | 参数要点 |
|---|---|
| 日戏 | 10:00、中性白光、环境补光 |
| 正午 | 12:00、硬光、高对比 |
| 黄昏 | 18:10、暖橙、低角度 |
| 夜戏 | 21:00、冷蓝月光、提高曝光 |
| 阴天 | 柔光、低对比、灰调 |
| 雨天 | 低照度、冷调、湿反光 |
| 雪天 | 高反射、冷白、低饱和 |
| 室内暖光 | 钨丝灯色温、暖黄 |
| 室内冷光 | 日光灯色温、青白 |
| 霓虹夜景 | 洋红/青双色、高饱和（用 fill 实现） |

约束：

- 预设可写 `doc.lighting`，也可写 `doc.world.timeOfDay/weather`；
- **改 `world` 只改时段/天气参数，不重新生成世界、不移动已摆物体**；
- 粒子天气只保留雨、雪（世界已有实现），不做冰雹/沙尘/极光；
- 可调参数：太阳方位/高度/强度/色温、环境光、半球光、补光、曝光、雾。

#### 4.2.7 `stage-motions.ts`

```ts
export type StageBone =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'leftUpperArm' | 'leftForeArm' | 'rightUpperArm' | 'rightForeArm'
  | 'leftThigh' | 'leftShin' | 'rightThigh' | 'rightShin'

export interface MotionFrame {
  timeMs: number
  rotations: Partial<Record<StageBone, [number, number, number]>>
  hipsOffset?: [number, number, number]
}

export interface StageMotion {
  name: string
  durationMs: number
  loop: boolean
  /** 动作设计速度（米/秒），用于和实际位移匹配 */
  designSpeed?: number
  frames: MotionFrame[]
}

export const STAGE_MOTIONS: Record<StagePoseName, StageMotion>
export function sampleStageMotion(name: StagePoseName, timeMs: number): MotionFrame
export function motionRateForSpeed(name: StagePoseName, metersPerSecond: number): number
```

动作清单：

**P0 静态姿势（8 个）**：站立、坐、跪、蹲、倒地、抱臂、挥手、指。

**P1 常用动作（6 个）**：走、跑、坐下、起身、鞠躬、点头/摇头。

**P2 后续**：推、拾取、交谈、翻滚。

旧名映射：

- `reach` → `point`
- `confront` → `armsCrossed`
- `lookBack` → 保留，作为 `stand` + 头部/胸部旋转 150–180° 的变体

动作与位移：

- 动作**原地循环**，位移全部由 `ActionTrack` 控制；
- `motionRate = clamp(designSpeed / actualSpeed, 0.5, 2)`，可由用户手动覆盖；
- 动作之间**硬切**，不做混合（P2 再做）。

### 4.3 整片播放

`stageStore` 新增：

```ts
playbackScope: 'shot' | 'program'
programMs: number
setPlaybackScope(scope: 'shot' | 'program'): void
seekProgram(ms: number): void
```

播放循环（`StageWindow`）：

- `scope='shot'`：保持现状；
- `scope='program'`：`programMs` 递增到 `timeline.durationMs` 后回到 0；
- 通过 `programAt` 得到当前生效 shot 与 `shotTimeMs`；
- 重叠段切换由 `front` 决定，UI 在成片行显示叠层计数；
- 黑场时显示黑场，不隐藏播放头。

`StageViewport` 取相机时改为：

```ts
const view = playbackScope === 'program'
  ? programAt(timeline, programMs)
  : selectedShot && { shot: selectedShot, shotTimeMs: playbackMs }
```

整片播放不复制相机逻辑，只换“当前 shot”的来源。

### 4.4 整片与每镜导出

#### 4.4.1 输出模型

**只回画布，不设「仅本地」分支。**

- 勾选的产物在导出后 `ingestAsset`，写入项目 `assets/img|vid|aud|txt/`，并在画布建节点；
- 不勾选的产物不生成；
- 本地导出由画布节点工具栏「下载素材」承担（`window.api.export.asset`）；
- `exports/previs/<时间戳>/` 仅作渲染中间目录：成功后清理，失败/取消保留便于排查。

#### 4.4.2 IPC 扩展

```ts
// src/shared/ipc-contract.ts

export type StageExportScope = 'shot' | 'program'

export interface StageExportItems {
  previs: boolean     // 整片视频
  clips: boolean      // 每镜片段
  frames: boolean     // 每镜首/中/尾分镜图
  overview: boolean   // 场景鸟瞰
  shotList: boolean   // 镜头表
  script: boolean     // 分镜脚本
}

export type StageFrameDensity = 'three' | 'first-only'

export interface StageExportInput {
  stageId: string
  scope: StageExportScope
  /** scope='shot' 必填；scope='program' 忽略 */
  shotId?: string
  resolution: '720p' | '1080p'
  fps: 24 | 30
  items?: Partial<StageExportItems>
  /** 分镜图密度：每镜三张（默认）或仅首帧 */
  frameDensity?: StageFrameDensity
}

export interface StageExportProgress {
  stageId: string
  shotId?: string
  phase: 'rendering' | 'encoding' | 'clips' | 'frames' | 'shot-list' | 'done'
  frame: number
  total: number
  clipIndex?: number
  clipTotal?: number
}

export interface StageExportResult {
  /** 主视频（整片或单镜） */
  asset: GeneratedAsset
  path: string
  /** 每镜片段；同一 shot 只导一次 */
  clips?: { shotId: string; index: number; asset: GeneratedAsset; path: string }[]
  /** 每镜分镜图（首/中/尾）与鸟瞰 */
  frames?: { shotId: string; label: string; asset: GeneratedAsset; path: string }[]
  /** 镜头表/脚本 */
  extras?: { kind: 'text'; asset?: GeneratedAsset; path?: string; label: string }[]
  /** 取消时保留的已完成产物 */
  partial?: boolean
}
```

兼容性：

- `shotId` 变可选、`scope` 新增；
- 旧调用方传 `shotId` 仍走单镜；
- `scope` 缺省按 `'shot'` 解释；
- `items` 缺省：`previs/clips/frames/shotList = true`，`overview/script = false`；
- `frameDensity` 缺省 `'three'`。

#### 4.4.3 渲染页扩展（`stage-render.ts`）

```ts
window.__setStageProgram = (input: {
  doc: DirectorStageDoc
  width: number
  height: number
}) => boolean

window.__renderProgramFrame = (
  globalTimeMs: number,
  overlay?: { caption?: string; shotNumber?: number; timecode?: string; totalShots?: number }
) => string
```

- 构建场景只做一次；
- 每帧：`programAt` → 生效 shot → `sampleCameraTrack` → 渲染；
- overlay 用 2D canvas 叠加：左上「第 N 镜 · 景别 · 焦段」，右上时间码，底部台词；
- 返回 `image/jpeg` dataURL（质量 0.92）。

#### 4.4.4 导出器（`src/main/stage/export.ts`）

新增：

```ts
export async function exportStageProgram(
  projectRoot: string,
  input: StageExportInput,
  onProgress: (p: StageExportProgress) => void
): Promise<StageExportResult>
```

流程：

1. 加载 doc，`buildProgramTimeline`；
2. 若无镜头 → 报错；
3. 计算 `total = ceil(durationMs / 1000 * fps)`；
4. 隐藏窗口加载 `stage-render.html`，`__setStageProgram`；
5. 开整片 ffmpeg（`libx264 / crf 18 / yuv420p / faststart`）；
6. 逐帧渲染，同时写整片 + 当前镜：
   - 当前生效 shot 变化时，关闭上一个镜头编码器、打开下一个；
   - 任意时刻只有 2 个编码进程（整片 + 当前镜），不随镜头数增长；
   - 同一 shot 复用时，片段只录第一次出现的时段，后续复用不再开编码器；
   - 黑场时只写整片，当前镜结束；
7. 每 10 帧上报进度，支持取消（销毁窗口 + 杀掉所有 ffmpeg）；
8. `items.frames`：按 `frameDensity` 在镜头首/中/尾各渲染一张，存 `exports/frames/第N镜-首|中|尾.jpg`；
9. `items.shotList`：`buildShotList` → CSV/Markdown/HTML（HTML 内嵌三张截图）；
10. `items.overview`：从第一镜机位侧斜俯拍场景中心，渲染一张；
11. 产物 `ingestAsset`；中间目录成功后清理，失败/取消保留；
12. 返回 `StageExportResult`。

时长与并发：

- 成片 > 5 分钟弹确认；
- > 10 分钟要求降分辨率或缩小范围；
- 硬上限 30 分钟；
- 全局单导出锁，第二次导出提示“已有导出进行中”。

#### 4.4.5 回画布（`preview-runner.ts`）

```ts
export async function exportStageToCanvas(input: {
  stageNodeId: string
  stageId: string
  scope: 'shot' | 'program'
  shotId?: string
  resolution: '720p' | '1080p'
  fps: 24 | 30
  items?: Partial<StageExportItems>
  frameDensity?: StageFrameDensity
  turnId?: string
}): Promise<StagePreviewExportResult>
```

规则：

- 每次导出**新建节点**（资产按 hash 去重，磁盘不膨胀）；
- 产物全部回画布，不提供“仅本地”；
- 全部走 `beginToolTurn/endToolTurn`，保证一轮一条撤销；
- 超过 20 镜时弹确认：全部 / 仅分镜图 / 仅整片；默认“仅分镜图”；
- 完成后 toast + “查看”按钮，点击定位到新建组，不自动移动当前视口。

### 4.5 回画布布局与自动成组

`GroupNode` 不支持嵌套，只有 `normal` / `storyboard` 两种模式；本方案用 `normal`。

#### 4.5.1 整场组

- 标题：`整场 · <场景名>`；
- 内容：整片视频、镜头表文本、分镜脚本文本、场景鸟瞰（按勾选）；
- 位置：导演台节点右侧第一列，最上方；
- 颜色：`slate`。

#### 4.5.2 每镜组

- 每镜一个组，标题 `第01镜 · 中景`；未播标注 `（未播）`；
- 组内**横排**：`[片段, 首, 中, 尾]`；未勾选片段时 `[首, 中, 尾]`；`frameDensity='first-only'` 时 `[片段, 首]`；
- 组颜色按镜号循环 `GROUP_COLORS`；
- 多组**竖排**：每组一行，从上到下，组间距 48px；
- 起始位置：整场组下方。

> 代价：30 镜会有 30 个横向组纵向排列，画布纵向很长。这是 Q33 A / Q36 B 的显式选择，换取“组内一眼看全一镜”的可读性。

#### 4.5.3 组内布局

- 片段节点宽 480；
- 分镜图节点宽 240；
- 组内横向间距 24px，组内边距 24px；
- 组宽 = 节点宽度之和 + 间距 + 两侧 padding；
- 组高 = 最高节点 + 标题栏 36px + 上下 padding。

### 4.6 交付物

| 交付物 | 形式 | 回画布 |
|---|---|---|
| 整片预演 | MP4（含镜号/时间码/字幕） | 整场组，视频节点 |
| 每镜片段 | MP4（干净画面，不带字幕；同一 shot 只一份） | 每镜组，视频节点 |
| 每镜分镜图 | JPEG × 3（首/中/尾）或 × 1（仅首帧） | 每镜组，图片节点横排 |
| 场景鸟瞰 | JPEG | 整场组 |
| 镜头表 | CSV + Markdown + HTML（内嵌三张截图） | 整场组，文本节点 |
| 分镜脚本 | Markdown | 整场组，文本节点 |
| 单镜预演 | MP4（现状） | 单独视频节点，不建组 |

### 4.7 光照统一与预设

改动：

1. `world-content.ts` 的 `TIME_LOOK` 抽到 `src/shared/stage-lighting.ts`；
2. `stage-render.ts` 与 `StageViewport.tsx` 都调用 `resolveStageLighting`；
3. 抽 `buildStageScene(doc, lighting)` 共用场景构建；
4. 统一 ACES Filmic 色调映射；
5. `stage-render` 开阴影，视口保持关闭；
6. 检查器新增「光照」小节：10 个预设下拉 + 太阳方位/高度/强度/色温、环境光、半球光、补光、曝光、雾；
7. 预设写入 `doc.lighting` 或 `doc.world`；导出前冲突以 `doc.lighting` 为准并提示；
8. 改 `world` 只改时段/天气参数，不重新生成世界、不移动已摆物体。

### 4.8 人物姿势与动作

#### 4.8.1 轻量骨架

新增 `src/renderer/src/stage/stage-figure.ts`：

```ts
export type StagePoseName =
  | 'stand' | 'sit' | 'kneel' | 'crouch' | 'fallen'
  | 'armsCrossed' | 'wave' | 'point'
  | 'walk' | 'run' | 'sitDown' | 'standUp' | 'bow' | 'nod'
  | 'reach' | 'confront' | 'lookBack'   // 旧名兼容

export function createStageFigure(color: string, pose?: StagePoseName): THREE.Group
export function applyStageFigurePose(group: THREE.Group, pose: StagePoseName, timeMs: number): void
```

实现要点：

- 13 关节：hips / spine / chest / neck / head / 左右上臂 / 左右前臂 / 左右大腿 / 左右小腿；
- 用胶囊 + 球拼装，按关节旋转驱动；
- `stand/sit/kneel/crouch/fallen/armsCrossed/wave/point` 是单帧静态姿势；
- `walk/run/sitDown/standUp/bow/nod` 是 1–2 秒循环/单次关键帧；
- 旧名映射：`reach→point`、`confront→armsCrossed`、`lookBack` 保留为 `stand` 变体；
- 动作原地循环，位移由 `ActionTrack` 控制；
- `motionRate` 按位移速度自动缩放，可手动覆盖；
- `crowd` 内每个个体按 `stand` 生成，随机朝向，不参与动作动画；
- pose 变化时只重建该对象，不重建整场。

#### 4.8.2 动作数据

`src/shared/stage-motions.ts` 提供纯数据与采样；`stage-figure` 消费。动作数据不依赖外部动画库，全部程序化关键帧。

### 4.9 自动分镜

命令：

```ts
| { type: 'replaceCoverage'; cameras: StageCamera[]; shots: StageShot[]; mode: 'append' | 'replace' }
```

Store action：

```ts
autoCoverage: (options: AutoCoverageOptions) => boolean
```

规则：

- `replace=true` 只删除 `source='auto'` 的镜头与相机；手工镜头保留；
- 自动生成的镜头/相机 `source='auto'`；
- 生成后自动切到 program 播放；
- 重复生成不叠加旧自动镜头。

UI：

- StageTimeline 工具栏「自动分镜」：取当前选中对象；无选中时取 `doc.objects` 前 1–2 个 `human`；
- 弹出模式/节奏小面板。

Agent 工具（`src/main/agent/tools/stage.ts`）：

```ts
{
  id: 'stage.autoCoverage',
  name: 'stage_auto_coverage',
  description: '按主体自动排一组分镜镜头（全景/中景/近景、双人正反打、群戏），生成语义镜头并求解相机轨道；只覆盖自动生成的镜头。',
  profiles: ['canvas', 'stage'],
  readOnly: false,
  scope: 'stage',
  modes: ['current', 'full-access'],
  parameters: {
    type: 'object',
    properties: {
      nodeId: stageNodeIdParameter,
      subjectIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
      mode: { type: 'string', enum: ['auto', 'single', 'dialogue', 'group'] },
      pace: { type: 'number', minimum: 0.6, maximum: 1.6 },
      replace: { type: 'boolean' }
    },
    required: ['nodeId', 'subjectIds'],
    additionalProperties: false
  },
  replay: 'safe'
}
```

### 4.10 按对白分镜

同结构，参数加 `script`，工具名 `stage_dialogue_coverage`；沿用 4.2.3 的解析、切分与时长规则。

### 4.11 glTF 类型处理

`gltf` 是 CineLab 预留的对象类型，本意是加载外部 glTF/GLB 模型作为布景/道具/角色。当前实现是 wireframe 人形占位，未接 `GLTFLoader`，也未读取 `assetPath`。

本期决定：

- **不接加载**；
- 检查器中对 `gltf` 类型标灰，提示「暂未接入 glTF 加载」；
- Agent 工具说明中注明该类型不可用，避免虚构；
- P2 再评估：`GLTFLoader` + `assetPath` 校验 + 包围盒归一化 + 白模材质替换。

理由：与「盒子白模」定位一致，避免资产管线、许可、性能、尺寸校准的额外成本。

### 4.12 白模预演与导演台的关系

结论：**一套内核，不拆两个功能。**

- 保持一套 `StageDoc`、一套渲染、一套导出；
- 可选增加首页/项目级入口，打开同一个 `StageWindow`，直接选 `stages/<id>.json`；
- 本期不做首页入口，等整片/交付物稳定后再评估；
- Toonflow 的「首页 + 画布节点」是两个入口共用一套插件代码；CineLab 保持同样思路即可，不需要两套实现。

### 4.13 按钮与文案

| 位置 | 文案 |
|---|---|
| 顶栏主按钮 | **生成到画布** |
| 导出面板标题 | 预演生成 |
| 面板确认按钮 | 生成 |
| 面板分组 | 视频 / 图片 / 文本 |
| 快捷入口 | 快速生成分镜图 |
| Agent 工具 | 保留 `stage_export_preview` 名称，描述改为“生成并回画布” |

---

## 5. 实施阶段

| 批次 | 内容 | 主要文件 | 验收 |
|---|---|---|---|
| **批次 1（M1）** 整片数据与播放 | `StageProgramEntry`、重叠/优先级、复用、`buildProgramTimeline`、`programAt`、`reorderShots`、播放切换 | `stage-schema.ts`、新增 `stage-program.ts`、`stage-commands.ts`、`stageStore.ts`、`StageWindow.tsx`、`StageViewport.tsx`、`StageTimeline.tsx` | 3 镜可连续播放；重叠段按 `front` 切换；同一 shot 复用可播；旧文档按数组顺序播放 |
| **批次 2（M2）** 整片 + 每镜导出 | IPC 扩展、`exportStageProgram`、渲染页整片接口、双写每镜片段、进度/取消、回画布 | `ipc-contract.ts`、`main/stage/export.ts`、`stage-render.ts`、`preview-runner.ts`、`StageWindow.tsx` | 3 镜 × 4s、720p24 导出成功；整片 12s + 3 个片段；取消无残留；成功清理中间目录 |
| **批次 3（M3）** 交付物 | `stage-shot-list.ts`、每镜首/中/尾、鸟瞰、CSV/Markdown/HTML、整场组/每镜组布局 | `main/stage/export.ts`、新增 `stage-shot-list.ts`、`preview-runner.ts`、`canvas` 分组 | 1 整场组 + N 每镜组；组内横排、多组竖排；CSV/HTML 可打开；未播/复用标注正确 |
| **批次 4（M4）** 光照与人物 | `stage-lighting.ts`、`stage-lighting-presets.ts`、`stage-motions.ts`、`stage-figure.ts`、13 关节骨架、10 预设、8 姿势 + 6 动作 | 新增三个 shared 文件、`stage-figure.ts`；改 `stage-scene.ts`、`stage-render.ts`、`StageViewport.tsx`、`StageInspector.tsx` | 夜景世界人物变冷光；10 预设可切换；8 姿势 + 6 动作在视口与导出中生效 |
| **批次 5（M5）** 自动分镜 | `stage-auto-coverage.ts`、`replaceCoverage`、`source` 字段、UI 按钮、Agent 工具 | 新增 `stage-auto-coverage.ts`；改 `stage-commands.ts`、`stageStore.ts`、`StageTimeline.tsx`、`main/agent/tools/stage.ts` | 单人 3 镜；双人正反打；群戏；重复生成不污染手工镜头 |
| **批次 6（M6）** 按对白 + 文档 | `stage-dialogue.ts`、字幕 overlay、工具、文档同步、gltf 标灰 | 新增 `stage-dialogue.ts`；改 `stage-render.ts`、`stage.ts`、`docs/*` | 「A：… / B：…」生成正反打；长句按标点切；导出带字幕；文档与实现一致 |

依赖关系：

- 批次 1 → 2 → 3 是导出链；
- 批次 4 可并行；
- 批次 5 依赖批次 1 的整片播放体验，但不依赖导出；
- 批次 6 依赖批次 5 的自动分镜基础设施。

> 版本号由维护者控制，本方案只按批次推进，不绑定具体版本。

---

## 6. 测试计划

新增纯函数测试（Vitest）：

```ts
// src/shared/__tests__/stage-program.test.ts
- 空镜头 → duration 0
- 3 镜串行 → segments 边界正确
- 重叠 + front → 生效镜头正确
- front 相同 → 后者优先
- 同一 shot 复用 → programShots 去重、镜号正确
- startMs 缺省/越界/无效 shotId → 回退规则
- programAt 边界：0、段首、段尾、重叠区、末尾之后、黑场

// stage-auto-coverage.test.ts
- 单人 → 3 镜，framing 正确
- 双人 → 3 镜，过肩 towardId 正确
- 8 人 → 全被框住
- replace 只删 source='auto'，手工镜头保留

// stage-dialogue.test.ts
- 两种台词格式
- 角色名匹配/不匹配
- 长句按标点切分，单镜 ≤8s
- 台词时长下限/上限

// stage-shot-list.test.ts
- 有 intent / 无 intent 的字段回退
- 复用/未播标注
- 素材镜号与成片镜号
- CSV 转义（逗号、引号、换行）

// stage-lighting.test.ts
- 无 world → 默认光照
- night + rain → 颜色/强度符合预设
- doc.lighting 覆盖
- 10 预设逐项快照

// stage-motions.test.ts
- 8 姿势 + 6 动作关键帧时间严格递增
- 循环动作首尾衔接
- 旧姿势名映射
- motionRate 边界 0.5–2
```

回归：

- 现有 `stage-commands / stage-preview / stage-shot-intent / stage-timeline / previs-*` 全绿；
- `corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm check:docs` 通过。

手动验收：

1. 旧项目打开 → 播放/导出行为不变；
2. 整片导出取消 → 无 ffmpeg 残留、无半成品资产；
3. 720p/1080p、24/30fps 各一次；
4. 重叠段切换正确；同一 shot 复用正确；
5. 场景图 → 白模 → 自动分镜 → 整片 + 每镜导出 → 回画布成组全链路一次。

---

## 7. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 整片导出慢（300s × 24fps = 7200 帧，逐帧 `executeJavaScript`） | 导出 10 分钟级 | 进度 + 取消；默认 720p；>5 分钟确认、>10 分钟警告、30 分钟硬上限；后续可改 `toBlob` 批量传输 |
| 每镜片段双写增加编码负载 | 导出更慢 | 任意时刻只有 2 个 ffmpeg 进程；同一 shot 只录一次；片段可选 |
| 每镜 3 张分镜图渲染时间 ×3 | 导出更慢 | 提供 `frameDensity='first-only'`；默认三张但可在面板切换 |
| 多组竖排导致画布纵向过长 | 30 镜组很长 | 显式选择换取可读性；超过 20 镜弹确认，可选“仅分镜图/仅整片” |
| 渲染页与视口两套场景构建 | 导出画面与预览不一致 | 抽 `buildStageScene(doc, lighting)` 共用；批次 4 强制统一 |
| 旧镜头无 intent | 镜头表字段为空 | FOV/高差回退；UI 标注“自动估算” |
| 13 关节骨架性能 | 群演场景掉帧 | crowd 不参与动作；pose 变化只重建单对象 |
| 重叠优先级理解成本 | 用户误播 | 成片行显示叠层计数；点击选择播哪条；镜头表标注 |
| `StageExportInput` 变更影响旧调用 | 编译失败/行为变化 | `scope` 默认 `'shot'`，`shotId` 仍可选；旧调用零改动 |
| 自动分镜结果不符合预期 | 用户不信任 | 生成后用 `notes` 说明；支持一键重生成；`source='auto'` 保证不污染手工镜头 |

---

## 8. 与 Toonflow 的差距覆盖

| Toonflow 能力 | 本方案 | 说明 |
|---|---|---|
| 整片预演小样 | 覆盖（批次 2） | 含镜号/时间码/字幕 |
| 每镜白模片段 | 覆盖（批次 2） | 一次渲染双写，干净画面；同一 shot 只一份 |
| 分镜图/四视图/鸟瞰 | 部分（批次 3：鸟瞰 + 首/中/尾） | 四视图不做 |
| 镜头表/CSV/EDL | 部分（批次 3：CSV/HTML） | EDL 后续可加 |
| 自动分镜/按对白 | 覆盖（批次 5/6） | 基于语义镜头，非 Toonflow 算法 |
| 天气/光照 | 部分（批次 4：10 预设 + 雨/雪） | 不做 13 层粒子/真实日月 |
| 人物动作库 | 部分（8 姿势 + 6 动作） | 不做 24 骨骼/27 动作库 |
| 7500 资产库 | 不做 | 保持盒子白模 |
| AI 建模/Kiln | 不做 | 与定位冲突 |
| 双入口 | 保留扩展点 | 一套内核，本期不做首页入口 |
| 镜头重叠/优先级 | 覆盖（批次 1） | 覆盖剪辑，不做叠化 |
| 回画布自动成组 | 覆盖（批次 3） | 整场组 + 每镜组，组内横排、多组竖排 |

---

## 9. 文档同步

实施时同步更新：

| 文档 | 更新内容 |
|---|---|
| `docs/ui-spec.md` 16 节 | “生成到画布”按钮、成片行/重叠选择、自动分镜按钮、光照预设、人物动作、整场组/每镜组 |
| `docs/agent-capabilities.md` | 新增 `stage_auto_coverage`、`stage_dialogue_coverage`、导出工具参数（`frameDensity` 等） |
| `docs/agent-full-scope.md` | C-55/D-15 的验收标准补“整片/每镜片段/镜头表/自动成组” |
| `docs/architecture.md` | 新增 `stage-program`、`stage-lighting`、`stage-motions` 等模块说明 |
| `CHANGELOG.md` | 按批次记录，不写版本号 |

> 本方案文档本身归入「参考文档」，实施完成后按维护约定移入 `docs/archive/` 或标为历史。

---

## 10. 验收清单

### 批次 1（M1）
- [ ] 3 镜串行可连续播放，切镜不闪；
- [ ] 重叠段按 `front` 正确切换；`front` 相同取后者；
- [ ] 同一 shot 可复用，成片镜号去重正确；
- [ ] 删除 shot 级联删除 entries，并提示数量；
- [ ] 时间码连续，总时长 = 最大 `endMs`；
- [ ] 旧文档（无 `program`）按数组顺序播放。

### 批次 2（M2）
- [ ] 720p24 整片 + 每镜片段导出成功；
- [ ] 1080p30 导出成功；
- [ ] 整片时长正确；每镜片段时长 = 该镜 `durationMs`；
- [ ] 同一 shot 复用只生成一份片段；
- [ ] 取消导出后无 ffmpeg 进程、无半成品资产；
- [ ] 成功后中间目录已清理；
- [ ] 视频节点自动创建并连线。

### 批次 3（M3）
- [ ] 每镜分镜图 3 张（首/中/尾）；`first-only` 时 1 张；
- [ ] 整场组 + 每镜组自动创建；组内横排、多组竖排；
- [ ] 未播镜头标注 `（未播）`；复用镜头标注“复用第 N 镜”；
- [ ] 镜头表镜号/时间与视频一致；CSV 中文不乱码；HTML 内嵌截图可离线打开；
- [ ] 超过 20 镜弹出“全部/仅分镜图/仅整片”确认。

### 批次 4（M4）
- [ ] 10 个光照预设可切换，视口与导出一致；
- [ ] 夜景世界导出时人物为冷光；
- [ ] 8 种静态姿势可见；
- [ ] 6 种常用动作可播放；速度匹配时无明显滑步；
- [ ] pose/动作切换不重建整场；
- [ ] `gltf` 类型有明确“未支持”提示。

### 批次 5（M5）
- [ ] 单人 3 镜、双人正反打、群戏各一次；
- [ ] Agent 工具调用后自动生成并可播放；
- [ ] 重复生成只替换 `source='auto'`，手工镜头保留。

### 批次 6（M6）
- [ ] 「A：… / B：…」生成两镜正反打；
- [ ] 长句按标点切分，单镜 ≤8s；
- [ ] 导出带字幕；
- [ ] 文档与实现一致（含 `previs-adaptation-plan.md` 的深度校准表述）。
