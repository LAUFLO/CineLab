# 节点内联操作编辑器方案

日期：2026-11-28
状态：实施中
适用版本：v0.5.3
最后核对：2026-11-28

> 目标：把所有「需要看着、指着、框着源节点内容才能操作」的弹窗，统一改成节点内联编辑器；同时处理拖动时的浮层隐藏和媒体尺寸白边。方案已确认并进入实施；本文记录范围、架构与当前进度。

## 0. 结论

1. **拖动时只显示节点内容**：新增全局拖动态，统一隐藏节点工具栏、PromptBar、图层工具条、多选/分组/分镜工具条和覆盖 badge；专用节点内部按钮、音频操作条保留。
2. **操作 UI 全部内联化**：复用图层分离已经验证过的「顶部工具条 + 源内容操作层 + 跟随节点底部面板」，不做单功能试点，按依赖顺序一次性改造。
3. **迁移范围**：所有当前弹窗且需要操作源内容的功能，共 15 个操作；纯生成、纯文本、纯设置类保留现有对话框。
4. **白边修复**：只调整「实际画幅与节点比例不一致」的节点；选中描边改为不占布局的 `outline`。

### 0.1 实施进度（2026-11-28）

| 项 | 状态 | 说明 / 证据 |
|---|---|---|
| 拖动隐藏浮层 | 完成 | `body[data-node-dragging]` + `data-node-chrome`；`artifacts/p8-drag-mid.png`、`p8-drag-end.png` |
| 媒体尺寸自愈 | 完成 | 图片 `onLoad`、视频封面 `onLoad` 上报真实画幅；只改比例不一致的节点；选中描边改 `ring-inset` |
| 内联宿主 | 完成 | `NodeInlineEditorHost.tsx` + `inline-generation.ts`；`inlineEditor` 状态接管 NodeToolbar 与 PromptBar |
| 阶段 1（空间选择 8 个） | 完成 | crop、cutout 框选、subtitle 框选、video-crop、outpaint、inpaint、erase、element-edit |
| 阶段 2（方向/预览 4 个） | 完成 | relight、multi-angle、color-grade、portrait |
| 阶段 3（时间/网格/参数 3 个） | 完成 | clip-trim、grid-split、motion-capture |
| 旧 Dialog 清理 | 未开始 | 旧组件与状态保留为回退路径，默认不再触发 |
| `layer-split` 接入新宿主 | 未开始 | 仍使用原 `LayerSplitOverlay`，交互已符合目标，后续再统一 |
| 真实模型生成 | 待验证 | 隔离实例没有模型 Key，只验证了内联 UI 与本地处理；真实生成链路待有 Key 环境复测 |

UI 证据：`artifacts/p8-inline-crop.png`、`p8-inline-mask3.png`、`p8-outpaint-ui3.png`、`p8-relight-ui.png`、`p8-grade-ui.png`、`p8-grid-ui2.png`。

## 1. 背景与用户决策

图层分离 P6 已把「节点内框选 → 顶部工具条 → 底部参数面板 → 提交后恢复」跑通，交互与 LibTV 对齐。用户确认这套逻辑可以推广到其他需要操作源内容的功能。

2026-11-28 用户确认：

| 决策 | 内容 |
|---|---|
| 拖动隐藏范围 | 专用节点内部按钮、音频操作条保留 |
| 改造方式 | 不做试点，所有需要操作源内容的弹窗全部改为新 UI |
| 白边修复 | 只调整实际画幅与节点比例不一致的节点 |
| 落地顺序 | 先落文档，确认后再编码 |

## 2. 现状盘点

### 2.1 已有 UI 基建

