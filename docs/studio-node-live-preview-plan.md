# 剪辑室节点实时预览方案

> 状态：方案已确认，待实施
> 日期：2026-11-18
> 适用版本：v0.2.1
> 最后核对：2026-11-18
> 涉及：`src/renderer/src/studio/`、`src/renderer/src/canvas/nodes/`、`src/main/ipc/timeline.ts`、`src/main/timeline/export.ts`、`src/preload/index.ts`、`src/shared/ipc-contract.ts`

## 1. 背景与问题

参照 LosslessCut「编辑即可见、导出是独立显式动作」的交互，对照当前实现发现一个明显的体验断点：

- 剪辑室内部已有完整的实时时间线渲染器，剪辑时可以即时看到任何修改（转场、变速、画中画、关键帧曲线都支持）。
- 但**画布上的剪辑室节点**只显示成片文件：`StudioNodeView.tsx:70` 的 `assetSrc = current ? assetUrl(current.path, current.scope) : null`，预览区是 `<video src={assetSrc}>`（`:303`）。
- 没有成片时节点显示「成片待生成 / 点下方生成成片」（`:338`）。也就是说，**用户必须先把成片渲染成 mp4，才能在画布上看到剪辑结果**。

这带来三个具体问题：

1. 每改一次就要重新生成成片才能看到效果，反馈循环很长。
2. 画布上被大量中间成片文件填满，版本栈变成「为了预览而存在的快照」。
3. CineBot 改完时间线后，用户在画布上看不到变化，无法形成「下指令 → 立刻看到结果 → 再改」的多轮循环（与 backlog 的「多轮修改与方案 diff / M4」直接相关）。

此外，**用户实测反馈**：画布上显示的视频节点一多，画布就会明显卡顿，缩小时尤其严重。根因不是"视口外也在解码"——React Flow 已开启 `onlyRenderVisibleElements`（`Canvas.tsx:527`），视口外节点本来就不渲染——而是**缩小后所有节点都落进视口**，每个都挂载 `<video preload="metadata">` 并在 `loadedmetadata` 时强制解码首帧（`VideoPlayer.tsx:76`），同时持有解码器。这是实时预览体验的前提障碍，必须先治理（见 §5 阶段零）。

## 2. 目标与非目标

### 目标

- 剪辑室节点在**不生成成片**的情况下，直接显示时间线当前内容的预览。
- 导入多个素材、在剪辑室里完成剪辑后，关闭剪辑室，画布节点仍显示最新剪辑结果。
- 「生成成片」退化为**只在需要导出文件时才点**的显式动作（命名改为「导出成片」）。
- 不破坏现有导出链路、成片版本栈、`upstreamAck` / `stale` 语义。
- **先解决画布视频节点过多的卡顿**：默认只显示封面图，点击才加载视频，同时最多 4 个在播，让真实解码数量与"屏幕上有多少节点"脱钩。
- 导出版本支持删除，并清理对应文件与失效连线。

### 非目标

- 不改导出结果：同一份 doc 导出的视频必须字节级一致。
- 不在画布节点里做完整剪辑交互（裁剪、加字幕等仍进剪辑室）。
- 不引入新的状态管理库或渲染引擎。
- 不做旧项目兼容（当前无外部用户，`previewMode` 一类兼容字段直接不加）。
- 不为性能修复加全局设置项（如"画布自动预览视频"）。

## 3. 现状与代码依据

### 3.1 可复用的渲染能力

