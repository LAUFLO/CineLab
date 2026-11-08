# 剪辑室与 AI 智能剪辑方案

> 状态：方案评审中（节点形态已定稿 2026-11-07）
> 日期：2026-11-07
> 更新：2026-11-07 定稿剪辑室 / 成片双节点、保存与生成分离、本地字幕组件、节点工具栏瘦身
> 关联：`src/shared/canvas-schema.ts`、`src/renderer/src/stores/canvas.ts`、`src/main/media/ffmpeg.ts`、`src/main/export/`、`src/main/components/`
> 调研：[openfilm/openfilm](https://github.com/openfilm/openfilm)（MIT）、[jub0t/Concat](https://github.com/jub0t/Concat)（AGPL-3.0）

## 1. 背景与结论

CineLab 的画布解决了「素材生产」，但没有解决「素材组织成片」。当前导出只有项目 zip、画布 PNG 和选中素材，`roadmap-plan.md` 中 P3-3 的「视频合成导出」只是剪辑室的退化版。

本方案把「剪辑室」和「AI 智能剪辑」合并为同一个立项，理由是它们共用同一条数据链：

```
资产库 / 画布节点输出
        ↓
   时间线（Timeline JSON）   ← AI 粗剪的产物就是这一层
        ↓
   预览渲染 / ffmpeg 导出
```

AI 智能剪辑如果单独做，产物会是一个视频文件，用户无法修改；它真正该产出的是**一条可编辑的时间线草稿**。因此时间线模型是两者的共同地基，先于任何 UI。

三条核心结论：

1. **形态**：剪辑室不是独立页面，而是画布上「成片节点」的双击展开态。
2. **渲染**：预览和导出共用同一个 DOM 渲染器，导出走隐藏 BrowserWindow 逐帧截图 + ffmpeg 编码。
3. **AI**：AI 与 UI 共用同一套 `TimelineCommand`，AI 的批量操作合并为一个可撤销步。

## 2. 参考项目调研

### 2.1 项目对比

| | OpenFilm | Concat |
|---|---|---|
| 定位 | AI 视频 agent + 浏览器编辑器 | 完整原生 NLE |
| 技术栈 | Electron 44 + React 19 + Tailwind 4 + Zustand + Vite | Rust + GPU compositor |
| 许可证 | **MIT** | **AGPL-3.0** |
| 规模 | UI 402 文件 9.1 万行，server 182 文件 3.9 万行，核心 1.4 万行 | 17 个 crate 约 12 万行 |
| 时间线模型 | `film.html`（HTML 即 EDL） | JSON（Project → Timeline → Track → Clip） |
| 渲染 | Playwright/CDP 逐帧截图 + ffmpeg | 自研 GPU 合成器 |
| AI 关系 | Agent 写 HTML 电影 | MCP 驱动编辑命令 |
| 互操作 | xmeml / FCPXML / 剪映草稿 | 剪映草稿（CapCut） |

### 2.2 OpenFilm 可借鉴点

**单编译器渲染。** 时间线编译成一个网页，预览和导出跑同一个 Chromium、同一套 CSS，只差驱动方式：

- 预览：实时播放，页面自己推进时间。
- 导出：隐藏浏览器逐帧调用 `frame(t)`，截图后交给 ffmpeg 编码。

它踩平的工程坑直接适用：

- 视频 `currentTime` 落在帧边界时约 1/3 概率显示上一帧，需要专门做 seek 修正。
- 并行渲染要控制并发（浏览器对单服务器约 6 个连接）。
- 代理视频与可快速 seek 的转码副本。
- 硬件编码失败自动回退软件编码。
- motion blur 用快门内多次采样平均。

**纯逻辑层可移植。** `studio/ui/src/lib` 下 251 个文件，几乎每个都有测试：

| 文件 | 行数 | 内容 |
|---|---|---|
| `timeline-edit.ts` | 1168 | move / trim / roll / slip / slide / split / delete / paste / gap close / ripple / insert / overwrite |
| `timeline-layout.ts` | 1018 | 轨道布局、重叠片段展开为额外行 |
| `transitions.ts` | 661 | 转场 |
| `timeline-drag.ts` | 559 | 拖拽交互 |
| `timecode.ts` / `clip-speed.ts` / `clip-volume.ts` / `clip-fade.ts` | — | 时间码、变速、音量、淡入淡出 |

这些是纯函数 + 测试，MIT 许可，可移植进 CineLab，保留版权声明并记入 `THIRD_PARTY_NOTICES`。

**不照搬的部分。** `film.html` 作为项目格式不适合 CineLab：违反 JSON/JSONL 约定，且需要额外维护一千行严格解析器。只借「DOM 合成 + 单编译器」思想。

### 2.3 Concat 可借鉴点

**完整 NLE 的可数清单。** 模型四层：`Project`（media / fonts / timelines / activeTimelineId）、`Timeline`（video / background / tracks / clips / linkage）、`Track`（visible / muted）、`Clip`（30+ 字段）。

**命令层设计。** 60+ 个 `Command`，UI 和 API/MCP 走同一套命令，`apply` 是唯一含义所在；`Batch` 把多个操作合成一个撤销步；命令是数据而非函数调用，天然可序列化、可审计、可回放。

**MCP 工具清单。** 40 个工具按区域分组，其中两个对 AI 剪辑最关键：

- `timeline_read`：给 AI 看的不是完整 JSON，而是「轨道、按时间排序的片段、素材、id」的紧凑摘要。
- `preview_frame`：把合成帧作为图片返回给 AI 看。

### 2.4 借用边界

| 对象 | 能否复制代码 | 说明 |
|---|---|---|
| OpenFilm 纯逻辑层 | **可以** | MIT，保留版权声明，记入 `THIRD_PARTY_NOTICES` |
| OpenFilm UI / 渲染页 | 不建议整体复制 | 深度绑定 film.html 与自有 server，适配成本高于重写 |
| OpenFilm 架构思想 | 可以 | 不受版权保护 |
| Concat 任何代码 | **禁止** | AGPL-3.0 会传染，CineLab 必须保持 MIT |
| Concat 模型字段 / 命令 / 工具设计 | 可以 | 思想与接口设计，照着自己的实现写 |

## 3. 产品定位与形态

### 3.1 定位

不做「又一个剪映」，做 **AI 短片全流程闭环**：

- 画布负责生成素材，剪辑室负责把素材组织成片。
- 入口是「画布选区 / 分镜组一键送入」，不是从零导入。
- 差异化是 AI 编排能力，不是内置特效数量。
- 转场、标题、动效不做成固定预设，而是「可生成的图层页面」——用户要什么，AI 生成什么。

### 3.2 剪辑室节点与成片节点

节点拆成两个，职责分离：

- **剪辑室节点**：工作台。承载时间线，只负责编辑，不产出文件。
- **成片节点**：产物。只读，负责预览、版本切换和导出下载。

```
[素材节点 A] ─┐
[素材节点 B] ─┼→ [剪辑室] ──派生──> [成片]
[本地素材 C] ─┘      │                  │
                    ├─ 进入剪辑室        ├─ 封面 / 时长 / 分辨率
                    ├─ N 个素材 · 时长   ├─ 版本切换
                    └─ 成片状态          ├─ 导出下载
                                        └─ 播放
```

新增两个 `NodeKind`：`studio`（剪辑室）与 `film`（成片）。

| 节点 | 画布内显示 | 交互 |
|---|---|---|
| 剪辑室 | 「进入剪辑室」按钮 + `N 个素材 · 时长 · 成片状态` | 双击卡片区或点按钮展开；标题区双击仍是重命名 |
| 成片 | 封面帧 + 时长 + 分辨率 + 版本 + 「导出」「播放」 | 双击播放；导出是唯一下载入口 |

共同约定：

| 项目 | 约定 |
|---|---|
| 连线方向 | 素材节点 `source → 剪辑室 target`；剪辑室 `source → 成片 target` 由系统派生 |
| 左侧连线 | 语义是「加入素材池」，不按连线顺序排时间线 |
| 成片节点 | 由系统创建，不允许用户从剪辑室右侧 handle 手动连出第二个 |
| 数量关系 | 一个剪辑室严格对应一个成片节点，多次生成走成片节点的版本栈 |
| 展开层 | 全屏覆盖，与 topbar 平级，不卸载画布，避开顶部 40px 拖拽区 |
| 导出 | 只能从成片节点下载；剪辑室内不提供导出入口 |

`NODE_META` 新增：

```ts
studio: {
  label: '剪辑室',
  width: 360,
  height: 240,
  templates: ['空白剪辑室']
},
film: {
  label: '成片',
  width: 480,
  height: 270,
  templates: []
}
```

`NODE_KINDS` 增加 `'studio'` 与 `'film'`，同时需要更新：

- `src/shared/project-schema.ts` 的 `nodeKindSchema`
- `AddNodeMenu`、`NodeSearch`、`TemplateDialog`、`templates.ts` 白名单
- `context-actions.ts`、`PromptBar` 的节点类型分支

旧项目不含新节点，无需迁移。

#### 节点生命周期

| 事件 | 行为 |
|---|---|
| 首次保存且时间线非空 | 创建成片节点（状态 `pending`），自动连线 |
| 再次保存 | 写时间线；成片状态变 `stale` |
| 生成成片 | 状态 `rendering`，完成变 `ready` 并写回 `outputs` |
| 时间线清空 | 成片保留最后一版，状态 `empty`，导出禁用 |
| 删除剪辑室 | 提示「成片保留为普通视频节点 / 一起删除」 |
| 删除成片 | 剪辑室保留，状态 `missing`，可重新生成 |
| 删除素材节点 | 时间线对应片段标记 `missing`，不禁用整条时间线 |
| 断开素材连线 | 从素材池移除；时间线仍在用则标记 `missing` |
| 复制剪辑室 | 深拷贝时间线文件；成片不复制，重新生成 |
| 成片连入另一个剪辑室 | 允许，成片就是视频素材 |

### 3.3 首发能力与不做清单

**首发必须覆盖：**

- 三类轨道：视频 / 音频 / 字幕
- 片段添加、拖拽、裁剪、切割、删除、复制粘贴
- 吸附、磁性时间线、缩放、播放头、多选
- 音量、淡入淡出、静音
- 字幕编辑与烧录
- 基础转场：交叉淡化、黑场过渡
- 变速（0.1x–10x）
- 关键帧：位置 / 缩放 / 旋转 / 透明度 / 音量
- 画中画（视频轨叠加）
- 导出 MP4（H.264 + AAC），1080p 与 4K 均首发
- 字幕支持烧录与独立 VTT 导出

**第一版不做：**

- 多机位、HDR / 10-bit、AV1、ProRes
- 嵌套序列、复合片段
- 关键帧曲线编辑器
- 100 个内置特效 / 调色面板
- 声音克隆、背景移除、稳定、超分
- 移动端
- 多人协作

## 4. 数据模型

### 4.1 存放位置

```
<project>/
├── project.json                 # 增加 timelines 索引（可选字段）
├── canvas-<id>.json
├── timelines/
│   ├── <timelineId>.json        # 时间线文档
│   └── <timelineId>.vtt         # 字幕轨（可选，按语言）
├── analysis/
│   └── <assetHash>.json         # AI 结构层产物：镜头、静音、转写、节拍
├── assets/
├── .cache/
│   └── proxy/                   # 预览代理视频
└── exports/
```

`project.json` 增加可选字段，不升 schemaVersion：

```ts
timelines: z.array(z.object({
  id: z.string(),
  name: z.string(),
  file: z.string()
})).max(50).optional()
```

### 4.2 Timeline 文档

```ts
interface TimelineDoc {
  schemaVersion: 1
  id: string
  name: string
  video: {
    width: number
    height: number
    fps: number
    colorSpace: 'sdr'        // 首发只做 Rec.709 SDR
  }
  background: {
    type: 'none' | 'color' | 'image'
    color?: string
    path?: string
  }
  tracks: TimelineTrack[]
  clips: TimelineClip[]
  markers?: TimelineMarker[]
  linkage: boolean           // 其他轨是否跟随主轨联动
  createdAt: string
  updatedAt: string
}

interface TimelineTrack {
  id: string
  kind: 'video' | 'audio' | 'subtitle'
  name: string
  visible: boolean
  muted: boolean
  locked: boolean
  height?: number
}

// tracks 顺序：字幕在上，V2 等叠加轨在 V1 之上，音频轨在最下。
// 第一条视频轨是主轨，磁性开启时负责闭合空隙。

interface TimelineMarker {
  id: string
  atMs: number
  label: string
  color?: string
}
```

### 4.3 Clip

```ts
interface TimelineClip {
  id: string
  trackId: string
  kind: 'video' | 'image' | 'audio' | 'text' | 'layer' | 'transition'
  name: string

  // 时间（毫秒整数）
  startMs: number          // 时间线起点
  durationMs: number       // 时间线占位时长
  sourceStartMs: number    // 素材内起点
  speed: number            // 0.1 - 10

  // 素材引用：指向画布节点输出或资产库
  media?: {
    scope: 'project' | 'global'
    path: string
    nodeId?: string
    outputId?: string
    kind: 'video' | 'image' | 'audio'
  }

  // 画面
  transform?: {
    scale: number
    offsetX: number        // 相对画幅宽度的比例
    offsetY: number
    rotation: number
    stretchX: number
    stretchY: number
  }
  opacity?: number
  blend?: 'normal' | 'multiply' | 'screen' | 'add' | 'lighten' | 'darken'
  crop?: { left: number; top: number; right: number; bottom: number }

  // 声音
  volume?: number
  fadeInMs?: number
  fadeOutMs?: number
  muted?: boolean
  preservePitch?: boolean

  // 文字 / 字幕
  text?: TextStyle

  // 转场（作用于片头）
  transitionIn?: {
    type: 'fade' | 'dip-black'
    durationMs: number
  }

  // 关键帧
  keys?: ClipKey[]
}

interface ClipKey {
  property: 'position' | 'scale' | 'rotation' | 'opacity' | 'volume'
  at: number                 // 0-1，片段内比例
  value: number | { x: number; y: number }
  ease?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

interface TextStyle {
  content: string
  fontFamily: string
  fontSize: number           // 画幅像素
  color: string
  bold?: boolean
  italic?: boolean
  align: 'left' | 'center' | 'right'
  stroke?: { color: string; width: number }
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number }
  background?: { color: string; padding: number; radius: number }
}
```

所有时间字段用毫秒整数（`number`，`startMs` / `durationMs` / `sourceStartMs` / `atMs`）。不使用秒浮点，避免多次 trim 后的累计误差。帧率只影响吸附与导出取整，不进入数据模型。

### 4.4 与画布 / 资产库的引用

- 剪辑室节点 `data.timelineId` 指向 `timelines/<id>.json`，`data.filmNodeId` 指向成片节点。
- 成片节点 `data.studioNodeId` 反向指向剪辑室。
- `media.nodeId + outputId` 指向画布节点输出，不复制文件。
- `media.scope + path` 允许直接引用资产库条目。
- 时间线加载时校验文件存在性；缺失的 clip 标记 `missing`，不禁用整条时间线。
- 上游节点产生新输出时，素材池标记「有新版本」，成片节点状态变 `stale`；首版只提示不自动替换。

### 4.5 迁移

`schemaVersion: 1` 起步。后续字段只增不改；删除字段时保留读取兼容。未知字段忽略而不是报错，避免旧版本打开新文档直接失败。

### 4.6 节点数据与成片状态机

```ts
// CineNodeData 扩展
timelineId?: string
filmNodeId?: string
studioNodeId?: string
filmStatus?: 'pending' | 'rendering' | 'ready' | 'stale' | 'empty' | 'missing'
```

状态机：

```
pending → rendering → ready
   ↑          ↓
   └── stale ←┘

empty / missing 为终态分支，可回到 pending 重新生成
```

- 保存时间线只把 `ready` 变 `stale`，不自动渲染。
- `rendering` 时禁止再次生成，可取消；取消后回到 `stale`，保留上一版 `outputs`。
- `outputs` 复用现有版本栈，每个版本记录分辨率、码率、文件大小和生成时间。

## 5. Command 层

### 5.1 为什么需要

如果 UI 直接改 store、AI 直接改 JSON，会出现两套语义、两套撤销、两套校验。Concat 的结论是：**所有编辑都是一条命令，`apply` 是唯一含义所在。**

```ts
type TimelineCommand =
  | { op: 'addClip'; clip: TimelineClip }
  | { op: 'addClips'; clips: TimelineClip[] }
  | { op: 'addClipsInSequence'; clips: TimelineClip[]; trackId: string; atMs: number; mode?: 'insert' | 'overwrite' }
  | { op: 'moveClips'; moves: { clipId: string; startMs: number; trackId: string }[]; mode?: 'insert' | 'overwrite' }
  | { op: 'trimClip'; clipId: string; edge: 'start' | 'end'; deltaMs: number }
  | { op: 'splitClips'; clipIds: string[]; atMs: number }
  | { op: 'removeClips'; clipIds: string[] }
  | { op: 'updateClip'; clipId: string; patch: Partial<TimelineClip> }
  | { op: 'setClipSpeed'; clipId: string; speed: number }
  | { op: 'setClipTransform'; clipId: string; transform: Partial<ClipTransform> }
  | { op: 'detachAudio'; clipId: string }
  | { op: 'addTrack'; track: TimelineTrack }
  | { op: 'removeTrack'; trackId: string }
  | { op: 'setTrackFlag'; trackId: string; flag: 'visible' | 'muted' | 'locked'; value: boolean }
  | { op: 'setTimelineVideo'; video: TimelineDoc['video'] }
  | { op: 'setTimelineBackground'; background: TimelineDoc['background'] }
  | { op: 'addMarker'; marker: TimelineMarker }
  | { op: 'removeMarker'; markerId: string }
  | { op: 'batch'; commands: TimelineCommand[]; label?: string }
```

### 5.2 应用与撤销

```ts
function applyCommand(doc: TimelineDoc, cmd: TimelineCommand): TimelineDoc
```

- 纯函数，输入旧文档，返回新文档，不修改入参。
- 所有钳制（最小片段长度 1/60 秒、速度 0.1–10、音量不小于 0）在 `applyCommand` 内完成。
- 未知 id 跳过而不是抛错，批量操作其余部分继续生效。

撤销复用画布的快照模式：

- `dispatch(cmd)` 先 `pushHistory()`，再 `applyCommand`。
- 一次拖拽手势在 `pointerup` 时提交一条命令，拖动过程只做预览。
- AI 的 `batch` 只产生一个快照。
- 历史上限 50，与画布一致。

### 5.3 UI 与 AI 共用

- 剪辑室 UI 只调用 `dispatch`，不直接改文档。
- AI 通过同一 `dispatch` 提交命令，批量操作包一层 `batch`。
- 命令可序列化，便于记录到日志、回放和测试。

## 6. 编辑语义

### 6.1 轨道与重叠

- 轨道顺序：字幕轨在上，叠加视频轨（V2+）在 V1 之上，音频轨在最下。上面的盖下面的。
- V1 是主轨，磁性开启时负责闭合空隙。
- 同一轨道内片段不重叠；压住已有片段时，被压部分挪到旁边新轨道，显式覆盖是唯一例外。
- 转场不占独立轨道，挂在后一个片段的 `transitionIn` 上，时长从前一个片段尾部借。
- 字幕轨只放字幕；字幕压字幕时截短前一条，不开新轨。

### 6.2 移动 / 裁剪 / 切割

| 操作 | 语义 |
|---|---|
| 移动 | 改 `startMs` 和 `trackId`；默认插入，`Alt` 覆盖 |
| 裁剪头部 | `startMs` 与 `sourceStartMs` 同步变化，其余帧保持在时间线上的位置 |
| 裁剪尾部 | 只改 `durationMs`，`startMs` 不变 |
| 切割 | 在 `atMs` 处一分为二，前半段保留原 id，后半段新 id，`sourceStartMs` 顺延 |
| 删除 | 磁性开启时主轨闭合空隙；关闭时留空隙 |
| 粘贴 | 默认从播放头插入；`Shift` 覆盖 |

### 6.3 磁性时间线

`linkage: true` 时：

- 主轨（V1）闭合空隙，依附其上的字幕、音频、叠加层同步移动。
- 轨道 `locked` 时不参与联动。
- 磁性默认开启，工具栏可临时关闭；开关是时间线级设置，不是全局设置。

### 6.4 吸附

吸附目标：播放头、片段边缘、标记、时间线 0 点、整秒。

- 阈值按屏幕像素换算（约 8px），不按时间固定值，否则缩放后手感会变。
- 缩放足够大时，吸附粒度细化到帧。
- 吸附时显示高亮竖线。
- `Alt` 临时关闭吸附。

## 7. 渲染架构

### 7.1 总览

```
Timeline JSON（唯一真相源）
        ↓
timeline → 绘制计划（纯函数，预览与导出共用）
        ↓
   ┌────────────┴────────────┐
预览驱动                     导出驱动
可见 Canvas                  隐藏 BrowserWindow
requestAnimationFrame        逐帧 frame(t) + toDataURL
                                     ↓
                              ffmpeg 编码
```

预览与导出共用同一套绘制函数和同一份绘制计划，一致性由「同一个渲染器」保证，不靠两套实现对齐参数。

POC-1 结论：DOM 截图在 Electron 下受屏幕尺寸限制，4K 输出不可行；Canvas 2D 可以稳定输出 4K。详见 `.opencode/handover/evidence/CLIP-STUDIO-POC1.md`。

### 7.2 时间线 → Canvas

- 一个 `TimelineRenderer`，把 `TimelineDoc` 编译成绘制计划：每个 clip 的源矩形、目标矩形、透明度、裁剪、旋转、文字样式。
- 绘制用 Canvas 2D：`drawImage` 画视频 / 图片，`fillText` 画文字，`globalAlpha` 做淡入淡出，`globalCompositeOperation` 做混合模式。
- 绘制计划是纯函数，不含 DOM，预览和导出共用。
- 音频不进 Canvas，走 WebAudio。
- 转场在计划阶段展开为重叠 + 透明度曲线；黑场额外画一层黑色矩形。
- 坐标系统一：canvas 尺寸 = `video.width × video.height`，所有变换按比例计算。

### 7.3 预览驱动

- 一个可见 `<canvas>`，按预览区等比缩放显示，内部绘制分辨率仍按时间线输出尺寸。
- `usePlaybackClock` 基于 `performance.now()` 推进 `currentTime`，不依赖 `requestAnimationFrame` 的累计误差。
- 每帧调用 `renderFrame(ctx, plan, t)`；视频 clip 设置 `currentTime = sourceStart + (t - start) * speed`，等待 `seeked` 后再绘制。
- 只解码当前活跃的 clip；非活跃视频暂停并释放。
- 音频用 WebAudio `AudioBufferSourceNode` + `GainNode`，每个 clip 一个节点，播放头 seek 时重建。
- 播放头拖动时进入 scrub 模式：视频降级为关键帧预览，松手后恢复精确 seek。

### 7.4 导出驱动

**保存与生成分离。** 两个动作，不要混：

| 动作 | 触发 | 行为 |
|---|---|---|
| 保存 | 自动保存 / `Ctrl+S` | 写时间线 JSON；首次非空则创建成片节点；已有成片则标记 `stale` |
| 生成 | 成片节点「生成成片」按钮 / 关闭剪辑室时提示 | 走任务队列渲染，完成后写回版本栈 |

不允许保存直接触发渲染：POC 实测 1080p 约 0.84 倍速（3 分钟片约 3.5 分钟），4K 约 0.31 倍速（约 10 分钟），会阻塞连续编辑。

主进程创建隐藏窗口。**窗口尺寸与输出尺寸解耦**：窗口只要 1280×720 即可，渲染页内部创建目标尺寸的 canvas，4K 不需要窗口 4K。

```ts
const win = new BrowserWindow({
  show: false,
  width: 1280,
  height: 720,
  webPreferences: {
    backgroundThrottling: false,
    preload: timelineRenderPreload
  }
})
```

**导出流程（三段式）：**

1. 渲染进程提交 `TimelineDoc` 和导出参数。
2. 主进程构建导出计划：
   - 把 `transitionIn` 展开为「重叠 + opacity 曲线 + 可选黑色图层」，渲染器只认图层和透明度；
   - 所有时间量化到帧网格，算出统一的 `totalFrames`；
   - 画面和音频共用同一个总帧数。
3. 加载内部渲染页，注入时间线。
4. 逐帧：`seek(t)` → 等待 `frameReady` → `toDataURL`。
5. 编码无声视频到临时文件 `.<name>.video.mp4`。
6. 混音到临时文件 `.<name>.audio.m4a`。
7. mux 到 `.<name>.muxed.mp4`。
8. `rename` 到最终路径，清理临时文件。

**frameReady 必须等齐：**

- 所有视频的 `seeked`
- 图片的 `decode()`
- 字体加载（首次）
- 一次 `requestAnimationFrame`
- 绘制调用完成

不能画完一帧立刻画下一帧，否则会出现「上一帧」和字体闪烁。OpenFilm 的 seek 修正方案直接参考。

**编码与回退：**

- 优先硬件编码（`h264_nvenc` / `h264_qsv` / `h264_amf`），失败回退 `libx264`，重跑整个 pass。
- 进度阶段：`rendering` → `rendering in software`（如回退）→ `mixing audio` → `muxing`。
- 每帧检查取消，取消后清理临时文件。

**临时文件与原子写入：**

- 输出目录写 `.<stem>.video.*`、`.<stem>.audio.*`、`.<stem>.muxed.*`。
- 全部成功后才 `rename` 到目标路径；失败不覆盖已有文件。
- 导出开始前检查磁盘剩余空间，按 `totalFrames × 单帧大小 + 音频` 估算。

**帧网格：**

```ts
const totalFrames = Math.max(1, Math.round(totalMs * fps / 1000))
const timeOfFrame = (i: number) => (i * 1000) / fps
```

画面和音频都用 `totalFrames`，音频用 `-t` 截断到同一时长。

**帧的传递方式：**

- 渲染页内 `canvas.toDataURL('image/jpeg', 0.92)` 返回 base64，主进程解码后写临时 JPEG 序列。
- P2 可优化为 `toBlob` + ArrayBuffer 传输，减少 base64 开销。
- 不透明用 JPEG（quality 92），需要透明或高质量时用 PNG。
- 4K 单帧 JPEG 约 300–600KB，300 帧约 120–200MB，走临时目录。

并行策略：默认 1 个窗口，导出长片时按 CPU 核数开 2–4 个窗口分片渲染，每片独立编码后 concat。首版只做单窗口，等 POC 数据再决定是否并行。

### 7.5 快速路径

满足以下全部条件时，跳过截图流程，直接走 ffmpeg：

- 只有一条视频轨，片段首尾相接无空隙
- 无 `transform`、`opacity`、`crop`、`blend`
- 无文字、字幕、转场
- 音频只有一条轨，无变速

用 `concat` demuxer 或 `filter_complex` 拼接，音频 `amix` / `afade` 处理。这条路径能把「纯拼接」从分钟级降到秒级。

### 7.6 代理与缓存

- 预览时原片分辨率高于 1080p 或码率过高，生成 540p H.264 代理到 `.cache/proxy/`。
- 代理按内容 hash 命名，时间线删除引用后不立即清理。
- 缩略图、波形数据同样按 hash 缓存。

### 7.7 音频

**预览：** WebAudio 混音，clip 级 `GainNode` 处理音量与淡入淡出。视频片段自带音频时，从同一个 `<video>` 元素取源，不重复解码。

**导出：一条 ffmpeg filtergraph**

- 所有音频片段拼成一条 `filter_complex`，`volume` + `afade` + `amix`。
- 必须 `amix=inputs=N:normalize=0`，否则音量会被自动归一化。
- 只有一个输入时不要走 `amix`，直接 `volume` + `afade`。
- `amix` 输出时间戳不可靠，末尾加 `aresample=48000` + `asetpts=N/SR/TB`。
- 视频片段默认带音轨但可能没有：导出前 probe，没有音轨的不进 mix，避免 `[N:a]` 让 ffmpeg 报错。
- 音频总时长用 `-t totalFrames/fps` 截断，与画面一致。
- 快速路径与 DOM 路径共用这套 filtergraph。

**响度：** 首版不做归一化，保留 `-14 LUFS` 作为后续选项。

### 7.8 一致性白名单

只有「预览与导出都已实现」的效果才允许出现在 UI 上。白名单外的新效果先做实现，再放开入口。这条规则优先于任何技术选型。

当前白名单：

| 能力 | 预览 | 导出 |
|---|---|---|
| 位移 / 缩放 / 旋转 | Canvas `setTransform` | 同一渲染器 |
| 透明度 / 混合模式 | `globalAlpha` / `globalCompositeOperation` | 同一渲染器 |
| 裁剪 | `ctx.clip()` | 同一渲染器 |
| 文字 / 字幕 | `fillText` + 描边 / 阴影 | 同一渲染器 |
| 交叉淡化 / 黑场 | `globalAlpha` + 黑色矩形 | 同一渲染器 |
| 音量 / 淡入淡出 | WebAudio | ffmpeg filtergraph |
| 变速 | video `playbackRate` | 帧时间映射 |

## 8. AI 智能剪辑

### 8.1 三层能力

| 层 | 内容 | 产物 |
|---|---|---|
| 结构层 | 镜头检测、语音转写、静音检测、节拍分析 | `analysis/<hash>.json` |
| 编排层 | 分镜成片、文案匹配、音乐卡点 | `TimelineCommand[]` |
| 微调层 | 自动字幕、去静音、跳剪、卡点对齐 | 建议列表 + 可应用命令 |

**先做结构层。** 它同时服务手动剪辑（自动切分、自动字幕、静音标记），ROI 最高，且不依赖编排算法调优。

### 8.2 结构层

| 能力 | 实现 | 备注 |
|---|---|---|
| 镜头检测 | ffmpeg `scdet` / `select='gt(scene,0.3)'` | 零额外依赖 |
| 静音检测 | ffmpeg `silencedetect` | 零额外依赖 |
| 语音转写 | whisper.cpp CLI 组件 | 见下方说明 |
| 节拍检测 | 首版用 ffmpeg 能量峰值；后续接 librosa | 先做可用版本 |
| 画面质量打分 | 抽帧 + 拉普拉斯方差 | 可选 |

**语音转写：whisper.cpp CLI 组件**

不使用 Python sidecar，直接 spawn whisper.cpp 官方 Windows CLI，组件更小、链路更短。

| 项目 | 约定 |
|---|---|
| 组件名 | `whisper-runtime`（whisper-cli.exe + 依赖 DLL） |
| 模型组件 | `whisper-model-tiny` / `base` / `small` / `medium`，独立下载 |
| 下载 | 复用 `src/main/components/` 的 manifest + sha256 + 断点续传 |
| 设置入口 | 设置 → 组件，新增「本地字幕模型」分组 |
| 模型大小 | tiny 约 75MB、base 约 142MB、small 约 466MB、medium 约 1.5GB |
| 默认档位 | base；设置页可切换 |
| 任务 | 走现有任务队列，解析 stdout 进度，支持取消 |
| 输出 | 分句时间戳 JSON + VTT，写入字幕轨 clip |
| 首次使用 | 未安装时点击「自动字幕」引导到设置页下载 |

产物结构：

```ts
interface AssetAnalysis {
  assetHash: string
  duration: number
  shots: { start: number; end: number; score: number }[]
  silences: { start: number; end: number }[]
  transcript?: {
    language: string
    segments: { start: number; end: number; text: string }[]
  }
  beats?: number[]
}
```

### 8.3 编排层

**第一个场景：分镜组一键成片。**

- 分镜组已有序号、宫格排列、2K 拼接，数据现成。
- 不需要镜头检测、不需要 ASR、不需要 BGM 分析。
- 直接产出一条时间线，把「生成 → 时间线 → 预览 → 导出」整条链路跑通。
- 每格默认 2.5 秒，可配置；图片做 Ken Burns 轻微推拉。

**第二个场景：文案成片。**

- 文案按句切分，每句匹配一个或多个镜头。
- 匹配用 LLM，输入是句子和镜头摘要（画面描述、转写文本、时长）。
- 输出 `addClipsInSequence` + `updateClip` 命令。

**第三个场景：音乐卡点。**

- 用节拍点切镜，镜头长度对齐到最近的节拍。
- 先做「按节拍均分」，再做「按段落强弱分配」。

所有编排产物都是 `batch` 命令，一次性应用，一个撤销步。

### 8.4 微调层

- 自动字幕：转写结果按句切分为 `text` clip，放到字幕轨。
- 去静音：检测静音段，给用户「删除所有静音」建议，生成 ripple 删除命令。
- 跳剪：按转写文本去掉语气词和重复句，建议式应用。
- 卡点对齐：把选中片段边缘吸附到节拍点。

建议式而非全自动：每条建议带理由和置信度，用户可以单条接受或全部忽略。

### 8.5 AI 如何读写时间线

**读：** 提供 `timeline_summary`，不是完整 JSON。

```ts
interface TimelineSummary {
  durationMs: number
  video: { width: number; height: number; fps: number }
  tracks: { id: string; kind: string; name: string; clips: number }[]
  clips: {
    id: string
    trackId: string
    kind: string
    name: string
    startMs: number
    durationMs: number
    text?: string
  }[]
}
```

摘要与命令统一用毫秒，避免 AI 在两种单位之间换算。

**看：** `preview_frame(atMs)` 复用导出渲染器渲染单帧，返回图片给 Agent。

**写：** 只能通过 `TimelineCommand`，批量包 `batch`，全部可撤销。

### 8.6 与 AGENT-1 的关系

本方案不实现通用 Agent，只提供：

- 时间线读写接口
- 命令层
- 结构层分析产物

`AGENT-1` 落地时直接复用这三样，不需要再改时间线内核。

## 9. 与现有系统的接线

### 9.1 画布

三个创建入口：

| 入口 | 行为 |
|---|---|
| 画布右键菜单 | 新增「剪辑室」，在点击位置创建空剪辑室节点 |
| 节点工具栏 | 图片 / 视频 / 音频 / 文本 / 成片节点固定显示「剪辑室」按钮：在节点右侧 80px 创建剪辑室，自动连线，并直接打开剪辑室；剪辑室节点自身不显示 |
| 多选工具栏 / 分镜组工具栏 | 选中多个节点或分镜组，一键创建剪辑室并按顺序送入素材池 |

上传同步：

- 从剪辑室上传本地素材 → 画布创建素材节点 → 自动放进「剪辑室素材 N」组并排在剪辑室左侧 → 自动连线 → 进入素材池。
- 不自动排入时间线，除非走「一键成片」。
- 文本节点连入后作为文案 / 字幕素材，拖入时间线默认生成字幕 clip。

删除与连线：

- 左侧连线接收素材，进入素材池。
- 成片节点由系统派生，剪辑室右侧不提供手动 `+` handle。
- 成片节点渲染完成后写回 `outputs`，复用版本栈。

### 9.2 资产库

- 剪辑室素材池同时展示：连线进来的节点输出、资产库条目、本次上传的素材。
- 引用资产库时写 `scope` + `path`，导出时解析绝对路径，复用 `resolveMediaPath`。

### 9.3 任务队列

- AI 结构层分析、代理生成、导出都走现有任务队列。
- 长任务必须支持进度、取消、失败重试。
- 导出任务与生成任务分开队列，避免互相阻塞。

### 9.4 导出

- 复用 `exports/` 目录与现有导出 IPC 模式。
- 成片导出与「导出选中素材」并列，不互相替代。
- `roadmap-plan.md` 中 P3-3 的「视频合成导出」并入本方案，不再单独实现。

### 9.5 快捷键作用域

剪辑室展开时，画布快捷键必须全部让位：

- `V` / `H` / `Space` 工具切换
- `Ctrl+F` 节点搜索
- `Delete` / `Ctrl+Z` / `Ctrl+Shift+Z`
- 画布右键菜单

实现方式：`ui` store 增加 `activeScope: 'canvas' | 'timeline'`，所有全局键盘监听先判断作用域。剪辑室内部快捷键独立注册，关闭时注销。

这是最容易埋 bug 的地方，P1 必须专门测。

### 9.6 节点工具栏瘦身

新增「剪辑室」按钮后，工具栏控件数达到 11 个，小节点上会过宽。P1 一并调整：

| 项目 | 现状 | 调整 |
|---|---|---|
| 工具栏高度 | 40px | 36px |
| 按钮高度 | 32px | 28px |
| 按钮内边距 | 0 8px | 0 5px |
| 按钮间距 | 2px | 1px |
| 字号 | 13px | 12px |
| 图标 | 16px | 14px |
| 主操作上限 | 6 | **保持 6** |
| 下载 / 入库 | 常驻 | **保持常驻**，不收进更多 |
| 尺寸展示 | 常驻 | **删除**，不再占用工具栏 |

固定常驻：6 个主操作 + 更多 + 剪辑室 + 下载 + 展开 + 入库。

宽度预算：按现有按钮结构估算约 800px。先按此实装看效果，节点上方的浮层允许溢出；如果实装后仍然太长，再决定把下载 / 入库收进「更多」或改图标模式。

验收：

- 工具栏不再出现尺寸数字。
- 360px 图片节点、480px 视频节点各截图一次，工具栏不换行、不遮挡节点标题。
- 宫格 240px 节点允许溢出，但不遮挡节点本身。

### 9.7 剪辑室内部布局

浮窗规格：

| 项目 | 值 |
|---|---|
| 外框 | `inset: 48px 20px 20px`，圆角 16px |
| 遮罩 | `rgba(0, 0, 0, 0.5)` + `backdrop-filter: blur(4px)` |
| 顶部留白 | 48px，避开窗口拖拽区 |
| 底板 | `--canvas-bg`，各面板浮在上面 |
| 面板 | `--surface`，圆角 10px，间距 6px |

```
┌──────────────────────────────────────────────────────────────────┐
│ [←] 剪辑室 · 项目名        已保存 · 00:32 · 1080p   [生成成片] [×] │ 48
├──────────┬───────────────────────────────────┬───────────────────┤
│ 素材池    │           预览播放器                │   属性检查器        │
│ 240px    │                                   │   280px           │
│          │        ┌─────────────────┐        │                   │
│ 连线素材  │        │                 │        │  基础              │
│ 资产库    │        │   16:9 / 9:16   │        │  时间              │
│ 上传      │        │                 │        │  画面              │
│          │        └─────────────────┘        │  声音              │
│ [卡片]    │     ◀ ▶  00:12 / 00:32  🔊       │  文字              │
│ [卡片]    │                                   │  转场              │
├──────────┴───────────────────────────────────┴───────────────────┤
│ 选择 切割 │ ↶ ↷ │ 吸附 磁性 │ 缩放 −───＋ │ 标记 加轨道         │ 40
├──────────────────────────────────────────────────────────────────┤
│ 轨道头 140 │ 标尺 · 播放头                                          │
│ 视频 1     │ [片段][片段][片段]                                     │ 64
│ 视频 2     │        [片段]                                         │ 64
│ 音频 1     │ [波形........................................]        │ 56
│ 字幕       │ [字幕块]  [字幕块]                                     │ 40
└──────────────────────────────────────────────────────────────────┘
```

区域约定：

| 区域 | 尺寸 | 内容 | 行为 |
|---|---|---|---|
| 顶部栏 | 48px | 返回画布、名称、保存状态、时长、分辨率、生成成片、关闭 | 生成按钮在 `stale` 时高亮；剪辑室内无下载入口 |
| 素材池 | 240px，可折叠 | tab：连线素材 / 资产库 / 上传 | 卡片拖入时间线；上传同步画布节点 |
| 预览区 | 自适应 | 画面 + 播放控制 | 画面 `contain` 居中；竖屏素材左右留黑 |
| 属性检查器 | 280px，可折叠 | 基础 / 时间 / 画面 / 声音 / 文字 / 转场 | 未选中时显示时间线设置 |
| 时间线 | 默认 40%，可拖 25%–60% | 工具栏 40px + 标尺 28px + 轨道 | 轨道高：视频 64、音频 56、字幕 40 |

面板风格：浮块 + 6px 缝隙，露出 `--canvas-bg` 底板，每块圆角 10px。

响应式：

- 窗口宽度 < 1200px：检查器默认折叠。
- 窗口宽度 < 900px：素材池也折叠，只留预览 + 时间线。

布局状态：

- 面板宽度、时间线高度、折叠状态、最后选中的素材 tab 存本地设置，不写进时间线 JSON。
- 按项目记忆，首次使用默认值。

交互：

- `Esc`：取消当前拖拽 / 输入；否则关闭剪辑室并自动保存。
- 关闭时成片为 `stale`：顶部显示「成片待更新」，不阻塞关闭。
- 双击时间线空白：取消选择。
- 右键片段：切割、复制、删除、分离音频、复制属性。
- `Ctrl+滚轮`：时间线缩放；`Shift+滚轮`：横向滚动。

### 9.8 时间线

```
┌────────────┬──────────────────────────────────────────────────────┐
│            │ 标尺 28px   00:00    00:05    00:10    00:15         │
│            │            │                                          │
│ 轨道头 140  ├────────────┼──────────────────────────────────────────┤
│            │ 字幕 1     │ [字幕块]      [字幕块]                    │ 40
│            │ V2         │        [画中画]                           │ 64
│            │ V1 主轨    │ [片段][片段][片段]                        │ 64
│            │ A1         │ [波形................................]    │ 56
│            │ A2         │                                          │ 56
└────────────┴────────────┴──────────────────────────────────────────┘
```

尺寸总表：

| 元素 | 规格 |
|---|---|
| 轨道头 | 140px，类型图标 + 名称 + 可见 / 静音 / 锁定 |
| 轨道高度 | 视频 64、音频 56、字幕 40；拖底边 40–120，双击复位 |
| 标尺 | 28px |
| 播放头 | 1px 竖线 + 10px 三角 |
| 片段 | 上下各留 2px 间隙，圆角 4px，裁剪手柄 6px |
| 横向滚动条 | 10px，悬浮在时间线底部 |
| 缩放范围 | 最窄 1 秒，最宽 4 倍片长 |

#### 9.8.1 轨道头

```
┌──────────────────────┐
│ V  V1 · 主轨   👁 🔒 │
│    12 个片段          │
└──────────────────────┘
```

- 固定 140px，`position: sticky; left: 0`，横向滚动时不动。
- 第一行：类型图标（V / A / S）+ 名称；第二行显示片段数。
- 右侧按钮组 20×20：视频轨「可见 + 锁定」，音频轨「静音 + 锁定」，字幕轨「可见 + 锁定」。
- 主轨 V1 左侧有 2px `--pick-bar` 竖线，悬停显示「主轨」。
- 选中轨道背景 `--surface-hover`；锁定轨道上的片段叠加斜纹遮罩，不可拖拽。
- 至少保留一条视频轨，主轨不可删除。
- 右键菜单：重命名、复制轨道、删除轨道、全部静音、全部锁定。
- 拖底边调整轨道高度，双击复位；高度按轨道记忆，不写进时间线 JSON。

#### 9.8.2 标尺与播放头

刻度按 `pxPerMs` 自动分级：

| 缩放级别 | 大刻度 | 小刻度 |
|---|---|---|
| 最大 | 5 帧 | 1 帧 |
| 较近 | 1 秒 | 0.5 秒 |
| 中 | 5 秒 | 1 秒 |
| 较远 | 10 / 30 秒 | 5 秒 |
| 最远 | 1 / 5 分钟 | 30 秒 |

标签格式：

- 小于 1 分钟：`00:05`
- 超过 1 分钟：`01:30`
- 超过 1 小时：`01:02:30`
- 帧级缩放：`00:05:12`（时:分:秒:帧）

交互：

- 单击标尺：播放头跳转。
- 拖拽标尺：scrub，播放头跟随，显示 `00:12.480` 气泡。
- 双击标尺：添加标记。
- 右键标记：重命名 / 改色 / 删除。
- 单击时间线空白：播放头跳转并取消选择；拖拽空白：框选。

播放头：

- 1px `--pick-bar` 竖线，贯穿标尺与所有轨道。
- 顶部 10px 三角，指向下方。
- 播放时自动滚动：播放头到达视口 80% 处开始滚动，保持在 70% 位置。
- 拖拽片段到时间线外不移动播放头。

#### 9.8.3 片段本体

外观：

| 类型 | 背景 | 内容 |
|---|---|---|
| 视频 / 图片 | `--surface-raised` | 缩略图条 + 左上名称 + 右下时长 |
| 音频 | `--surface` | 波形 + 左上名称 |
| 字幕 | `--surface-hover` | 文本内容，超出截断 |
| 转场 | 半透明 | 居中图标 + 时长 |

- 圆角 4px，1px `--border`。
- 宽度小于 40px 时只显示色块，不显示文字。
- 选中：`--border-selected` 边框 + 外发光，左右 6px 手柄常驻。
- 悬停：边框变亮；音频片段显示音量基线。
- 视频缩略图每 80px 一张，按 `sourceStartMs + 偏移 × speed` 取帧。
- 波形预计算每秒 100 个峰值，按缩放降采样。
- 锁定轨道的片段不可拖动、裁剪、切割，右键菜单只剩「复制属性」。

转场：

- 显示在前一个片段尾部与后一个片段头部之间，宽 16px。
- 点击选中，检查器显示类型和时长。
- 拖左右边缘调整时长，最小 100ms，最大不超过相邻片段较短者的一半。

关键帧：

- 片段底部显示 4px 菱形，按 `at` 比例定位。
- 首版只显示位置、缩放、旋转、透明度、音量五类。
- 点击菱形选中，检查器显示属性；拖动菱形改时间。
- 不展开曲线编辑器。

右键菜单：

切割、复制、粘贴属性、删除、分离音频、变速、添加转场（左侧有相邻片段时）、复制片段。

#### 9.8.4 滚动与缩放容器

DOM 结构：

```
.timeline-scroll        overflow: auto
└── .timeline-grid      grid: 140px 1fr
    ├── .ruler-corner   sticky left 0 / top 0，z 3
    ├── .ruler          sticky top 0，z 2
    ├── .track-head     sticky left 0，z 1
    └── .track-lane     min-width: max-content
```

- 标尺与轨道头同时 sticky，左上角交叉区层级最高。
- 播放头绝对定位在 `.timeline-grid` 内，`left = 140 + playheadMs × pxPerMs`，随滚动自动移动，不需要手动同步 `scrollLeft`。

滚动：

- 横向：`Shift + 滚轮`、触控板横滑、底部滚动条。
- 纵向：滚轮，轨道多于视口时生效。
- `Ctrl + 滚轮` 缩放，以鼠标位置为锚点：缩放前后鼠标下的时间不变。

```ts
const timeAtMouse = (mouseX - 140 + scrollLeft) / pxPerMs
// 缩放后
scrollLeft = timeAtMouse * newPxPerMs - (mouseX - 140)
```

- 拖拽片段到视口左右边缘 40px 内触发自动滚动，速度随距离线性增加，最大约 18px/帧，用 `requestAnimationFrame` 驱动。

虚拟化：

```ts
const visibleStart = (scrollLeft - 140) / pxPerMs - 1000
const visibleEnd = visibleStart + viewportWidth / pxPerMs + 2000
```

只渲染与可视区间相交的片段；轨道头始终渲染。

手势：

| 操作 | 行为 |
|---|---|
| 拖片段主体 | 改 `startMs` / `trackId`；默认插入，`Alt` 覆盖 |
| 拖左边缘 | trim in，`startMs` 与 `sourceStartMs` 同步 |
| 拖右边缘 | trim out，只改 `durationMs` |
| `Alt` + 拖边缘 | ripple trim |
| `Alt` + 拖片段 | 复制 |
| 拖素材池卡片 | 落到时间线；默认插入，`Alt` 覆盖 |
| 空白拖拽 | 框选 |
| `Shift` 点击 | 加选 |
| `C` | 切割工具 |
| `Ctrl+K` | 播放头处切开选中片段 |
| `Delete` | 删除 |
| `空格` | 播放 / 暂停 |
| `←` / `→` | 上一帧 / 下一帧 |
| `Home` / `End` | 片头 / 片尾 |
| `Ctrl+滚轮` | 缩放 |
| `Shift+滚轮` | 横向滚动 |

缩放模型：zoom 表示「一屏显示多少时间」，不是像素密度。

- 100% = 整条片子刚好填满宽度
- 默认 80%
- 最宽 4 倍片长，最窄 1 秒
- 空时间线默认显示 30 秒跨度
- 滚轮缩放步长 1.6

状态机：

```
idle → dragging / trimming / scrubbing / selecting / playing
```

任何时刻只允许一个手势状态；`Esc` 取消当前手势并回到 `idle`。

性能：

- 只渲染可视区片段，横向滚动虚拟化
- 缩略图按缩放密度分级缓存
- 波形预计算并缓存
- 拖动时只改 `transform`，不改 `left`
- 100+ 片段保持 60fps

## 10. 分期

| 期 | 内容 | 交付判定 |
|---|---|---|
| **P0 内核** | 时间线 schema、Command 层、撤销、布局与编辑纯函数、单测 | 纯函数测试通过，命令可序列化回放 |
| **P1 编辑器** | 多轨 UI、拖拽、裁剪、切割、吸附、缩放、播放头、多选、快捷键作用域、节点工具栏瘦身 | 可手动剪一条 30 秒片；工具栏适配 360 / 480 宽度 |
| **P2 渲染** | DOM Stage、预览播放、单帧渲染、完整导出、快速路径、代理 | 导出与预览画面一致 |
| **P3 成片能力** | 字幕、音频混音、转场、变速、关键帧、画中画 | 覆盖首发能力清单 |
| **P4 AI 结构层** | 镜头检测、静音、whisper 组件下载与设置页、转写、节拍 | 组件可装可卸；分析产物可在 UI 中看到并一键使用 |
| **P5 AI 编排层** | 分镜成片、文案成片、音乐卡点 | 一键出草稿并进入剪辑室微调 |
| **P6 打磨** | 大项目性能、缓存清理、错误处理、导出预设 | 100+ 片段仍可流畅操作 |

量级参考：单人全职到 P5 约 5–7 个月。P0–P2 是技术风险最集中的阶段，必须先做 POC 再全面铺开。

## 11. 技术风险与 POC

### 11.1 必须先验证

**POC-1：隐藏窗口逐帧导出（已完成 2026-11-07）**

结论：DOM 截图只能做到 1080p，4K 受屏幕限制；导出渲染器改用 **Canvas 2D**。

| 方案 | 1080p | 4K |
|---|---|---|
| DOM + `capturePage` | 76.7ms/帧，0.43 倍速 | 不可用：实际只截到 2496×1532 |
| CDP `Page.captureScreenshot` | — | 不可用：4K 视口下卡死 |
| Canvas 2D | 37.4ms/帧，0.84 倍速 | 104.2ms/帧，0.31 倍速 |

seek 精度（时间码精确到帧）、音画时长一致、编码链路、临时文件 + rename 均验证通过。详见 `.opencode/handover/evidence/CLIP-STUDIO-POC1.md`。

原 POC 判定标准仍保留，作为 Canvas 方案的验收线：1080p ≥ 0.3 倍速、4K ≥ 0.25 倍速；当前实测 0.84 / 0.31。

**POC-2：视频 seek 精度**

- 验证 `currentTime` 落在帧边界时是否稳定显示目标帧。
- 复现 OpenFilm 提到的「1/3 概率显示上一帧」问题，并验证修正方案。

**POC-3：音频同步**

- 导出音频与画面偏差不超过 1 帧。
- 验证 `OfflineAudioContext` 混音与视频帧的时间对齐。

### 11.2 POC 不通过时的退路

原退路「Canvas 预览 + ffmpeg 导出」已经成为主方案。新的退路：

- 如果 Canvas 4K 在真实长片或低配机器上性能不达标，4K 导出退回 1080p 渲染 + ffmpeg 上采样，并在 UI 标注「4K 上采样」。
- 如果 Canvas 渲染在复杂文字/混合模式下效果不达预期，退回 DOM 预览 + Canvas 导出，用一致性白名单控制差异。

### 11.3 其他风险

| 风险 | 缓解 |
|---|---|
| 多窗口内存过高 | 默认单窗口，分片可选 |
| 大项目 100+ 片段卡顿 | 虚拟化轨道、只渲染可视区、缩略图缓存 |
| 字体不一致 | 导出页显式加载同一字体文件，打包内置字体 |
| `frameReady` 不稳定 | 视频 seek 修正 + 双 rAF + 字体预加载；POC-1 专项验证 |
| 硬件编码中途失败 | 自动回退软件编码，重跑整个 pass，进度文案提示 |
| 代理文件占空间 | 按 hash 缓存、项目关闭时统计、设置页可清理 |
| 时间线 schema 变更 | 只增不改、未知字段忽略、版本号预留 |
| whisper 组件构建 | 固定 whisper.cpp 版本与模型 sha256；Windows 二进制走 GitHub Actions，参照 depth runtime |
| 本地转写性能 | 默认 base + CPU；small / medium 可选，首次转写显示预估耗时 |
| 素材节点过多连线杂乱 | 上传自动放进「剪辑室素材 N」组；后续可做「折叠素材连线」 |

## 12. 验收

### P0

- `TimelineCommand` 全部有单测，`applyCommand` 不修改入参。
- 撤销 / 重做覆盖所有命令，`batch` 只占一个历史步。
- 所有时间字段为毫秒整数，反复 trim / 切割后无浮点漂移。
- 插入 / 覆盖、ripple、主轨磁性、linkage 各有单测用例。

### P1

- 可完成：导入素材 → 拖入时间线 → 裁剪 → 切割 → 加字幕 → 播放预览。
- 剪辑室展开时画布快捷键不触发。
- 任意图片 / 视频 / 音频 / 文本节点的「剪辑室」按钮可创建节点、自动连线并打开剪辑室。
- 从剪辑室上传素材后，画布出现素材组并已连线。
- 节点工具栏在 360px 图片节点、480px 视频节点上不换行、不遮挡。
- 剪辑室浮窗在 1280×800 窗口下五个区域完整显示，不出现整页滚动。
- 左侧素材池、右侧检查器可折叠，折叠后时间线不跳位。
- 时间线高度可拖拽，范围 25%–60%。
- 从素材池拖入默认插入，`Alt` 覆盖；拖动过程只显示预览，松手才产生一条撤销记录。
- 磁性开启时删除主轨片段自动闭合，字幕与音效靠 linkage 跟随。
- 时间线缩放范围：最窄显示 1 秒，最宽 4 倍片长；空时间线默认 30 秒跨度。
- 100+ 片段拖动时不掉帧，缩略图与波形不重复解码。

### P2

- 导出 1080p MP4，画面与预览逐帧一致（抽样 10 帧，像素差异低于阈值）。
- 4K 导出可完成，耗时可接受，无内存溢出；3 分钟片导出内存不持续增长。
- Canvas 预览与导出在同一时间点绘制结果一致。
- 纯拼接走快速路径，耗时不高于片长的 0.2 倍。
- 导出可取消，取消后无残留临时文件。

### P3

- 字幕样式与预览一致。
- 字幕可导出为独立 VTT，时间轴与时间线一致。
- 音频无爆音，淡入淡出正确。
- 交叉淡化与黑场转场正确。
- 变速片段音画同步。

### P4 / P5

- whisper 组件可下载、卸载、切换档位；未安装时「自动字幕」正确引导到设置页。
- 转写生成字幕轨，时间戳与音频误差不超过 0.2 秒。
- 分镜组一键成片后，时间线可直接播放和导出。
- 文案成片可匹配到正确镜头，匹配理由可见。
- 所有 AI 改动可一次撤销。

### 全局

- `corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 通过。
- 旧项目打开、编辑、保存不受影响。

## 13. 待决策 / 待观察

已定：4K 首发包含；字幕允许独立 VTT 导出；下载 / 入库保持常驻。

待定：

1. 剪辑室节点默认尺寸 360×240，先做出来看画布观感再调整。
2. 工具栏先按 6 主操作 + 下载 + 入库常驻实装，实装后如果太长再收进「更多」或改图标模式。
3. P2 是否多窗口并行导出，等 POC-1 的单窗口数据出来再决定。

## 14. 文档变更规则

方案变更先改本文档，再改代码。实现中发现与文档不一致的地方，以文档修订记录为准，不允许代码先行后补文档。