| 能力 | 现有实现 | 复用方式 |
|---|---|---|
| 节点内联定位 | `LayerSplitOverlay.tsx` 按 `cardRef.getBoundingClientRect()` + portal 定位 | 抽取 `NodeInlineEditorHost` |
| 顶部工具条 | 图层拆分/图层编辑工具条，`rounded-card`、`scale(var(--canvas-zoom-inverse))` | 抽取 `InlineToolbar` |
| 底部面板 | 图层拆分面板，跟随节点下方 10px，空间不足上移画布 | 抽取 `InlinePanel` |
| 框选手柄 | `LayerSplitOverlay` 的 `constrainBox`、`useBoxEditor` | 抽取 `InlineBoxLayer` |
| 蒙版画布 | `MaskEditorDialog` 的画笔/橡皮/矩形/撤销 | 抽取画布逻辑，嵌到节点图片上 |
| 方向球 | `SphereDialog` 的方位角/高度角/强度/色温 | 抽取 `InlineSphereLayer` |
| 模型与提示词 | `AiOperationDialog` 的模型过滤、提示词、扩图比例 | 抽取 `InlinePanel` 的表单区 |
| 时间区间 | `TrimDialog` 的开始/结束秒 | 抽取 `InlineTimelineLayer` |
| 统一 UI effect | `NodeOperationUiEffect`（crop/mask/ai/sphere/trim/box/depth 等） | 扩展 `inline-editor` 类型 |
| 节点尺寸 | `mediaFrameNodeSize`、`fitNodeToMedia`、生成完成/加载时 resize | 扩展为真实媒体尺寸自愈 |

### 2.2 功能全量清单

「源内容操作」指需要看着、指着、框着源图片/视频的画面、时间或方向来输入；纯提示词、纯模型选择不算。

#### 图片操作

| 操作 ID | 名称 | 当前 UI | 源内容操作 | 目标模式 | 迁移 | 阶段 |
|---|---|---|---|---|---|---|
| `grid-split` | 宫格切分 | 菜单选 2×2/3×3/4×4/5×5，本地切分，无浮窗 | 切分线 | `grid` | 增强 | 3 |
| `crop` | 裁剪 | 预设比例直接本地裁；自由裁剪弹 `CropDialog` | 选框 | `box` | 是 | 1 |
| `grid-generate` | 九宫格 | `AiOperationDialog` | 否 | 保留 | 否 | — |
| `character-sheet` | 角色四视图 | `AiOperationDialog` | 否 | 保留 | 否 | — |
| `time-shift` | 画面推演 | `AiOperationDialog` | 否 | 保留 | 否 | — |
| `multi-angle` | 多角度 | 预设弹 AI 对话框；自定义弹 `SphereDialog` | 方向 | `sphere` | 是 | 2 |
| `panorama` | 720 度全景图 | `AiOperationDialog` | 否 | 保留 | 否 | — |
| `color-grade` | 电影级光影校正 | `AiOperationDialog` | 参数 + 预览 | `panel` | 是 | 2 |
| `relight` | 打光 | 预设弹 AI 对话框；自定义弹 `SphereDialog` | 方向 | `sphere` | 是 | 2 |
| `portrait` | 人像质感调节 | `AiOperationDialog` + 强度菜单 | 参数 | `panel` | 是 | 2 |
| `outpaint` | 扩图 | `AiOperationDialog` 选比例 | 扩展框 | `outpaint` | 是 | 1 |
| `cutout` | 抠图 | 自动直接执行；框选弹 `CropDialog` | 选框 | `box` | 框选迁移 | 1 |
| `inpaint` | 重绘 | `MaskEditorDialog` → `AiOperationDialog` | 蒙版 | `mask` | 是 | 1 |
| `erase` | 擦除 | `MaskEditorDialog` → `AiOperationDialog` | 蒙版 | `mask` | 是 | 1 |
| `element-edit` | 元素编辑 | `MaskEditorDialog` → `AiOperationDialog` | 蒙版 | `mask` | 是 | 1 |
| `layer-split` | 图层分离 | 已节点内联 | 选框 | 已有 | 完成 | — |
| `reverse-prompt` | 反推提示词 | `AiOperationDialog` | 否 | 保留 | 否 | — |

#### 视频与音频操作