| 位置 | 现状 |
|---|---|
| `studio/renderer.ts:21` | `createPools()`：创建/管理 `HTMLVideoElement` 池、代理 Map、失败集合 |
| `studio/renderer.ts:337` | `renderTimeline({ctx, doc, timeMs, pools, playing})`：完整实时渲染，无任何 store 依赖 |
| `studio/renderer.ts:470` | `waitForMedia(doc, timeMs, pools)`：等待素材 seek 就绪 |
| `studio/renderer.ts:516` | `renderFrameToDataUrl(doc, timeMs)`：单帧渲染为 PNG，已用于 AI 预览/缩略图 |
| `studio/renderer.ts:7` | `MEDIA_READY_EVENT`：媒体就绪后广播的 window 事件 |
| `studio/PreviewStage.tsx` | 剪辑室预览组件，复用 `createPools` + `renderTimeline`，但**强耦合 `useTimelineStore`**，自带 rAF 播放循环与音频混音 |
| `canvas/nodes/StudioNodeView.tsx:102` | `loadStudioDoc()`：能在**不打开剪辑室**时通过 `window.api.timeline.load(timelineId)` 拿到 doc，并优先使用已打开剪辑室的 store doc |
| `preload/index.ts:247` | `media.thumbnail(path, atSeconds?, kind?)`：视频首帧/音频波形缩略图，已有接口 |
| `main/media/thumbnail.ts:55` | 缩略图主进程实现，供阶段零封面图复用 |

### 3.2 视频节点卡顿的现状依据

| 位置 | 现状 |
|---|---|
| `canvas/nodes/VideoPlayer.tsx:189` | 所有视频节点共用的播放器，内部是 `<video preload="metadata">` |
| `VideoPlayer.tsx:76` | `loadedmetadata` 时主动 `currentTime = 0.001` 强制解码首帧 |
| `canvas/Canvas.tsx:527` | React Flow 已开启 `onlyRenderVisibleElements`，视口外节点不渲染 |
| `canvas/nodes/CineNodeView.tsx:456`、`VideoOpNodeView.tsx:476`、`FilmStudyRoom.tsx:530`、`StudioNodeView.tsx:488` | 4 处使用 `VideoPlayer`，进入视口即挂载 `<video>` 并解码 |
| `VideoPlayer` 卸载 | 无 `pause()` + 清 `src` + `load()`，解码器不会及时释放 |
| `AudioPlayer.tsx:218` | 音频同样常驻视口内节点，`preload="metadata"`，无自动播放，卸载只移除监听不暂停 |

**结论**：缩小时视口内节点数量暴增，每个都挂载 `<video>` 并解码首帧，是卡顿主因；React Flow 的视口裁剪已经解决了"视口外"这一层，缺的是"缩放太小 + 同时数量上限 + 点击才加载"。

### 3.3 其他关键事实

| 位置 | 事实 |
|---|---|
| `main/timeline/export.ts:271-274` | 导出已默认写 `项目根/exports/成片-<时间戳>.mp4`，返回 `exports/xxx.mp4` |
| `main/ipc/export.ts:171-209` | `export:asset` 弹保存对话框后 `copyFile`，即「另存已有成片」，不触发渲染 |
| `studio/StudioWindow.tsx:172-181` | 剪辑室编辑是 **400ms debounce 自动保存**，不是关闭时才保存 |
| `stores/canvas/slices/assets.ts:31-49` | `applyStudioOutput` 把新版本插到最前并 `.slice(0, 20)`，运行时上限 20，无删除入口 |
| `shared/project-schema.ts:167` | 持久化 `outputs` 上限 100 |
| `shared/canvas-schema.ts:96` | 剪辑室 `references: Record<nodeId, outputId>`，记录时间线引用的上游节点与版本 |
| `main/index.ts:74-86` | 单实例锁、单一主窗口；仅额外创建导出用隐藏渲染窗口 |

## 4. 总体设计

### 4.1 核心决策

把 `PreviewStage` 拆成两层，剪辑室和画布节点共用同一套渲染内核：

```
renderer.ts  (纯函数渲染内核，无 store)
     │
     ├── TimelineCanvas.tsx   (新增，无 store 的 React 渲染组件)
     │        │
     │        ├── PreviewStage.tsx      (剪辑室用：接 store + 播放控制 + 音频)
     │        └── NodePreview.tsx       (新增，画布节点用：doc 来自 IPC，静音，可限帧)
     │
     └── renderFrameToDataUrl()         (导出/AI 预览继续用，行为不变)
```

**节点与剪辑室不分离**：仍是一对一绑定，变的只是节点画面的数据来源——从「读导出的 mp4」改为「直接读时间线 doc 自己画」。剪辑室的时间线预览器复制一份到节点上，两边用同一份数据。节点关系、删除/复制、上游联动、版本栈、导出功能全部保留。

