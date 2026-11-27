# 导演台手绘路径与运镜计划

日期：2026-11-27
状态：已实施（P0/P1/P2 核心；多路径叠加、Shift 垂直平面、路径预设未做）
适用版本：v0.5.3

## 1. 背景

导演台现有「手绘运镜」只能画一条直线，松开后生成三个相机关键帧，只平移取景目标；线不保留，也不显示在 3D 场景中。用户需要类似 libtv 的自由曲线运镜：

- 画 S 形曲线，相机沿曲线运动；
- 人物/龙等对象沿绘制的路径运动；
- 相机可以跟随对象，也可以单独为运镜画线；
- 相机路径与对象路径用颜色区分；
- 路径可以打时间关键帧，控制两帧之间的速度。

同时修复一个回归：打开导演台后，右上角窗口控制按钮（主题、设置、最小化、最大化、关闭）无法点击。

## 2. 当前实现与问题

### 2.1 手绘运镜

| 位置 | 现状 |
|---|---|
| `StageWindow.tsx:126-128` | `drawMoveOpen`、`drawStartRef`、`drawLine` 三个状态 |
| `StageWindow.tsx:795-804` | 「手绘运镜」按钮，切换 `drawMoveOpen`，只做 `primary` 高亮 |
| `StageWindow.tsx:991-1035` | 视口覆盖层，SVG 只画一条 `<line>` |
| `StageWindow.tsx:384-420` | 松开后按屏幕位移生成 3 个相机关键帧，只平移 `camera.target`，相机位置不变 |
| `StageViewport.tsx:383-407` | 动作轨只应用 `pose`，没有应用 `position`/`rotation` |
| `stage-render.ts:221-251` | 导出渲染已经应用 `position`/`rotation`，视口与导出不一致 |
| `stage-schema.ts:53-72` | `CameraKeyframe`、`ActionKeyframe`、`ActionTrack` 已支持位置/朝向/姿势 |
| `stage-schema.ts:237-238` | 相机关键帧上限 100，动作关键帧上限 500 |
| `stage-timeline.ts` | `sampleCameraTrack` 已支持 Hermite 插值 |
| `stage-commands.ts:656-748` | `setCameraTrack`、`setActionTrack` 可写入关键帧 |

结论：现有功能不是路径运镜，只是一次性的取景目标平移；没有路径数据、没有 3D 显示、没有对象路径和跟随。

### 2.2 窗口按钮

`WindowDragStrip` 为 `absolute inset-x-0 top-0 h-10 [-webkit-app-region:drag]`，覆盖顶部 40px 全宽，包括右上角 `WindowControls`。`WindowControls` 自身是 `no-drag`，但落在 drag 区域内时，Electron 优先把鼠标交给窗口拖动，按钮点击被吞掉。

## 3. 目标

- 进入手绘模式后有明确状态提示，用户知道当前在画什么；
- 支持自由曲线（S 形、回环等），不再限制直线；
- 路径持久化并显示在 3D 场景中；
- 相机沿路径运动，对象沿路径运动；
- 支持镜头跟随对象；
- 相机路径、对象路径、跟随路径颜色区分；
- 路径点支持时间关键帧和段内缓动，控制两帧之间的速度；
- 旧项目的 `cameraTrack` / `actionTracks` 继续兼容。

## 4. 已确认决策

| 项 | 决策 |
|---|---|
| 时间控制 | 独立 `timeKeys`（按归一化弧长 `at` 绑定）+ 段内 `easing`；默认自动匀速 |
| 高度 | 默认投影到当前对象/相机水平面；路径属性调整整体高度；P2 再加控制点高度 |
| 相机朝向 | 默认看向路径前方（look-ahead 约 2m），可切「固定目标」或「跟随对象」 |
| 路径与手动关键帧 | 路径基础 + 手动覆盖；路径重建只替换 `source: 'path'` 的关键帧，保留手动关键帧 |
| 路径编辑 | P1 整体调整 + 时间关键帧；P2 控制点拖拽/插入/删除/闭合 + 速度曲线 |
| 旧直线入口 | 移除，旧关键帧继续兼容 |
| 窗口按钮 | `WindowDragStrip` 右侧留出窗口控制按钮宽度 |

## 5. 交互设计

### 5.1 模式与状态

顶部「手绘运镜」改为模式选择：

```text
[相机路径] [对象路径] [跟随目标]
```