| 操作 ID | 名称 | 当前 UI | 源内容操作 | 目标模式 | 迁移 | 阶段 |
|---|---|---|---|---|---|---|
| `motion-capture` | 深度动作捕捉 | `DepthCaptureDialog`（质量/fps） | 参数 + 时长 | `panel` | 是 | 3 |
| `clip-trim` | 片段截取 | `TrimDialog` 输入开始/结束秒 | 时间区间 | `timeline` | 是 | 3 |
| `split-av` | 分离音视频 / 人声 / 背景音 | 菜单直接执行 | 否 | 保留 | 否 | — |
| `frame-study` | 抽帧 | 菜单选首/尾/当前帧，直接执行 | 当前帧时间点 | 保留 | 否 | — |
| `film-study` | 逐帧拉片 | 直接执行 | 否 | 保留 | 否 | — |
| `video-crop` | 画面裁切 | 预设比例直接执行；自定义弹 `VideoCropDialog` | 画面框 | `box` | 是 | 1 |
| `subtitle` | 去字幕 | 智能直接执行；框选弹 `SubtitleDialog` | 字幕区域 | `box` | 框选迁移 | 1 |
| `shot-retake` | 片段重拍 | `AiOperationDialog` | 可能需要时间/区域 | 保留 | 后续 | — |
| `element-replace` | 元素替换 | `AiOperationDialog` | 可能需要区域 | 保留 | 后续 | — |
| `object-remove` | 主体消除 | 组件就绪后直接执行 | 否 | 保留 | 否 | — |
| `matting` | 智能抠像 | 组件就绪后直接执行 | 否 | 保留 | 否 | — |
| `extend` | 智能续写 | `AiOperationDialog` | 否 | 保留 | 否 | — |
| `AudioActionBar` | 音频截取 / 变速 | 节点内操作条 | 时间区间 | 保留 | 否（用户确认） | — |

#### 其他弹窗

| 入口 | 当前 UI | 是否迁移 | 理由 |
|---|---|---|---|
| PromptBar 参考图蒙版 | `MaskEditorDialog` | 暂不迁移 | 操作对象是参考图，不是节点主图；后续单独设计参考图内联 |
| 文本节点编辑 | `TextEditorDialog` | 保留 | 纯文本编辑，无空间操作 |
| 模型配置、组件检查、设置 | `ModelConfigDialog` / 设置页 | 保留 | 系统设置，不是源内容操作 |
| 风格库、预设提示词 | 居中浮窗 | 保留 | 输入辅助，不是源内容操作 |
| 工作流保存、素材入库 | Dialog | 保留 | 资产操作，不是源内容操作 |

### 2.3 迁移结论

- **必迁 15 个**：`crop`、`cutout`（框选）、`subtitle`（框选）、`video-crop`、`outpaint`、`inpaint`、`erase`、`element-edit`、`relight`、`multi-angle`、`color-grade`、`portrait`、`motion-capture`、`clip-trim`、`grid-split`（增强）。
- **已内联 1 个**：`layer-split`，作为参考实现。
- **保留**：纯生成、纯文本、纯设置、无源内容操作的功能；`AudioActionBar` 按用户确认保留。
- 预设比例、自动抠图、智能去字幕等可以直接执行的菜单项，统一先进入内联编辑器显示预览；用户可直接确认，也可切换参数。避免同一操作有时弹窗、有时不弹窗。

## 3. 目标交互

### 3.1 统一结构

```text
┌─────────────────────────────────────────┐
│ 顶部工具条（覆盖 NodeToolbar 位置）       │
├─────────────────────────────────────────┤
│                                         │
│ 源图片 / 视频 + 操作层                    │
│ 框选 / 蒙版 / 光源点 / 扩展框 / 时间条     │
│                                         │
├─────────────────────────────────────────┤
│ 底部面板（跟随节点下方 10px）              │
│ 参数 · 模型 · 提示词 · 取消 / 应用         │
└─────────────────────────────────────────┘
```

- 顶部工具条只放当前操作必需的动作：撤销、重置、关闭、预览开关。不放大而全的工具栏。
- 底部面板放参数、模型、提示词和提交按钮；不显示积分、费用、张数等计费文案。
- 没有可用模型时，面板显示「未配置图片模型 / 去配置」提示，不渲染空的下拉框。
- 面板内容区滚动、按钮区固定；提示词输入框保留完整四边边框，不使用灰色横线分隔。
- 本地处理（裁剪、宫格切分、框选去字幕等）注明「本地处理，不调用模型」；模型生成注明当前模型。
- 面板宽度与节点同宽或略宽，最大不超过视口；内容超高时面板内部滚动。
- 节点下方空间不足时，自动上移画布，不把面板顶出视口。