### 4.2 渲染内核：不改 `renderTimeline`，通过 canvas 尺寸缩放

核查 `renderer.ts` 后确认：所有绘制都以 canvas 物理尺寸为基准，字号用 `ratio = canvas.height / doc.video.height` 计算（`renderer.ts:195`），`drawMedia` 也用 `ctx.canvas.width/height` 计算绘制尺寸。因此**只要把 canvas 的宽高设为 `doc.video.width/height × renderScale`，整幅画面（含文字）就会等比缩小，渲染内核一行都不用改**。

- 导出路径仍使用 `doc.video.width/height` 的全尺寸 canvas，行为完全不变。
- 节点预览使用 `renderScale`（0.25~0.5）的小 canvas，CSS 放大显示。
- 这比原计划"给 `renderTimeline` 加 `scale` 参数"风险更低，不需要动任何绘制函数。

### 4.3 新增 `TimelineCanvas.tsx`（无 store 依赖）

路径：`src/renderer/src/studio/TimelineCanvas.tsx`

```ts
export interface TimelineCanvasProps {
  doc: TimelineDoc
  timeMs: number
  playing?: boolean          // 默认 false
  useProxy?: boolean         // 默认 true，540p 代理
  renderScale?: number       // 默认 1；节点预览传 0.25~0.5
  onMediaReady?: () => void
}
```

职责：

- 创建并持有 `poolsRef = useRef(createPools())`，组件卸载时释放所有 `HTMLVideoElement`（`pause()` + 移除 `src` + `load()`）并清空 `proxies` / `videos` / `failed`。
- `doc` / `timeMs` / `playing` / 代理就绪变化时调用 `renderTimeline`。
- 监听 `MEDIA_READY_EVENT` 触发重绘（沿用现有机制）。
- 代理加载逻辑从 `PreviewStage` 搬过来，按 `proxySignature` 去重，避免位置变化重复请求。
- **不依赖 `useTimelineStore`、不管理播放时钟、不播放音频**。

### 4.4 `PreviewStage` 改为薄封装

保持剪辑室行为不变：继续订阅 `useTimelineStore` 的 doc / playheadMs / playing，继续负责 rAF 播放循环和音频混音，渲染部分替换为 `<TimelineCanvas doc={doc} timeMs={playheadMs} playing={playing} />`。

音频逻辑抽成 `useTimelineAudio({ doc, playing, startMs })` hook（从现有 `PreviewStage` 代码原样提取），供剪辑室和「节点大预览」复用。

### 4.5 节点预览实现（实际落在 `StudioNodeView` 内）

> 实现说明：最终未单独创建 `NodePreview.tsx`，节点预览、播放时钟与名额占用直接实现在 `StudioNodeView.tsx`。下方接口保留为设计参考，若后续要复用到其他节点再抽组件。

```ts
export interface NodePreviewProps {
  timelineId: string
  studioNodeId: string
  clipCount: number
  posterSrc: string | null   // 现有 assetSrc，作为兜底
}
```

行为：

1. **取 doc**：调用现有 `loadStudioDoc()` 的纯函数版本（拆掉 toast 副作用）：
   - 若该剪辑室正在打开 → 直接读 `useTimelineStore` 的 doc（含未保存编辑）；
   - 否则 → 先查渲染进程缓存，未命中再 `window.api.timeline.load(timelineId)`。
2. **静态封面固定第 0 帧**：doc 可用且 `clips.length > 0` → 渲染 `<TimelineCanvas doc timeMs={0} playing={false} renderScale={0.35} />`。首次呈现不依赖 `waitForMedia`（先画能画的，媒体就绪事件会触发重绘）。
3. **降级**：doc 加载失败 / 空时间线 → 显示 `posterSrc`（成片视频）或空状态。
4. **播放**（阶段二）：只有点击播放按钮才进入 rAF；从第 0 帧开始；暂停保持当前帧；播完回到第 0 帧；限帧 ~15fps；离开视口立即暂停并卸载。
5. **音频**：节点小窗强制静音；点开大预览时默认「实时预览」+ 出声，「导出版本」为第二 tab。
6. **不使用 `previewMode`**：节点小窗固定实时预览，"看导出版本"只在大预览的 tab 里。