- 当前模式高亮；
- 再次点击当前模式或按 Esc 退出；
- 进入模式后视口顶部显示常驻提示：
  - 相机路径：`手绘相机路径 · 按住左键拖动 · 松开生成 · Esc 退出`
  - 对象路径：`手绘「对象名」的运动路径 · 松开生成 · Esc 退出`
  - 跟随目标：`选择要跟随的对象，再绘制相机路径`
- 光标切换为 `crosshair`；
- 视口右侧出现「路径」列表。

### 5.2 绘制

- 按住左键自由拖动，按移动距离采样（每 4–6px 一个点）；
- 拖动中实时显示曲线预览；
- 松开后：
  1. 对采样点做 Catmull-Rom 平滑；
  2. 屏幕点通过 raycaster 投影到 3D 平面，得到世界坐标；
  3. 生成 `StagePath` 并持久化；
  4. 自动生成相机关键帧或对象动作关键帧。
- 每条路径 ≤200 点，每镜头 ≤20 条路径；
- 低角度视角下射线与地面夹角过小时忽略该点，避免远点飞掉。

### 5.3 路径显示

`StageViewport` 新增 `pathsGroup`：

- 相机路径：`--accent`（蓝）；
- 对象路径：`--success`（绿）；
- 跟随路径：`--warning`（橙）；
- 绘制曲线 + 控制点小球 + 沿路径方向箭头；
- 选中路径加粗/发光，未选中半透明；
- 路径列表可控制显示/隐藏。

### 5.4 相机路径

生成 `cameraTrack`：

- 相机位置沿路径采样；
- 采样数 ≤100（`STAGE_LIMITS.maxCameraTrackKeys`）；
- 默认 `target` 看向路径前方约 2m（look-ahead）；
- 目标模式可选：`路径前方` / `固定目标` / `跟随对象`；
- `cameraSmoothing: 'hermite'`，急转弯限制切线避免过冲。

### 5.5 对象路径

选中对象后画线，生成 `ActionTrack`：

- 位置关键帧沿路径采样（≤500，`STAGE_LIMITS.maxActionTrackKeys`）；
- 朝向默认沿切线（龙头朝飞行方向），可切「保持当前朝向」；
- 与现有 `pose` 关键帧合并：位置/旋转写位置关键帧，姿势关键帧保留；
- 补上 `StageViewport` 的 `position`/`rotation` 应用，保证视口与导出预览一致。

### 5.6 镜头跟随

优先采用「生成关键帧时跟随」：

- 相机路径的每个采样点，`target = 对象在该时间的路径位置 + 高度偏移`；
- 导出和视口行为一致，不依赖播放循环；
- `follow` 路径可作为独立的跟随目标路径，颜色为橙色。

### 5.7 路径列表与编辑

路径列表/属性面板支持：

- 类型、绑定对象、点数；
- 显示/隐藏、删除；
- 整体高度偏移；
- 平滑度（0–1）；
- 时间模式：自动匀速 / 手动时间关键帧；
- 闭合/断开（P2）；
- 控制点拖拽、插入/删除点（P2）。

### 5.8 时间关键帧

路径的几何采样点与时间节点分离：

```ts
interface StagePathTimeKey {
  at: number        // 0..1，归一化路径弧长
  timeMs: number
  easing?: StageEasing
}
```

- 默认起点/终点两个时间节点，自动按弧长匀速分配；
- 可插入中间节点，手动设置时间与段内缓动；
- 两帧之间的速度由时间差决定；
- 段内 `easing` 支持 `linear` / `easeIn` / `easeOut` / `easeInOut`；
- 时间节点必须严格递增；需要停顿时，用两个相邻节点相同 `at`、不同时间实现；
- P1 提供简化时间轴：横向条拖动节点 + 三列表格；
- P2 提供速度曲线编辑器。

## 6. 数据模型

在 `stage-schema.ts` 新增：

```ts
export type StagePathKind = 'camera' | 'object' | 'follow'

export interface StagePathPoint {
  position: StageVec3
}

export interface StagePathTimeKey {
  at: number
  timeMs: number
  easing?: StageEasing
}

export interface StagePath {
  id: string
  name?: string
  kind: StagePathKind
  objectId?: string
  points: StagePathPoint[]
  timeKeys?: StagePathTimeKey[]
  closed?: boolean
  smooth?: number
  color?: string
  visible?: boolean
  createdAt: string
}
```

`CameraKeyframe` 增加：

```ts
source?: 'path' | 'manual'
```

`StageShot` 增加：

```ts
paths?: StagePath[]
```