### 3.2 六种编辑模式

| 模式 | 适用操作 | 源内容上的交互 | 底部面板 |
|---|---|---|---|
| `box` 选框 | 裁剪、框选抠图、框选去字幕、画面裁切 | 矩形选框、四角/四边手柄、比例锁定、移动 | 比例、输出尺寸、模型/确认 |
| `mask` 蒙版 | 重绘、擦除、元素编辑 | 画笔、橡皮、矩形、笔刷大小、撤销、清除 | 提示词、模型、笔刷大小 |
| `sphere` 方向 | 打光、多角度 | 光源点/相机点拖动，方位角、高度角 | 强度、色温、阴影、预设、模型 |
| `outpaint` 扩展 | 扩图 | 比例选择、目标尺寸提示 | 比例、模型、提示词 |
| `timeline` 时间 | 片段截取 | 时间条、开始/结束手柄、时间码 | 精确时间、输出信息 |
| `grid` 切分 | 宫格切分 | 切分线、行列选择、每格预览 | 行列、输出组、确认 |
| `panel` 参数 | 色彩校正、人像质感、深度捕捉 | 无选区，源内容实时预览（能本地预览的） | 滑杆/选项、模型、提交 |

### 3.3 进入与退出

1. 点击操作 → `NodeToolbar` 不再打开 Dialog，写入 `inlineEditor` 状态。
2. `CineNodeView` 隐藏原 `NodeToolbar`，渲染 `NodeInlineEditorHost`；`PromptBar` 隐藏。
3. 编辑态锁定节点拖动，避免选区和节点位移冲突；需要移动节点时先退出。
4. `Esc` 退出；设置打开时隐藏编辑器，关闭设置后恢复；节点删除或切换选中时自动退出。
5. 提交后退出并恢复原工具栏/PromptBar；生成走既有 pending 节点链路，不在编辑器里等进度。

### 3.4 定位、缩放与层级

- 工具条、面板使用 `scale(var(--canvas-zoom-inverse,1))`，画布缩放时屏幕尺寸不变。
- 选区层按图片像素坐标存储，显示时按 `cardRef` 实际尺寸换算，图片缩放后不漂移。
- 工具条、面板、选区层使用 `nodrag nopan`，不触发节点拖动和画布平移。
- 设置面板、Dialog 的层级高于编辑器；编辑器不覆盖设置。
- 编辑器内不使用新的全局浮层组件，统一走 `components/ui` 的 Button、Select、Input、Textarea。

### 3.5 拖动时隐藏

- `Canvas.handleNodeDragStart` 给 `document.body` 加 `data-node-dragging`，`handleNodeDragStop` 清除。
- 所有非节点内容浮层加 `data-node-chrome`：NodeToolbar、PromptBar、图层条/面板、拆分工具条/面板、多选条、分组条、分镜条、覆盖 badge。
- 全局样式：
  ```css
  body[data-node-dragging] [data-node-chrome] {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  ```
- 保留：节点标题栏、图片/视频、生成进度、状态文字；专用节点内部按钮、音频操作条按用户确认保留。
- 松手后 100–120ms 恢复；不卸载组件，保留 PromptBar 输入内容和焦点。

## 4. 架构设计

### 4.1 组件分层

```text
NodeToolbar / Agent effect
        ↓
NodeInlineEditorHost          // portal、cardRef 定位、Esc、设置隐藏、拖动锁定
  ├─ InlineToolbar            // 顶部工具条
  ├─ InlineSelectionLayer     // box / mask / sphere / outpaint / timeline / grid
  └─ InlinePanel              // 底部参数面板
        ↓
InlineEditorSpec              // 每个操作的选择类型、参数、预览、提交载荷
```

建议目录：

```text
src/renderer/src/canvas/nodes/inline/
  NodeInlineEditorHost.tsx
  InlineToolbar.tsx
  InlinePanel.tsx
  InlineSelectionLayer.tsx
  inline-editor-specs.ts
  modes/
    InlineBoxMode.tsx
    InlineMaskMode.tsx
    InlineSphereMode.tsx
    InlineOutpaintMode.tsx
    InlineTimelineMode.tsx
    InlineGridMode.tsx
```