### 4.6 时间线变更通知

现有 `timeline:save` 只落盘，没有广播。新增一条轻量事件：

**主进程** `src/main/ipc/timeline.ts`：

```ts
// timeline:save 成功后，只发给发起保存的窗口
if (!event.sender.isDestroyed()) {
  event.sender.send('timeline:changed', { timelineId: id, at: Date.now() })
}
```

**契约** `src/shared/ipc-contract.ts`：在 `TimelineApi` 增加
`onTimelineChanged(listener: (payload: { timelineId: string; at: number }) => void): () => void`

**Preload** `src/preload/index.ts`：用 `ipcRenderer.on` / `removeListener` 包装，返回取消订阅函数。

**渲染进程**：`StudioNodeView` 订阅该事件，按 `timelineId` 过滤，**100ms debounce 合并**（编辑是 400ms 自动保存，CineBot 多轮修改也会连续触发），然后重新取 doc。**剪辑室打开时跳过刷新**（画布被覆盖、不可见），关闭剪辑室时统一刷新一次。

> 注意：`timeline:changed` 只用于刷新预览，不改变 `filmStatus`。导出版本的过期判断仍走现有 `upstreamAck` + `UpstreamWatcher`。

### 4.7 状态模型解耦

**不改 `FilmStatus` 枚举值**（`shared/canvas-schema.ts` / `project-schema.ts`）。`filmStatus` 只表示「导出版本状态」，节点文案调整：

| 值 | 原语义 | 新文案 |
|---|---|---|
| `ready` | 成片就绪 | 导出版本就绪 |
| `stale` | 成片过期 | 导出版本已过期 |
| `pending` | 待生成 | 尚未导出 |
| `missing` | 成片缺失 | 导出文件缺失 |

预览区与状态条的职责分离：**上面是实时预览（永远最新），底部状态条是导出版本状态**。不新增 `previewMode` 字段。

## 5. 分阶段实施

**发布策略**：四个阶段一次性开发完成，版本发布由用户自行决定，不按阶段分批发布。

### 阶段零：画布视频节点性能治理（前置）

**心智模型**：默认只显示封面图，**点击播放按钮才加载视频**；同时最多 4 个在播。真实解码数量与「屏幕上有多少节点」脱钩。

**为什么必须前置**：缩小时视口内节点数量暴增，每个都挂载 `<video>` 并强制解码首帧；不先治理，后续节点实时预览只会更卡。

规则：

1. **默认封面**：所有视频节点默认渲染 `<img>` 封面（`window.api.media.thumbnail(path, 0, 'video')`），不挂载 `<video>`。音频节点默认不播。
2. **点击才播**：只有点击播放按钮才挂载 `<video>` 并播放（优先 540p 代理），无 hover 自动播放。
3. **缩得太小只看封面**：画布缩放 < 0.5，或节点在屏幕上宽 < 200px 时，只显示封面并隐藏播放按钮。
4. **同时最多 4 个在播**：素材 `<video>` 与剪辑室 canvas 预览**共享** 4 个名额；第 5 个开始播放时自动暂停最早播放的，并 toast 提示。
5. **复用 React Flow 的视口裁剪**：不另写 `IntersectionObserver`，在 `onlyRenderVisibleElements` 之上叠加 `viewport.zoom` + 节点屏幕尺寸 + 全局播放计数。
6. **音频**：默认不播、点击才播；全局最多 1 个出声源。
7. **卸载释放**：`VideoPlayer` / `AudioPlayer` 卸载时 `pause()` + `removeAttribute('src')` + `load()`。