路径是编辑源数据；`cameraTrack` / `actionTracks` 是生成的播放/导出数据。路径重建只替换 `source: 'path'` 的关键帧，保留 `source: 'manual'` 的手动关键帧；同一时间点手动关键帧优先。旧项目没有 `paths` 时继续按现有关键帧播放。

新增限制：

- `maxPathsPerShot: 20`
- `maxPathPoints: 200`
- `maxPathTimeKeys: 32`

## 7. 命令与关键帧生成

`stage-commands.ts` 新增：

- `addPath`：新增路径；
- `updatePath`：修改路径点/属性；
- `removePath`：删除路径；
- `setPathVisible`：显示/隐藏。

生成逻辑放在新增的 `src/shared/stage-paths.ts`：

- `smoothPath(points)`：Catmull-Rom 平滑；
- `samplePathByTime(path, durationMs)`：按 `timeKeys` 采样；
- `cameraTrackFromPath(...)`：生成 `CameraKeyframe[]`，标记 `source: 'path'`；
- `actionTrackFromPath(...)`：生成 `ActionTrack`；
- `mergeCameraTrack(existing, generated)`：保留 `source: 'manual'` 的关键帧，同一时间点手动优先；
- `followCameraTrackFromPaths(...)`：相机路径 + 对象路径合成 target。

约束：

- 路径变更后只重建 `source: 'path'` 的相机关键帧，保留手动关键帧；
- 对象路径只覆盖该对象的 position/rotation 关键帧，保留 pose；
- 生成的关键帧数量不超过现有上限；
- 旧 `cameraTrack` 不被自动删除，除非用户明确重新生成路径；
- 路径重画前弹窗：保留手动关键帧 / 全部覆盖。

## 8. 3D 渲染与坐标

- `StageViewport` 新增 `pathsGroup`，用 `Line2` + `LineGeometry` + `LineMaterial` 渲染，线宽可调；
- 路径线 `depthTest: false`，始终可见；
- 相机路径 `#60a5fa`、对象路径 `#4ade80`、跟随路径 `#f59e0b`，固定语义色；
- 控制点按弧长/曲率抽稀到 8–16 个，时间节点单独标记；
- 屏幕点投影：raycaster 与当前对象/相机目标的水平面求交，`y` 取对应对象/相机高度；
- 路径属性提供整体高度偏移；
- 只渲染当前镜头 `visible` 的路径；路径几何在数据/显示变化时重建，播放时不重建；
- Shift 垂直平面绘制不在本次范围，后续再评估。

## 8.5 实施结果

已实现：

- `WindowDragStrip` 右侧留 200px，导演台/剪辑室等全屏面板打开时窗口按钮可点击；
- `StagePath` / `StagePathTimeKey` / `CameraKeyframe.source` 数据模型与校验；
- `addPath` / `updatePath` / `removePath` / `setPathVisible` 命令；
- 导演台自由曲线绘制、相机路径/对象路径/跟随路径模式、顶部提示与 Esc 取消；
- `StageViewport` 用 `Line2` 渲染 3D 路径、控制点与时间节点，屏幕点到水平面投影；
- 相机沿路径、对象沿路径、look-ahead、跟随对象/路径、手动关键帧保留；
- 右侧路径列表、显示/隐藏、删除、名称、高度、平滑度、时间节点、速度曲线、控制点末尾增删与闭合；
- `StageViewport` 补上动作轨位置/旋转插值，视口与导出预览一致。

未做（按本轮范围排除）：

- 多路径叠加；
- Shift 垂直平面绘制；
- 路径预设。

验证：`pnpm typecheck`、`pnpm test`、`pnpm check:ui`、`pnpm check:docs` 通过；隔离实例实测相机路径绘制、对象路径绘制、3D 彩色路径显示、时间节点插入和窗口按钮点击。

注意：路径线仅视口辅助，不进入导出视频/截图；导出仍走 `cameraTrack` / `actionTracks`。

## 9. 分阶段实施

### P0：按钮修复 + 状态提示 + 自由曲线 + 相机路径

1. `WindowDragStrip` 右侧留 200px，修复窗口按钮；
2. `StageWindow` 手绘模式重构：模式选择、常驻提示、Esc 退出、pointer 采样、曲线预览；
3. 新增 `StagePath` 数据模型、命令和校验；
4. `StageViewport` 路径渲染 + 屏幕点到 3D 投影；
5. 相机路径生成 `cameraTrack`，播放验证。

### P1：对象路径 + 跟随 + 路径列表 + 时间关键帧