具体文件可以按实现合并，不要求一次拆到最细。

### 4.2 状态与 effect

- `useUIStore` 增加：
  - `inlineEditor: { nodeId, operationId, mode, itemId?, initial? } | null`
  - `openInlineEditor` / `closeInlineEditor`
- `NodeOperationUiEffect` 增加：
  - `{ type: 'inline-editor', op: NodeOperation, item?, mode, initial? }`
- `NodeToolbar.applyUiEffect` 把旧的 `crop-dialog / box-dialog / mask-dialog / ai-dialog / sphere-dialog / video-crop-dialog / trim-dialog / depth-dialog` 路由到 `openInlineEditor`；旧 Dialog 保留为回退。
- `CineNodeView` 在 `inlineEditor?.nodeId === id` 时隐藏 `NodeToolbar`，渲染宿主；`PromptBar` 在 `inlineEditor` 非空时返回 null（沿用 `layerSplitActive` 模式）。
- 提交由 `InlineEditorSpec.onConfirm(payload)` 映射到现有 `executeNodeOperation` 或 `generation.run`，不新造生成链路。

### 4.3 数据与坐标

- 选区/蒙版/扩展框使用图片像素坐标，避免缩放误差。
- 蒙版输出沿用现有 `maskDataUrl` 格式，不改变主进程接口。
- 选框输出沿用 `rect: { x, y, width, height }`，与 `CropDialog`、`node-operation-specs` 的 `rect` 参数一致。
- 方向输出新增 `azimuth / elevation / intensity / temperature / shadow`，由 `InlineEditorSpec` 拼进提示词；不改变模型协议。
- 时间输出沿用 `start / end` 秒，与 `TrimDialog` 一致。
- 扩图沿用 `outpaintRatio` 和 `planOutpaint`，不改变模型选择逻辑。

### 4.4 Agent / MCP

- `NodeOperationUiEffect` 扩展后，Agent 调用同一个 `executeNodeOperation` 也会打开内联编辑器。
- `node-operation-specs.ts` 的 `executable / generationProposable / itemRequired` 不变。
- 不新增 Agent 工具；已有操作的参数校验继续复用。
- 若 Agent 在无人值守环境调用需要 UI 的操作，仍返回 `needsUi` / `needsGeneration`，不强行打开编辑器。

### 4.5 旧 Dialog 的去留

- 迁移期间保留 `AiOperationDialog`、`CropDialog`、`MaskEditorDialog`、`SphereDialog`、`VideoCropDialog`、`SubtitleDialog`、`TrimDialog`、`DepthCaptureDialog` 文件。
- 默认路径全部走新 UI；本地偏好提供 `legacyOps` 回退开关，按操作 ID 回退到旧弹窗。
- 稳定一个版本后再删除旧 Dialog，删除前先确认没有 Agent/旧项目路径依赖。

## 5. 迁移明细

### 5.1 空间选择类（阶段 1）

| 操作 | 现状问题 | 新交互 |
|---|---|---|
| `crop` | 预设直接切、自由裁剪弹全屏框选，行为不一致 | 统一进入 `box`，预设比例作为面板选项；确认后本地裁剪 |
| `cutout` 框选 | `CropDialog` 全屏框选 | `box` + 底部「开始抠图」；自动抠图仍可直接执行 |
| `subtitle` 框选 | `SubtitleDialog` 全屏框选 | `box` + 底部确认；智能去字幕仍可直接执行 |
| `video-crop` | 自定义只输入比例，画面居中裁，无法预览 | `box` + 比例锁；第一阶段居中预览，第二阶段扩展后端支持拖动裁剪区域 |
| `outpaint` | 只能选比例，看不到扩展范围 | `outpaint` 比例 + 模型/提示词；不显示扩展阴影预览 |
| `inpaint` | 涂抹 → 确认 → 再弹 AI 对话框，两步 | `mask` + 底部提示词/模型，一步提交 |
| `erase` | 同上 | `mask` + 底部模型，一步提交 |
| `element-edit` | 同上 | `mask` + 底部提示词/模型，一步提交 |