- 改动：
  - 新增 `VideoPreview` 包装组件：默认渲染封面 `<img>`；点击播放后挂载 `<VideoPlayer>`；缩得太小时隐藏播放按钮。
  - 新增播放名额管理（渲染进程单例 store 或 context）：记录当前播放中的节点，超限时暂停最早的。
  - 接入 `CineNodeView`（素材视频节点）与 `VideoOpNodeView`（视频操作展开区）。
  - 例外：`FilmStudyRoom`（拉片室专用播放器，用户主动进入且通常单实例）与 `StudioNodeView` 大预览（模态弹窗，用户主动打开）保留 `VideoPlayer`，不在阶段零门控。
  - `AudioPlayer` 接入全局"最多 1 个出声源"。
  - `VideoPlayer` / `AudioPlayer` 补卸载清理；`play()` 增加 catch，避免挂载后立即播放产生未处理的 Promise rejection。
- 验收（人工）：
  - 视口内 20 个视频节点，画布明显比现在流畅。
  - 缩到 50% 以下 → 全部显示封面，DOM 中无新的 `<video>` 元素。
  - 点击 5 个节点播放 → 第 5 个播放时最早的自动暂停并出现提示。
  - 滚出视口 / 关闭节点 → `<video>` 元素减少，不再累积。

### 阶段一：静态活封面

让节点不再显示「成片待生成」，而是直接显示时间线当前第 0 帧。

- 改动：`renderTimeline` 加 `scale`；新增 `TimelineCanvas.tsx`；`PreviewStage` 改用 `TimelineCanvas`；`StudioNodeView` 预览区优先渲染 `TimelineCanvas`，`loadStudioDoc` 拆出无副作用版本；新增 `timeline:changed` 全链路；新增渲染进程 doc 缓存（`Map<timelineId, doc>` + LRU 上限 20，`timeline:changed` 按 id 失效）；剪辑室打开时跳过刷新、关闭时统一刷新；去掉 `previewMode`。
- 验收（人工）：
  - 导入 3 个视频进剪辑室，剪切/改序后关闭剪辑室，节点显示新顺序的第 0 帧，全程未点「导出成片」。
  - CineBot 执行剪辑指令后，关闭剪辑室时画布节点刷新到新画面。
  - 画布上有 10 个剪辑室节点时，来回滚动不重复读盘（doc 缓存命中）。
  - 同一 doc 导出的视频与改动前 hash 一致。

### 阶段二：节点内轻量实时播放（已实现，音频待补）

- 已实现：
  - 节点内点击播放/暂停，从第 0 帧开始，播完回到第 0 帧；暂停保持当前帧。
  - 15fps 限帧（`now - lastDraw >= 66ms` 才推进播放头）。
  - 节点内播放通过 `playbackBudget` 占用一个视频名额。
  - 节点小窗静音（`TimelineCanvas` 只绘制画面，不播放音频）。
  - 大预览改为「实时预览 / 导出版本」双 tab，默认实时预览；实时预览复用同一套播放状态。
  - `useTimelineAudio` 已从 `PreviewStage` 抽出，大预览实时预览可出声，并占用全局唯一出声名额。
  - 打开大预览时自动暂停节点小窗播放；关闭大预览或切到「导出版本」时释放出声名额。
- 已知限制：
  - 未单独创建 `NodePreview.tsx`，节点内播放直接实现在 `StudioNodeView` 中；如后续需要复用到其他节点再抽组件。
- 验收（人工）：
  - 节点上点播放能看到时间线连续播放，画面与剪辑室预览一致。
  - 从第 0 帧开始；暂停保持当前帧；播完回到第 0 帧。
  - 播放 5 个剪辑室节点 → 第 5 个开始时最早的自动暂停。
  - 节点小窗没有声音；大预览可切换实时预览/导出版本。
  - 关闭/重开项目后预览仍可用（doc 从 `timelines/<id>.json` 重新加载）。

### 阶段三：成片降级为导出快照

**心智模型**：剪辑完成即可在节点上实时预览，**只有点击「导出成片」才真正渲染并写出 mp4**。导出的文件是「快照」，加入 `outputs` 版本栈；节点上「实时预览」永远反映最新编辑态，「导出版本」只看已固化的快照。