6. 对象路径生成 `ActionTrack`；
7. 补 `StageViewport` 的 `position`/`rotation` 应用；
8. `follow` 模式 + 镜头跟随对象；
9. 路径列表、颜色区分、显示/隐藏、删除；
10. 路径属性：整体高度、平滑度、时间关键帧、段内缓动；
11. 路径基础 + 手动覆盖合并：路径重建保留 `source: 'manual'` 关键帧，同一时间点手动优先。

### P2：路径编辑增强（本次一起做）

12. 控制点拖拽、插入/删除点、闭合；
13. 速度曲线编辑器；
14. 导出预览与视口一致性回归。

多路径叠加、Shift 垂直平面、路径预设不在本次范围。

## 10. 文件改动

| 文件 | 改动 |
|---|---|
| `src/renderer/src/components/ui/WindowDragStrip.tsx` | 右侧留出窗口控制按钮宽度 |
| `src/shared/stage-schema.ts` | `StagePath` / `StagePathPoint` / `StagePathTimeKey`、`CameraKeyframe.source`、`StageShot.paths`、校验与限制 |
| `src/shared/stage-paths.ts` | 新增：平滑、时间采样、生成相机/对象关键帧、跟随、手动关键帧合并 |
| `src/shared/stage-commands.ts` | 新增路径命令与关键帧重建 |
| `src/shared/__tests__/stage-paths.test.ts` | 路径平滑、时间映射、关键帧生成、跟随测试 |
| `src/renderer/src/stage/StageWindow.tsx` | 手绘模式、提示、采样、路径列表、属性 |
| `src/renderer/src/stage/StageViewport.tsx` | 路径渲染、投影、actionTracks 位置/旋转、控制点拖拽 |
| `src/renderer/src/stage/stageStore.ts` | `drawMode`、`selectedPathId`、路径 CRUD 与关键帧重建 |
| `src/renderer/src/stage/StagePathInspector.tsx` | 路径列表、属性、时间节点、速度曲线、控制点增删/闭合 |
| `src/renderer/src/stage/stage-path-bridge.ts` | 视口屏幕点 → 3D 投影桥接 |
| `src/shared/stage-snapshot.ts` | 场景快照增加路径摘要 |
| `src/renderer/src/stage/stage-render.ts` | 导出路径/动作轨一致性（如需要） |
| `docs/code-map/04-director-stage.md` | 实施后更新状态与证据 |
| `docs/code-map/08-capabilities.md` | 实施后更新能力清单 |
| `docs/code-map/10-ui.md` | 实施后更新 UI 能力 |

## 11. 验收

- 打开导演台后，右上角 5 个窗口按钮全部可点击；
- 点击手绘模式后，按钮高亮、视口有常驻提示、光标变 crosshair；
- 能自由画 S 形曲线，松开后 3D 场景显示彩色路径；
- 播放时相机沿路径运动；对象沿对象路径运动；开启跟随后相机始终对准对象；
- 相机路径与对象路径颜色不同，路径列表可删除/隐藏；
- 路径点可设置时间关键帧，两帧之间速度符合预期；
- 路径速度关键帧与手动相机关键帧可共存，路径重建保留手动关键帧；
- 控制点拖拽/插入/删除/闭合、速度曲线可用（P2）；
- 路径线不出现在导出视频、截图和整片中；
- 视口播放与导出预演一致；
- 旧项目、旧相机关键帧不受影响；
- `pnpm typecheck`、`pnpm test`、`pnpm check:ui`、`pnpm check:docs` 通过。

## 12. 风险与非目标

### 风险

- 屏幕点到 3D 平面投影在低角度视角不稳定，需要夹角阈值；
- Hermite 插值在急转弯可能过冲，需要限制切线或先平滑采样；
- 手动关键帧插在路径中间会分割路径插值，需要提示；路径重建默认保留手动关键帧，用户可选择全部覆盖；
- `Line2` 的 `resolution` 需要随视口尺寸更新，否则缩放后线宽异常；
- 控制点拖拽与 `OrbitControls` 可能争抢 pointer，需要拖拽时禁用轨道控制；
- `StageDoc` schema 变更需要兼容旧项目；
- 路径点过多会影响播放和绘制性能，需要限制；
- 视口与导出渲染的动作轨应用需要保持一致。

### 非目标

- 不做任意曲面上的 3D 自由绘制；
- 不做物理模拟或碰撞；
- 不做多路径混合/约束求解；
- 不做路径上的粒子或特效。