### 5.2 方向与预览类（阶段 2）

| 操作 | 现状问题 | 新交互 |
|---|---|---|
| `relight` | 预设和自定义两个入口，自定义用独立方向球浮窗 | 统一 `sphere`：图片上拖光源点，面板调方位/高度/强度/色温/阴影；预设作为快捷值 |
| `multi-angle` | 预设走 AI 对话框，自定义走方向球 | 统一 `sphere`：相机方位/俯仰/焦段；预设作为快捷值 |
| `color-grade` | 只能填提示词，看不到调整方向 | `panel`：曝光/对比/色温/饱和度滑杆，本地滤镜实时预览，提交模型 |
| `portrait` | 菜单选强度后再弹 AI 对话框 | `panel`：强度滑杆 + 模型；可选人脸框后续再加 |

### 5.3 时间与网格类（阶段 3）

| 操作 | 现状问题 | 新交互 |
|---|---|---|
| `clip-trim` | 输入开始/结束秒，看不到画面 | `timeline`：时间条 + 开始/结束手柄 + 时间码；视频节点适用，音频保留 AudioActionBar |
| `motion-capture` | 独立参数弹窗，和源视频脱节 | `panel`：质量/fps + 源视频时长/组件状态，底部面板提交 |
| `grid-split` | 菜单直接切，无法预览切分线 | `grid`：切分线预览 + 行列切换；本地切图，确认后生成宫格组 |

### 5.4 保留类

- `grid-generate`、`character-sheet`、`time-shift`、`panorama`、`reverse-prompt`、`shot-retake`、`element-replace`、`extend`：纯生成/文本结果，不需要源内容空间操作，保留 `AiOperationDialog`。
- `split-av`、`frame-study`、`film-study`、`object-remove`、`matting`：直接执行或组件依赖，保留。
- `AudioActionBar`：音频节点内操作条，按用户确认保留。
- PromptBar 参考图蒙版：暂不迁移，后续单独评估。

## 6. 分阶段实施

不做单功能试点，按依赖顺序一次性铺开：

| 阶段 | 内容 | 产出 |
|---|---|---|
| 0 | 基建：`NodeInlineEditorHost`、`InlineToolbar`、`InlinePanel`、`inline-editor` effect、`inlineEditor` 状态 | 新 UI 可被任意操作打开 |
| 1 | 空间选择类 8 个：crop、cutout 框选、subtitle 框选、video-crop、outpaint、inpaint、erase、element-edit | 替换 6 个旧 Dialog 入口 |
| 2 | 方向/预览类 4 个：relight、multi-angle、color-grade、portrait | 替换 SphereDialog + AI 对话框入口 |
| 3 | 时间/网格/参数类 3 个：clip-trim、grid-split、motion-capture | 替换 TrimDialog、DepthCaptureDialog，增强宫格 |
| 4 | 清理：旧 Dialog 回退开关、默认路径切换、删除无引用代码 | 代码收口 |
| 5 | 拖动隐藏 + 媒体尺寸自愈 | 与阶段 0 并行，独立验收 |

阶段 0 先把 `layer-split` 迁移到同一套宿主上，验证宿主能力；这不是试用，而是统一架构的第一步。

## 7. 媒体尺寸自愈

### 7.1 问题

- 图片/视频用 `object-contain` 渲染，节点内容框按 `output.width/height` 计算。
- 当实际文件画幅与元数据不一致时，图片按高度铺满、宽度收缩，左右露出卡片背景。
- 选中态 `border-2` 让内容区再缩 2px，白边被蓝色描边框出来，看起来像“选中后才出现”。

### 7.2 方案

1. 图片 `onLoad`、视频 `loadedmetadata` / 封面 `onLoad` 时上报真实 `naturalWidth/naturalHeight`。
2. 新增 `syncNodeSizeToMedia(nodeId, width, height)`：
   - 按当前 `mediaFrame` 档位调用 `mediaFrameNodeSize`；
   - 与当前节点宽高比较，比例偏差 > 0.5% 或像素偏差 > 1px 才 `resizeNode`；
   - 同步 `syncGroupBounds`；
   - 按 output id 缓存，避免重复调整和循环。