**命名决策**：动词由「生成」改为「导出」，保留「成片」作为产物名词。理由：与 Agent 已有的 `timeline_export: '导出成片'`（`agent/panel/utils.tsx:53`）保持一致；节点上还有字幕/VTT/项目导出，纯「导出」太泛；`filmStatus` / `outputs` 都围绕「成片」这一概念。

- 导出与另存：
  - 「生成成片」→「**导出成片**」，默认存项目 `exports/`（现状已如此），不弹保存对话框。
  - 「下载成片」→「**另存成片**」，保留自定义位置（`export:asset` 弹保存对话框）。
- 版本删除：
  - 版本切换栏加垃圾桶按钮（仅多版本时显示），点击弹确认「将同时删除文件」。
  - 删除前扫描全画布引用计数：**仅当引用为 0 时删文件**；仍被其他节点引用则只移除当前节点引用并提示。
  - **有连线则删除对应连线**：扫描 source 指向该剪辑室节点的边，若下游引用的正是被删除的 `outputId`，删除该边；若下游仍引用其他版本，边保留。
  - 删除当前选中版本后，`selectedOutputId` 回退到相邻最新版本；没有版本时 `filmStatus = pending`。
- 导出时暂停预览：导出开始自动暂停所有节点预览/播放，并 toast「导出中，画布预览已暂停」；导出结束自动恢复并 toast「导出完成，预览已恢复」。
- 配套：按钮旁显示导出版本数；导出按钮降级为次要样式，实时预览作为节点主体。
- 已实现：
  - 文案替换：`StudioNodeView`、`StudioTopBar`、`NodeContextMenu` 的「生成成片」→「导出成片」，「下载成片」→「另存成片」。
  - 版本栏垃圾桶入口；删除前 `window.confirm` 确认。
  - 新增主进程 `export:delete-file`（路径限制在项目根内）+ preload/contract 暴露。
  - 删除前扫描全画布引用计数，仅引用为 0 时删文件；仍被引用则只移除引用并提示。
  - 删除后 `outputs` 为空时，删除所有 `source` 指向该剪辑室的边；`selectedOutputId` 回退到相邻最新版本；无版本时 `filmStatus = 'pending'`。
  - 导出开始时 `pauseAllPlayback()` + toast「导出中，画布预览已暂停」；结束时 toast「导出结束，画布预览已恢复」。
- 已知限制：
  - 画布边不带版本号，因此只有删除后 `outputs` 为空时才删边；仍有其他版本时保留边（下游可继续使用新选中版本）。
- 验收（人工）：
  - 导出成片后版本栈出现新版本，预览仍是最新编辑态。
  - 删除一个版本 → 文件与连线被正确清理；仍被其他节点引用时文件不删。
  - 导出过程中画布预览暂停且有提示，导出结束恢复。
  - 导出是唯一写 mp4 的显式入口。

#### 文案替换清单（需一次性改干净）

| 文件 / 位置 | 现在 | 改为 |
|---|---|---|
| `StudioNodeView.tsx:454` | 生成成片 / 重新生成 / 取消 | **导出成片 / 重新导出 / 取消导出** |
| `StudioNodeView.tsx:220` | 成片已生成：… | 已导出成片：… |
| `StudioNodeView.tsx:164` | 已取消生成成片 | 已取消导出 |
| `StudioNodeView.tsx:169` | 生成成片失败 | 导出失败 |
| `StudioNodeView.tsx:340` | 成片待生成 | 当前为实时预览 |
| `StudioNodeView.tsx:343` | 点下方「生成成片」 | 点下方「导出成片」保存为视频文件 |
| `StudioNodeView.tsx:29` | missing: 成片缺失 | 导出文件缺失 |
| `StudioNodeView.tsx:363` | 成片 | 导出版本 |
| `StudioTopBar.tsx:96` | 成片在画布节点生成 | 在画布节点导出成片 |
| `NodeContextMenu.tsx:318` | 下载成片 | **另存成片** |

保留不改（确实在操作已导出文件）：`StudioNodeView.tsx:322`「播放成片」、`:472`「把成片接到其他节点」、`delete-actions.ts` 中的成片保留/删除文案、`context-actions.ts:110` 注释、Agent 的「导出成片」工具名。

状态标签按 §4.7：`ready`→导出版本就绪、`stale`→导出版本已过期、`pending`→尚未导出、`missing`→导出文件缺失。

## 6. 性能与资源策略

### 6.1 默认封面与播放上限

- 所有视频节点默认只渲染封面 `<img>`，不挂载 `<video>`。
- 点击播放才挂载 `<video>`；素材节点与剪辑室 canvas 预览共享 **4 个**播放名额。
- 超限时自动暂停最早播放的节点并 toast；不阻止用户播放新节点。
- 缩到 50% 以下或节点屏幕宽 < 200px 时，只显示封面并隐藏播放按钮。

### 6.2 分辨率与帧率

- 节点 canvas 预览 `renderScale` 取 `0.25~0.5`（约 540p 绘制，CSS 放大），不按 `doc.video.width` 全分辨率绘制。
- 静态帧只在 doc / 播放头 / 媒体就绪变化时重绘；播放时限帧 ~15fps。
- 素材 `<video>` 由浏览器按视频自身帧率播放，**15fps 限帧不适用于 `<video>`**；素材节点靠"最多 4 个在播"控制。
- 复用已有 540p 代理生成与缓存（见 `PreviewStage` 的 proxy 逻辑）。

### 6.3 音频策略

- 节点小窗**强制静音并隐藏音量按钮**。
- 音频节点默认不播、点击才播。
- 全局最多 **1 个出声源**（音频节点或大预览）；新的出声自动静音上一个。
- 剪辑室内部预览可出声；大预览默认出声。

### 6.4 大预览与导出

- 大预览打开时暂停节点小窗播放（独占 + 避免双声）。
- 大预览用原片解码（质量优先，同时只有一个）。
- 导出时自动暂停所有节点预览/播放并 toast 提示；导出结束恢复。

### 6.5 生命周期

`createPools()` 创建的 `HTMLVideoElement` 必须在 `TimelineCanvas` 卸载时显式释放；`timeline:changed` 订阅、rAF、Media 事件监听都要在 cleanup 中注销；`VideoPlayer` / `AudioPlayer` 卸载时 `pause()` + 清 `src` + `load()`。多节点切换时不得累积 video/audio 元素。

## 7. 边界与异常

| 场景 | 处理 |
|---|---|
| 空时间线 | 显示空状态提示，不显示「导出成片」误导文案；`filmStatus` 设 `empty` |
| 素材文件缺失 | `pools.failed` 标记，该片段区域跳过绘制并提示；沿用现有 `missing` 标记 |
| 素材有新版本 | 沿用 `references` / `updateAvailable` 提示；预览用当前 doc 引用，不自动切版本 |
| doc 加载失败 | 回退到 `posterSrc`（成片）并显示错误 toast，不阻塞节点其他操作 |
| 剪辑室打开中 | 跳过画布节点刷新（不可见），关闭时统一刷新一次 |
| 导出进行中 | 暂停所有节点预览/播放并 toast；导出结束自动恢复 |
| 删除导出版本 | 引用计数为 0 才删文件；仍被引用只移除引用并提示；删除对应失效连线 |
| 删除当前版本后 | `selectedOutputId` 回退到相邻最新版本；无版本时 `filmStatus = pending` |

## 8. 测试与验证

由用户人工验收，不设量化帧率/内存门槛。实施时保留两项硬性回归：

- **导出零回归**：`renderTimeline` 传 `scale=1` 与改动前的导出结果做文件 hash 对照。
- **类型与单测**：`corepack pnpm typecheck`、`corepack pnpm test`。

人工验收清单：

1. 视口内 20 个视频节点 → 画布比现在流畅；缩到 50% 以下 → 全部封面、无新的 `<video>`。
2. 点击 5 个节点播放 → 第 5 个播放时最早的自动暂停并有提示。
3. 上传 3 个视频进剪辑室 → 剪切、改序 → 关闭 → 节点显示新首帧且没有生成新 mp4。
4. CineBot 下剪辑指令 → 关闭剪辑室后节点刷新。
5. 节点点播放 → 从第 0 帧连续播放；暂停保持当前帧；播完回第 0 帧。
6. 节点小窗静音；大预览出声；同时只有一个出声源。
7. 导出成片 → 版本栈出现新版本；删除版本 → 文件与连线正确清理。
8. 导出时画布预览暂停并提示，结束恢复。