3. 触发点：生成完成、版本切换、项目加载、图片/视频首次渲染。
4. 选中态边框改为 `outline` / `ring-inset`，不占内容尺寸。
5. 兜底：图片节点媒体容器背景使用 `surface-raised`，视频保持 `media-bg`，留白不刺眼。

### 7.3 边界

- 只调整实际画幅与节点比例不一致的节点；比例一致的节点不动。
- 保持 `mediaFrame` 档位，不改变分组布局和列宽策略。
- 不修改 `output.width/height` 元数据，只修正节点显示尺寸。
- 用户手动调整过尺寸的节点：当前没有节点缩放功能，暂不需要额外标记；若后续加入，需记录 `manualSize` 并跳过自愈。

## 8. 验收

### 8.1 节点内联编辑器

- 15 个迁移操作点击后不再弹居中/全屏 Dialog。
- 每个操作都能在节点内完成「选择/输入 → 参数 → 提交」。
- `Esc` 取消不发请求；设置打开时编辑器隐藏，关闭后恢复。
- 提交后恢复原 NodeToolbar / PromptBar；生成结果与旧链路一致（op、model、output 路径、节点类型）。
- 画布缩放时工具条/面板尺寸不变；选区不漂移。
- 编辑态不会误拖节点、不会触发画布框选。
- 本地处理显示「本地处理，不调用模型」；模型生成显示模型选择，不显示积分/费用。

### 8.2 拖动隐藏

- 拖动任意单节点、多选、分组时，只剩标题和媒体；PromptBar、NodeToolbar、图层条、多选/分组/分镜条隐藏。
- 专用节点内部按钮、音频操作条保持可见。
- 松手后 120ms 内恢复，PromptBar 输入内容和焦点保留。
- 切换项目、取消拖动、组件卸载后不残留 `data-node-dragging`。

### 8.3 媒体尺寸

- 1.63、1.74、2.39 等不同画幅的图片/视频节点，选中/取消、切换版本、重开项目后，媒体边缘与内容框误差 ≤ 1px。
- 选中/取消不改变图片渲染尺寸。
- 比例一致的节点不被无故 resize。

### 8.4 工程校验

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm check:ui
corepack pnpm check:docs
corepack pnpm check:agent-coverage
```

## 9. 风险与回退

| 风险 | 影响 | 回退 |
|---|---|---|
| 各操作提交载荷不同 | 只换 UI 不换链路会导致参数丢失 | 每个操作写 `InlineEditorSpec`，逐项对照旧 Dialog 的 onConfirm |
| 视频时间操作复杂 | 片段截取、去字幕需要播放器时间点 | 时间条先只支持开始/结束，不做逐帧吸附 |
| 蒙版性能 | 大图涂抹卡顿 | 蒙版画布限制最大边长，按显示尺寸绘制后缩放回原图 |
| 内联层与画布手势冲突 | 拖动选区时移动节点 | 统一 `nodrag nopan`、pointer capture，编辑态锁节点拖动 |
| Agent 路径兼容 | 无人值守调用被 UI 阻塞 | 保留 `needsUi` 返回，不强行打开编辑器 |
| 一次性替换风险 | 多个操作同时回归 | `legacyOps` 按操作 ID 回退旧 Dialog，默认新 UI |

## 10. 决策记录

| 日期 | 决策 |
|---|---|
| 2026-11-28 | 专用节点内部按钮、音频操作条在拖动时保留，不隐藏 |
| 2026-11-28 | 不做单功能试点，所有需要操作源内容的弹窗统一改为节点内联 UI |
| 2026-11-28 | 白边只调整实际画幅与节点比例不一致的节点 |
| 2026-11-28 | 先落文档，确认后再编码 |
| 2026-11-28 | 复用图层分离的宿主/工具条/面板/选区层，不复制整份 `LayerSplitOverlay` |
| 2026-11-28 | 纯生成、纯文本、纯设置类保留现有对话框 |
| 2026-11-28 | PromptBar 参考图蒙版暂不纳入节点内联，后续单独评估 |