验证记录写入 `.opencode/handover/evidence/`（按项目约定；若目录尚未初始化则随本次功能一并建立）。

## 9. 文档影响

- `docs/README.md`：在「活跃方案」登记本方案。
- `docs/ui-spec.md`：更新剪辑室节点预览区、状态文案、播放按钮、版本删除入口。
- `docs/clip-studio-backlog.md`：新增阶段零到阶段三的待办项，M4 备注依赖本方案。
- `docs/doc-impact.md`：登记新文件 `VideoPreview.tsx` / `TimelineCanvas.tsx` / `docCache.ts` / `playbackBudget.ts`、IPC 事件 `timeline:changed` 与 `export:delete-file`、`VideoPlayer` / `AudioPlayer` 卸载行为变更、版本删除逻辑。

## 10. 风险与回滚

| 风险 | 缓解 |
|---|---|
| `renderTimeline` 加 scale 影响导出 | 默认 `1`，导出路径不传；合并前做导出 hash 对照 |
| 删除版本误删他人引用文件 | 删除前扫描全画布引用计数，仅 0 引用时删文件 |
| 删除版本删错连线 | 仅当下游引用匹配被删 `outputId` 时删边；不匹配保留 |
| 播放名额不足导致体验落差 | 自动暂停最早播放的节点并 toast，不阻止新播放 |
| `timeline:changed` 风暴 | 100ms debounce + 按 timelineId 过滤 + 剪辑室打开时跳过 |
| 预览与导出状态混淆 | 节点上明确区分「实时预览 / 导出版本」，状态文案单独标注「导出版本」 |

回滚：四个阶段独立可回滚。阶段零出问题可单独关闭 `VideoPreview` 包装、恢复 `VideoPlayer` 直连；阶段一出问题只需把 `StudioNodeView` 预览区恢复为 `assetSrc` 分支；IPC 事件和 `TimelineCanvas` 可保留不影响主流程；阶段三的版本删除可单独下线。

## 11. 已确认决策

1. **发布**：四个阶段一次性开发，发布时间由用户决定。
2. **验收**：用户人工验收，不设量化指标。
3. **兼容**：不考虑旧项目，去掉 `previewMode` 字段。
4. **性能治理范围**：所有 `<video>` / `<audio>`，图片不纳入。
5. **播放触发**：默认静态封面，只有点击播放按钮才播放，无 hover 自动播放。
6. **播放上限**：素材与 canvas 预览共享 4 个名额；超限自动暂停最早并 toast。
7. **门控实现**：复用 React Flow `onlyRenderVisibleElements`，不另写 `IntersectionObserver`；叠加缩放阈值、节点屏幕尺寸、全局计数。
8. **封面**：普通视频用 `media.thumbnail` 抽帧；剪辑室节点固定时间线第 0 帧。
9. **doc 缓存**：渲染进程 `Map` + LRU（上限 20），`timeline:changed` 按 id 失效。
10. **刷新时机**：剪辑室打开时跳过，关闭时统一刷新。
11. **大预览**：默认「实时预览」+ 出声，「导出版本」第二 tab；用原片解码；打开时暂停小窗播放。
12. **节点小窗音频**：强制静音并隐藏音量按钮；全局最多 1 个出声源。
13. **播放起止**：从第 0 帧开始；暂停保持当前帧；播完回第 0 帧。
14. **导出命名**：「生成成片」→「导出成片」；「下载成片」→「另存成片」。
15. **导出位置**：导出成片默认写项目 `exports/`；另存成片弹保存对话框。
16. **版本删除**：版本栏入口；引用计数为 0 才删文件；删除对应失效连线；当前版本删除后回退到相邻最新版本。
17. **导出并发**：导出时暂停所有预览/播放并 toast 提示，结束恢复。
18. **广播范围**：`timeline:changed` 只发给发起保存的窗口。
