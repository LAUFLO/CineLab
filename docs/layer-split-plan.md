# 图层分离改为模型分层 + 本地图层合成（含组件在线更新 P5）方案

日期：2026-11-26
状态：已实施（P0–P6 已验证；P5 组件 manifest 与 v2 随应用发版上传；P6 多 bbox 真实模型行为待验证）
适用版本：v0.5.x
最后核对：2026-11-27

> 目标：删除本地 InSPyReNet + LaMa 图层分离，统一使用声明 `layer` 模式的模型做语义图层分解；输出「完整底图 + 图层栈」，支持自动拆分、提示词拆分、框选拆分；图层可拖出成独立图片、拖回附着，合并完全本地、不调模型。同时补齐组件在线更新（P5），让 `vision-models` 等组件具备「更新」能力。

## 0. 实施进度

| 批次 | 状态 | 已完成内容 | 证据 |
|---|---|---|---|
| P0 | ✅ 已完成 | worker + `inspyrenet` 移到应用侧、alpha 直通修复、删除本地 `layer-split`、PromptBar 收口 | `resources/vision-worker/`、`src/main/media/vision.ts`、`src/main/components/service.ts`、`electron-builder*.yml` |
| P1 | ✅ 已完成 | 全屏框选、矩形绘制/缩放/平移、模型下拉、四种输入、分离数量、pending 节点 + 连线 | `LayerSplitOverlay.tsx`、`layer-split-prompt.ts`、`artifacts/p1-overlay.png`、`artifacts/p1-pending.png`、`artifacts/p1-result.png` |
| P2 | ✅ 已完成 | `layerGroupId` / `layerTransform`、图层叠加预览、背景锁定、合并条、本地 Canvas 合并、写回同一节点新版本 | `layer-compose.ts`、`LayerStackPreview.tsx`、`graph.ts`、`src/main/ipc/media.ts`、`artifacts/p2-result2.png`、`artifacts/p2-merged2.png` |
| P3 | ✅ 已完成 | 图层拖动/等比缩放、拖出独立节点、拖回附着、已分离区「放回」、图层面板显隐/锁定、组选择、100 版本裁剪保护 | `LayerEditorOverlay.tsx`、`assets.ts`、`Canvas.tsx`、`artifacts/p3-detached.png`、`artifacts/p3-attached.png`、`artifacts/p3-restored2.png`、`artifacts/p3-resized.png` |
| P4 | ✅ 已完成 | `layer_merge` / `layer_detach` / `layer_attach` 三个 Agent 工具、确认规则、MCP 元数据、覆盖率 | `src/main/agent/tools/canvas.ts`、`src/renderer/src/agent/canvasBridge.ts`、`corepack pnpm check:agent-coverage`（95 工具） |
| P5 | ✅ 代码完成，发布资产待上传 | `checkUpdates`、24h 持久化缓存、启动后台检查、更新按钮/红点、版本+大小确认、任务占用阻断、四组件 manifest URL | `src/main/components/service.ts`、`src/main/ipc/components.ts`、`src/renderer/src/panels/ComponentsSection.tsx`、`src/renderer/src/stores/components.ts`、`artifacts/p5-update.png` |
| P6 | ✅ 已验证 | 节点内联分离态（工具栏/PromptBar 就地替换，提交后恢复）、多选区（最多 4）、白线方角手柄、chips、编辑态工具条、合并条外移、移除积分/费用文案 | `src/renderer/src/canvas/nodes/LayerSplitOverlay.tsx`、`LayerEditorOverlay.tsx`、`NodeToolbar.tsx`、`PromptBar.tsx`、`CineNodeView.tsx`、`artifacts/p6-final-multi2.png`、`artifacts/p6-restored.png` |

实施备注：

- 真实链路已用中转站 `Beeftv · Seedream 5.5 (Beeftv · dola-seedream-5-5-261028)` 验证；Key 仅保存在隔离实例的本地 `models.json`，未写入仓库。
- 合并使用 `fetch` + Blob URL 加载素材，避免 Canvas 被 `cinelab-asset://` 图片污染；合并不调用模型。
- 旧的分层结果（P2 之前生成）没有 `layerGroupId`，不会显示叠加和合并条；新生成的结果正常。未做旧数据迁移（当前无用户）。
- P3 已补齐拖动/缩放、拖出独立节点、拖回附着、已分离「放回」；验证截图见 `artifacts/p3-*.png`。
- P5 的四个新 manifest 与 `vision-models` v2 需要随应用发版一起上传到 `depth-components-v1` / `vision-components-v1`；未上传时 `fetchManifest` 回退内置版本，不会显示更新。发版等用户通知。
- P6 已把拆分态改为节点内联并加入多选区；多 bbox 是否能被 Seedream 按框拆分仍需真实请求验证。验证截图见 `artifacts/p6-final-multi2.png`、`artifacts/p6-restored.png`。

## 1. 背景

### 1.1 图层分离现状

工具栏「图层分离」只有本地一条链路：

```text
node-operations.ts (layer-split)
  → node-operation-runner.executeLayerSplit()
  → window.api.media.startVisionTask({ kind: 'layer-split' })
  → main/media/vision.ts
  → 已安装组件 vision-models/worker.py: task_layer_split()
  → InSPyReNet 前景 + LaMa 背景
```

关键文件：

| 环节 | 文件 | 现状 |
|---|---|---|
| 工具栏定义 | `src/renderer/src/canvas/nodes/node-operations.ts` | `layer-split` 依赖 `vision-component` |
| 执行器 | `src/renderer/src/canvas/nodes/node-operation-runner.ts` | `executeLayerSplit` 直接启动本地任务 |
| 框选入口 | `src/renderer/src/canvas/nodes/NodeToolbar.tsx` | `executeBoxOperation` 直接启动本地任务 |
| 主进程 | `src/main/media/vision.ts` | `layer-split` 分支输出前景 + 背景 |
| Worker | 组件内 `worker.py` | `task_layer_split`：InSPyReNet 384×384 + LaMa 1280 上限 |
| 输出 | `src/renderer/src/stores/vision-tasks.ts` | 前景、背景写成两个独立节点 |
| 云端能力 | `src/main/providers/openai-compat.ts` | Seedream `layer` 模式已接，但只服务 PromptBar |
| 图层信息 | `src/main/providers/openai-compat.ts` | 已解析 `z_index / bounding_box / name` |
| 数据结构 | `src/shared/canvas-schema.ts` | `OutputRef.layer` 只有元信息，无 transform/group |
| 合成 | — | 无 |

本地链路的直接后果：

- 显著性模型按 384×384 推理再放大，毛发、阴影、半透明边缘都是软边。
- 前景 RGB 预乘了 alpha，却按直通 alpha 写 PNG，合成时会出现暗边。
- 背景 mask 只取 `alpha > 0.35` 再膨胀 9px，主体毛发/投影残留，LaMa 顺着残留轮廓补出「主体形状的低频雾团」。
- LaMa 最长边 1280，超出先缩小再放大，底图细节丢失。
- 结果只是两个互不关联的节点，没有图层栈、不能移动、不能合成。

### 1.2 LibTV 的行为证据

- 合并条文案「调整图层位置或尺寸，合并生成新图片（本地合成，不调用模型）」说明合并完全本地完成，不经过模型。
- 移走物体后的原位置没有洞、没有半透明残影，说明底图是一张**完整的、已经补全过的图**，不是原图挖洞。
- 图层可以直接拖出底图节点，变成画布上的独立图片节点；底图节点只剩补全后的背景。
- 提示词输入框提示「描述或框选希望拆分的图层，留空将自动识别并拆分」，说明自动拆分、提示词拆分、框选拆分三种入口并存。

高置信推断：LibTV 使用 Seedream 5.5 图层拆分（1 张底图 + 最多 99 个透明图层，底图自然补全移除区域）或同类的 Qwen-Image-Layered 云端服务。官方未披露具体后端，这里只把「语义图层分解 + 本地合成」作为对齐目标，不把某个模型写死。

### 1.3 组件系统现状（P5）

- 设置页只显示「已安装 · v1 · 547 MB」+「卸载」，没有远端版本比较。
- `installComponent()` 已可在已安装组件上重新下载并替换；`installer.ts` 使用 staging → 旧目录备份 → 原子替换 → 失败回滚，更新最危险的部分已具备。
- 六个组件里只有 `depth-runtime`、`vision-models` 配了远端 `manifestUrl`；`depth-model`、`whisper-runtime`、`whisper-model`、`stem-model` 只有内置 fallback，没有远端版本可比较。
- 缺的是：远端版本比较、`updateAvailable/latestVersion` 状态、`components.checkUpdates` IPC、「更新」按钮、启动后台检查与红点。

## 2. 最终决策

### 2.1 图层分离

| 决策 | 结论 |
|---|---|
| 本地图层分离 | 彻底删除 `layer-split` 视觉任务及所有入口；InSPyReNet / LaMa 保留给抠图、重绘、去字幕、主体消除 |
| 模型范围 | 所有声明 `layer` 模式的模型，不写死 Seedream；无凭据的模型置灰 |
| 输入方式 | 自动拆分、提示词拆分、框选拆分、框选 + 提示词，四种并存 |
| 自动拆分 | 留空直接拆分，默认最多 4 个主体（底图 + 4 图层 = 5 张输出），主体数范围 2–8 |
| 框选/提示词拆分 | 固定 1 个主体（底图 + 1 图层 = 2 张输出） |
| 自动 >4 | 调到 >4 时弹一次确认，同一数值每个会话只确认一次 |
| 框选交互 | 鼠标左键按住自由拖拽**轴对齐矩形**；可移动、8 点等比缩放、重置；滚轮缩放 0.5x–4x；空格/中键平移 |
| 提示词 + 框选 | bbox 优先，提示词只作为框选主体的补充描述 |
| 按钮文案 | 统一「开始拆分」，不显示费用/张数小字 |
| 提交后 | 立即关闭全屏，创建 pending 节点 + 从源节点连线，节点显示「生成中」 |
| 无图层结果 | 节点保持完成，保留底图，显示「未拆出图层」警告 + 重试入口；不标记失败 |
| 图层编辑 | 背景锁定；图层可移动、等比缩放；底图节点底部显示合并条 |
| 多图层组 | 支持一个节点多个 `layerGroupId`；组数 >1 时编辑器显示组下拉 |
| 合并结果归属 | 合并结果带 `layerGroupId` 作为归属，不带 `layer` 元数据，不参与叠加 |
| 100 版本上限 | 裁剪时优先保留当前图层组的底图 + 图层，先丢最旧的普通/合并版本 |
| 拖出 | 图层中心离开底图节点卡片，松手变成独立图片节点 |
| 拖回 | 独立图片节点拖回源底图节点，松手重新附着 |
| 拖回阻断 | 独立节点有出边时禁止附着，提示先断开下游 |
| 已编辑的独立节点 | output `path` 与源图层不一致时禁止附着，提示「该图片已被编辑」 |
| 已分离图层找回 | 编辑器图层列表增加「已分离」区，灰态显示 + 「放回」按钮 |
| 合并 | 写回同一节点的新版本；合并后退出图层编辑，保留图层栈 |
| 再次编辑 | 双击节点或工具栏「编辑图层」重新进入 |
| PromptBar | 收掉「图层拆分」模式，只保留工具栏入口；不做旧模板用户兼容 |
| 预检 | 渲染进程检查格式/尺寸；主进程加载参考图时检查文件大小；不新增 stat IPC |
| Worker | `worker.py` + `inspyrenet` 源码移到应用侧；组件只保留模型 + Python 环境；alpha 修复随应用发版，不要求组件 v2 |
| alpha 预乘 | 顺带修复 `matte-image` / `matte-video` |
| Agent | 新增 `layer_merge`、`layer_detach`、`layer_attach` 三个工具 |
| 历史 | 移动/缩放每次一条；拖出/拖回/合并各一条；支持撤销/重做 |

### 2.2 组件在线更新（P5）

| 决策 | 结论 |
|---|---|
| 范围 | 通用到六个组件 |
| 版本源 | 给 `depth-model`、`whisper-runtime`、`whisper-model`、`stem-model` 补远端 manifest |
| 按钮 | 有更新时同时显示「更新」和「卸载」；「更新」为主按钮 |
| 确认 | 点击更新弹确认：`v1 → v2 · 大小`；失败保留旧版 |
| 检查时机 | 应用启动后台检查，24 小时内不重复；设置页可手动刷新 |
| 红点 | 设置导航「模型与运行时」+ 对应组件卡片；常驻直到更新完成 |
| 占用 | 有任务正在使用该组件时禁止更新；查不到任务状态的组件退回安装器回滚 |
| vision-models v2 | 本次不发布；用 staging manifest / 小组件验证更新链路，等下次模型更新再发 v2 |

## 3. 目标交互

### 3.1 全屏框选

```text
┌─────────────────────────────────────────────┐
│  ×      图层分离                    ↶   ↷   │
├─────────────────────────────────────────────┤
│                                             │
│             [源图，居中 fit]                 │
│          ┌──────────┐                       │
│          │  选框     │  ← 左键自由拖拽        │
│          └──────────┘                       │
│                                             │
├─────────────────────────────────────────────┤
│  图层分离                                    │
│  [模型：火山方舟 · Seedream 5.5         ▼]   │
│  [分离数量：最多 4 个主体              ▼]   │
│  [描述或框选希望拆分的图层，留空将自动识别并拆分] │
│  [取消]                         [开始拆分]   │
└─────────────────────────────────────────────┘
```

- 顶部：× 关闭、标题、框选撤销/重做。
- 图片：深色背景、居中 fit；左键按住自由拖拽画**轴对齐矩形**；选框可移动、8 点等比缩放、可重置；`Esc` 退出。
- 滚轮缩放 0.5x–4x；空格/中键拖拽平移；左键始终画框。
- 框选撤销/重做只作用于选区，最多 20 步，不碰画布历史。
- 模型下拉：只列出 `modelSupportsMode(model, 'layer')` 且供应商有可用凭据的模型；无凭据项置灰并提示「未配置 API Key」。
- 默认模型：上次使用的 layer 模型 → 当前节点模型 → 第一个可用。
- 「分离数量」只在自动模式（无框选、无提示词）可编辑；框选/提示词模式固定 1 个主体并置灰。
- 自动模式调到 >4 时弹一次确认「最多生成 N 张图片」；同一数值每个会话只确认一次。
- 提示词 placeholder：`描述或框选希望拆分的图层，留空将自动识别并拆分`。
- 按钮始终可用（只要模型已选）；留空 = 自动拆分。
- 按钮旁不显示费用或张数小字；「分离数量」的 hover 提示只说明生成上限。
- 框选 + 提示词同时存在时，提示「提示词用于描述框选主体」；bbox 优先。
- 工具栏入口不再使用 `CropDialog`；抠图仍保留 `CropDialog`。
- 预检：图片格式/尺寸在渲染进程检查；文件大小在主进程加载参考图时检查；超限直接提示，不建 pending 节点。

### 3.2 四种输入模式

| 框选 | 提示词 | 模式 | `layer_max_images` |
|---|---|---|---|
| 无 | 无 | 自动拆分 | 默认 5（底图 + 4 图层），范围 3–9 |
| 有 | 无 | 框选拆分 | 2（底图 + 1 图层） |
| 无 | 有 | 提示词拆分 | 2（底图 + 1 图层） |
| 有 | 有 | 框选 + 提示词 | 2（底图 + 1 图层） |

一次只分离一个主体；需要多个主体时重复执行，或使用自动拆分。

### 3.3 提交后

```text
1. 校验：模型已选；格式/尺寸预检通过
2. 关闭全屏框选
3. addPendingNodes('image', originFor(source), 1, `${source.title} · 图层分离`, source.id)
   → 自动创建新节点 + 源节点到新节点的连线
   → 节点状态 running，显示「生成中」
4. selectNode(pendingId)
5. generation.run({
     nodeId: pendingId,
     modelKey,
     prompt: finalPrompt,
     params: { layer_decomposition: true, layer_max_images, output_format: 'png', watermark: false, ... },
     refs: [{ path: source.path, role: 'reference', media: 'image', scope }],
     op: 'layer-split'
   })
```

- 不在全屏里等进度，不显示取消/错误面板。
- 生成失败、取消、重试全部复用新节点的现有生成机制。
- 完成时如果新节点仍是当前选中节点且窗口聚焦 → 自动进入图层编辑；否则只 toast「图层分离完成，双击节点编辑」并显示「图层 N」角标。
- 模型只返回底图时：节点保持完成，保留底图，显示「未拆出图层」警告 + 重试入口；不标记失败。

### 3.4 图层编辑

- 新节点显示底图 + 附着图层；左上角「背景已锁定」。
- 点击图层出现白色选框 + 四角等比缩放手柄；拖动移动，角柄缩放。
- 节点底部合并条：`调整图层位置或尺寸，合并生成新图片（本地合成，不调用模型）` + 「合并」+「×」。
- 没有附着图层时，合并条隐藏。
- 拖动图层时用画布级 ghost 跟随指针，避免被节点 DOM 裁切。
- 图层中心离开底图节点卡片 → 节点边框虚线高亮 + 「松手成为独立图片」。
- 松手后创建普通图片节点，源 output 标记 `layerAttached = false`。
- 独立图片节点拖回源底图节点卡片 → 源节点高亮「松手放回图层」；松手重新附着。
- 吸附只认源底图节点，不吸附到其他底图节点。
- 源节点被删除后，独立节点保持为普通图片，不再可吸附。
- 独立节点有出边时禁止附着，提示「该图层已连接下游，请先断开连线」。
- 独立节点 output `path` 与源图层不一致时禁止附着，提示「该图片已被编辑，不能作为原图层放回」。
- 编辑器图层列表增加「已分离」区，灰态显示 + 「放回」按钮；覆盖独立节点被拖到屏幕外、被删除的情况。
- 多图层组时，编辑器顶部显示组下拉；默认当前选中 output 的组，无组时取最新组。

### 3.5 合并

- 画布尺寸 = 底图宽高。
- 先画底图，再按 `zIndex` 画 `attached && visible` 的图层。
- `OffscreenCanvas.convertToBlob('image/png')` → IPC 落盘 → 同一节点新增 output 并选中。
- `op: 'layer-merge'`、`parentOutputId: base.id`、`layerGroupId` 作为归属。
- 合并后退出图层编辑，图层栈与 transform 全部保留。
- 再次双击或点「编辑图层」可继续调整、再次合并。
- `outputs` 裁剪时优先保留当前图层组的底图 + 图层，先丢最旧的普通/合并版本。

## 4. 请求与提示词

### 4.1 模型过滤

- 工具栏入口、全屏框选下拉、Agent 提案统一使用 `modelSupportsMode(model, 'layer')`。
- 不限模型 id；自定义 `http-template` 模型只要声明 `layer` 也可用。
- 供应商 `hasKey = false` 且不是免鉴权时，模型置灰并提示「未配置 API Key」。
- 无任何可用 layer 模型时：不打开全屏，直接弹配置引导，文案列出 Seedream 5.5 / 5.0 作为推荐。

### 4.2 参数

```ts
{
  layer_decomposition: true,
  layer_max_images: 2 | (autoMax + 1),
  output_format: 'png',
  watermark: false,
  // size 仅在模型声明了该参数时设为 '2K'，否则用模型默认值
  // 不传 background
  // 不传 n
}
```

- 自动模式：`layer_max_images = autoMax + 1`，`autoMax` 默认 4，范围 2–8。
- 框选/提示词模式：`layer_max_images = 2`。
- Seedream 5.0 最多 16 个图层，5.5 最多 99 个；UI 上限 8，天然安全。

### 4.3 提示词

框选 + 描述：

```text
只将 <bbox>x1 y1 x2 y2</bbox> 范围内、{描述} 的主体拆分为独立图层，
其余元素全部保留在底图；底图自然补全移除区域，保持透视、光照、景深、
纹理、颜色和噪点一致，不要新增物体。
```

只框选：

```text
只将 <bbox>x1 y1 x2 y2</bbox> 范围内的主体拆分为独立图层，
其余元素全部保留在底图；底图自然补全移除区域，保持透视、光照、景深、
纹理、颜色和噪点一致，不要新增物体。
```

只描述：

```text
只将 {描述} 拆分为独立图层，其余元素全部保留在底图；
底图自然补全移除区域，保持透视、光照、景深、纹理、颜色和噪点一致，不要新增物体。
```

自动：

```text
自动识别画面中的主要主体，分别拆分为独立图层，最多 {N} 个主体；
其余元素保留在底图；底图自然补全移除区域，保持透视、光照、景深、
纹理、颜色和噪点一致，不要新增物体。
```

说明：

- `<bbox>` 用原图像素坐标，作为只读参数拼接；用户只编辑语义部分。
- bbox 不作为可编辑文本，避免误删。
- 自动模式不保证一定返回 N 个图层，按实际返回建栈。

### 4.4 预检

- 渲染进程：检查图片格式（PNG/JPEG）和尺寸（512×512–6000×6000）；`OutputRef` 已有 width/height。
- 主进程：加载参考图时检查文件大小（≤30MB，按模型实际限制）；超限返回明确错误。
- 不新增 `media.stat` IPC。
- 超限提示具体限制；不自动缩放、不改变原图尺寸。

### 4.5 无图层结果

| 情况 | 处理 |
|---|---|
| 模型只返回底图，无图层 | 节点保持完成；保留底图；显示「未拆出图层」警告 + 重试入口 |
| 模型返回图层但 bbox 缺失 | 用归一化 bbox；仍缺失则整图 |
| bbox 写法不被中转站支持 | 显示接口错误；提示改用自动拆分或换模型，不静默降级 |
| 部分图层生成失败 | 按供应商行为处理；不生成半成品图层栈 |

错误文案统一为「模型未返回独立图层，请调整描述/框选后重试」，不按模式区分；不再持久化 `layerSplitMode`。

## 5. 数据模型

### 5.1 `OutputRef` 扩展

文件：`src/shared/canvas-schema.ts`

```ts
interface LayerTransform {
  x: number       // 基于输出底图像素
  y: number
  width: number
  height: number
}

interface OutputRef {
  // 现有字段…
  layer?: AssetLayer
  layerGroupId?: string
  layerTransform?: LayerTransform
  layerAttached?: boolean        // 默认 true
  layerVisible?: boolean
  layerLocked?: boolean
  detachedFrom?: {               // 仅独立图片节点
    nodeId: string
    outputId: string
    groupId: string
  }
}
```

### 5.2 图层组

- 同一次分层生成的所有 output 共享 `layerGroupId`（可用 `runId`）。
- `zIndex = 0` 是底图，`>= 1` 是图层。
- `layerTransform` 默认由 `boundingBox.absolute` 初始化；坐标基于输出底图，不是输入原图。
- 无 bbox 时用 `boundingBox.normalized × 底图尺寸`；仍无则整图。
- 图层图片可能被模型放大输出，合成时缩放到 bbox 尺寸。
- 同一节点可累积多个组（重试/再次生成）；组数 >1 时编辑器显示组下拉。

### 5.3 拖出 / 拖回

拖出不重新渲染：

- 独立图片节点直接引用原始图层 PNG，保留完整分辨率和透明边缘。
- 新节点宽高按拖出时的显示尺寸设置。
- 源 output 标记 `layerAttached = false`。
- 新节点 output 记录 `detachedFrom`、`parentOutputId`、`op: 'layer-detach'`。

拖回不重新渲染：

- 只吸附源底图节点。
- 根据独立节点在画布上的位置/尺寸，反算回底图坐标系的 `layerTransform`。
- 源 output 恢复 `layerAttached = true`，删除独立节点。
- 有出边时禁止附着；output `path` 与源图层不一致时禁止附着。
- 坐标换算在 `CineNodeView` 的拖拽逻辑中完成，store 只接收最终数值。

### 5.4 合并结果

- 合并结果作为普通 output：`op: 'layer-merge'`、`parentOutputId: base.id`、`layerGroupId` 作为归属。
- 不带 `layer` 元数据，不参与叠加。
- 插入同一节点并选中。
- 图层栈和 transform 不变，可再次编辑。

### 5.5 项目 schema

文件：`src/shared/project-schema.ts`

`outputRefSchema` 增加：

- `layerGroupId?: string`
- `layerTransform?: { x, y, width, height }`
- `layerAttached?: boolean`
- `layerVisible?: boolean`
- `layerLocked?: boolean`
- `detachedFrom?: { nodeId, outputId, groupId }`

不新增 `CineNodeData.layerStack`，图层栈由同一 `layerGroupId` 的 outputs 推导。

### 5.6 数量上限

- 节点 `outputs` 上限 100（`stores/generation.ts` 与 `project-schema.ts`）。
- UI 最多 8 个主体 + 底图 = 9 张。
- 裁剪时优先保留当前活动的 `layerGroupId` 底图 + 图层；先丢最旧的普通/合并版本。
- 不把自动模式上限暴露到 99，避免一次生成过多输出和费用。

## 6. 实现设计（图层分离）

### 6.1 删除本地链路

| 文件 | 改动 |
|---|---|
| `resources/vision-worker/worker.py` | 删除 `task_layer_split`、`TASKS['layer-split']`、`--background` 参数 |
| `src/main/media/vision.ts` | 删除 `layer-split` 分支和 background 输出 |
| `src/shared/media.ts` | `VisionTaskKind` 删除 `layer-split`；`VisionTaskResult` 删除 `background` |
| `src/renderer/src/stores/vision-tasks.ts` | 删除 `event.result.background` 写节点逻辑 |
| `src/renderer/src/canvas/nodes/node-operation-runner.ts` | 删除 `executeLayerSplit` 与分支 |
| `src/renderer/src/canvas/nodes/NodeToolbar.tsx` | 删除 layer-split 的 CropDialog 路径；新增全屏框选入口 |
| `src/renderer/src/canvas/nodes/node-operations.ts` | 去掉 `requires: vision-component`；增加 `modelMode?: ModelModeId`；设 `outputTarget: 'new-node'` |
| `src/renderer/src/panels/ComponentsSection.tsx` | 安装文案去掉「图层分离」 |

只删 `layer-split`；InSPyReNet / LaMa 继续服务抠图、重绘、去字幕、主体消除。

### 6.2 全屏框选组件

新建：`src/renderer/src/canvas/nodes/LayerSplitOverlay.tsx`

- `fixed inset-0`，与 topbar 平级。
- 图片 fit 显示；左键自由拖拽画轴对齐矩形；可移动、8 点等比缩放、重置。
- 滚轮缩放 0.5x–4x；空格/中键平移；左键始终画框。
- 局部撤销/重做最多 20 步。
- 模型下拉、分离数量、提示词、取消、开始拆分。
- 自动 >4 确认，同一数值每个会话只确认一次。
- `onConfirm({ rect?, prompt, modelKey, autoMax })` 交给父级创建 pending 节点并启动生成。
- 无 layer 模型时不打开本组件。

### 6.3 节点内图层叠加

新建：`src/renderer/src/canvas/nodes/LayerOverlay.tsx`（由 `CineNodeView` 渲染）

- 按 `layerTransform` 绝对定位附着图层。
- 选框、四角等比缩放手柄。
- 拖动时画布级 ghost；`nodrag nopan` 防止 React Flow 拖节点。
- 中心离开节点卡片 → 高亮 + 松手脱离。
- 合并条、「背景已锁定」角标。
- 独立节点拖到源节点上方 → 源节点高亮 + 松手附着。
- 「已分离」区：灰态图层 + 「放回」按钮。
- 多组时显示组下拉。

### 6.4 渲染与坐标换算

新建：`src/renderer/src/canvas/nodes/layer-compose.ts`

纯函数，便于单测：

- `layerRectFromBBox(bbox, baseWidth, baseHeight)`：默认 transform。
- `composeLayers(base, layers, size)`：合并绘制顺序与裁剪。
- `renderDetachedLayer(layer, transform)`：拖出时的显示尺寸换算（不重新编码）。
- `attachTransform(nodeRect, baseRect, layerSize)`：拖回时的坐标反算。
- `clampAutoMax(value)`：2–8。

### 6.5 合并落盘

- 渲染进程：`OffscreenCanvas` 合成 → `convertToBlob('image/png')` → `arrayBuffer()`。
- 主进程：在 `src/main/ipc/media.ts` 增加 `saveComposite` 通道，内部复用 `ingestAsset`。
- preload 同步暴露 `window.api.media.saveComposite`。
- 返回 `GeneratedAsset`，由 store 插入当前节点 outputs。

### 6.6 Store 动作

- `graph.ts`：`updateOutputLayer(nodeId, outputId, patch)`，更新 transform/visible/locked，提交一条历史。
- `assets.ts`：
  - `detachLayer(nodeId, outputId, dropPosition, displaySize)`
  - `attachLayer(sourceNodeId, detachedNodeId)`
  - `mergeLayerGroup(nodeId, groupId)`
- `generation.ts`：done 时识别 `asset.layer`，写 `layerGroupId = runId`，按 `zIndex` 排序，底图设为 `selectedOutputId`；无图层时保留底图 + 警告。
- UI store：`layerEditingNodeId`（不持久化），控制节点预览走「底图 + 图层」还是选中版本。

### 6.7 PromptBar 收口

文件：`src/renderer/src/canvas/PromptBar.tsx`、`src/shared/provider-schema.ts`

- 图片模式候选改为 `['t2i', 'i2i']`。
- `inferActiveMode`：有参考图只返回 `i2i`，不再返回 `layer`。
- `modelModeCompatibility`：图片输入只认 `i2i`，layer-only 模型不出现在 PromptBar。
- 旧项目 `inputMode === 'layer'` 防御性回退 `i2i`；不做用户提示/迁移。
- `layer_*` 参数加 `appliesTo: ['layer']`，PromptBar 不再显示。
- `MODEL_MODE_DEFINITIONS.layer` 保留（模型能力和工具栏用），label 可统一为「图层分离」。

### 6.8 Worker / inspyrenet 迁移 + alpha 修复

- 把 `worker.py` + `inspyrenet` 源码移到应用侧 `resources/vision-worker/`。
- 组件只保留模型 + Python 环境；现有 v1 组件继续可用，不需要重建 526MB 包。
- 构建配置：
  - `electron-builder.yml` 增加 `resources/vision-worker → vision-worker`。
  - `electron-builder.mac.yml` 增加同一项。
- 运行时路径：
  - `src/main/media/vision.ts` 新增 `visionWorkerDirectory()`，参考 `stems.ts`：
    `app.isPackaged ? join(process.resourcesPath, 'vision-worker') : join(app.getAppPath(), 'resources', 'vision-worker')`。
  - `baseArgs` 使用应用侧 `worker.py`；`--models` 仍指向 `componentDirectory('vision-models')/models`。
- `worker.py`：
  - `ROOT` 下已有 `inspyrenet`，`sys.path.insert(0, join(ROOT, 'inspyrenet'))` 保持。
  - 删除 `task_layer_split`、`TASKS['layer-split']`、`--background`。
  - `task_matte_image`：`rgba = np.dstack([image, alpha * 255])`，不再 `image * alpha`。
  - `task_matte_video`：`rgba = np.dstack([frame, alpha * 255])`，不再 `frame * alpha`。
- `src/main/components/service.ts`：
  - `vision-models` 安装检查放宽为 `models/ckpt_fast.pth` + `models/big-lama.pt`；`worker.py` / `inspyrenet` 不再必需（兼容 v1，也支持未来 models-only v2）。
- 验收：毛发/半透明边缘分别合成到白底和黑底，无暗边、无光晕；应用更新后即生效，不依赖组件 v2。

### 6.9 Agent / MCP

新增三个工具：

| 工具 | 参数 | 确认 | 行为 |
|---|---|---|---|
| `layer_merge` | `nodeId`、`groupId?` | 否 | 本地合并当前组，写回同一节点新版本 |
| `layer_detach` | `nodeId`、`outputId`、`x?`、`y?`、`width?`、`height?` | 是 | 默认放到源节点右侧；创建独立图片节点 |
| `layer_attach` | `sourceNodeId`、`detachedNodeId` | 是 | 有出边或已编辑时拒绝；成功则删除独立节点 |

- 工具声明在 `src/shared/agent-tools.ts`，执行器在 `src/main/agent/tools/`，渲染端在 `canvasBridge.ts` 或新增 `layerBridge.ts` 注册 handler。
- MCP 工具从 `AGENT_TOOLS` 投影，补 `mcp` 元数据。
- `layer-split` 保持 `generationProposable: true`、`requiredMode: 'layer'`，Agent 通过 `generation_propose` 提案。
- 覆盖率检查：`corepack pnpm check:agent-coverage`。
- `docs/agent-capabilities.md` 同步。

## 7. 组件在线更新（P5）

### 7.1 目标

- 已安装组件在新版本发布后可在线更新；有更新时「卸载」旁边出现「更新」。
- 六个组件通用，不只 `vision-models`。
- 更新失败保留旧版本，不把组件弄坏。

### 7.2 版本源

- 现有远端 manifest：`depth-runtime`、`vision-models`。
- 新增四个 manifest：
  - `depth-model-manifest.json`
  - `whisper-runtime-manifest.json`
  - `whisper-model-manifest.json`
  - `stem-model-manifest.json`
- `src/main/components/manifest.ts` 的 `COMPONENTS` 为四个组件补 `manifestUrl`；权重 URL 可沿用现有官方地址。
- `fetchManifest` 拉取失败时仍退回内置 fallback；离线不显示更新。

### 7.3 数据与 IPC

`src/shared/components.ts` 的 `ComponentStatus` 增加：

```ts
latestVersion?: number
latestSize?: number
updateAvailable?: boolean
```

新增 `components.checkUpdates`：

- 并行拉取六个组件的远端 manifest，15 秒超时。
- 比较 `latest.version > installed.version`。
- 返回每个组件的 `latestVersion/latestSize/updateAvailable`。
- 单个组件失败不影响其他组件；失败视为「无更新」。
- 结果缓存持久化到 `userData/components/updates.json`，24 小时内不重复后台拉取，应用重启后仍有效；手动刷新绕过缓存并重写；安装/卸载成功后清空缓存，避免首次安装后红点延迟。

### 7.4 UI

`src/renderer/src/panels/ComponentsSection.tsx`：

- 已安装且有更新：显示「更新」主按钮 + 「卸载」次按钮。
- 已安装且最新：只显示「卸载」。
- 状态文案：`已安装 · v1 · 有更新 v2 · 547 MB`。
- 点击「更新」→ 确认框：`v1 → v2 · 526MB`；确认后调用 `installComponent(kind)`。
- 进度、暂停、失败提示复用现有下载流程。
- 更新成功后刷新状态，红点按剩余更新数量更新。
- 红点：
  - 设置导航「模型与运行时」；
  - 对应组件卡片。
  - 常驻直到没有可用更新，不因「看过设置页」而消失。

### 7.5 启动检查与占用

- 应用启动进入主界面后，渲染进程在后台调用一次 `checkUpdates`；24 小时内不重复。
- 设置页打开时读取缓存，并提供「检查更新」手动刷新。
- 有任务正在使用该组件时禁止更新：
  - 能查到活跃任务的组件：`vision` / `depth` / `stem` / 自动字幕转写，提示「请等待任务完成」。
  - `depth-runtime` 被上述任一任务占用时同样阻断。
  - 查不到任务状态的组件：允许更新，依赖安装器原子替换 + 失败回滚。
- 安装器已有 staging → 备份 → 交换 → 回滚，更新复用该路径。

### 7.6 发布与测试

- `vision-models` v2 与下一次应用发版一起上传（2026-11-27 用户决定）；v2 为 models-only，worker/inspyrenet 已在应用侧。
- 用本地 mock manifest server + 伪造已安装 v1 验证：红点、「已安装 · v1 · 148 MB · 有更新 v2」、「更新」+「卸载」同屏，见 `artifacts/p5-update.png`；缓存与占用门禁由 `service.test.ts`、`components.test.ts` 覆盖。
- 发布清单：四个新组件 manifest + `vision-models` v2 manifest 随应用发版上传到对应 release；更新 release 资产后测试 `fetchManifest` 与在线更新。
- `depth-runtime` 3.1GB 更新必须走确认框。
- 发版动作等用户通知后执行。

## 8. UI 交互优化与多选区（P6）

日期：2026-11-27
状态：已实施（多 bbox 的真实模型行为待验证）

### 8.1 现状问题

原实现虽然是全屏页，但视觉语言仍是设置页式的三段式：顶部 48px 实心标题栏、中间裸图、底部通栏表单。问题具体是：

- 全屏纯色底切断了画布上下文，看起来像独立弹窗。
- 顶部标题栏与底部通栏把画面切成三段，视觉重心在 chrome 而不是图片。
- 底部面板比图片宽，模型/数量下拉占满一行，表单感重。
- 主操作「开始拆分」是小号右对齐按钮，不像页面核心动作。
- 框选后没有选区回显，用户不知道框了哪里、框了几个。
- 选框是圆形手柄 + 大外阴影，缺少专业编辑工具感。
- 编辑态右上角 196px 图层面板与图片主体不成比例。
- 合并条塞在节点卡片底部，挤压节点高度，裁剪与落点还要按 33px 估算。

### 8.2 目标

1. 图片是主角：居中、圆角、悬浮阴影，背景保留画布并暗化。
2. 操作浮起来：顶部胶囊工具条，底部与图片同宽的浮动卡片。
3. 状态贴着内容：选区 chip 在卡片内，提示浮在图片上，合并条浮在图片下。

### 8.3 拆分态：就地替换节点上下 UI

LibTV 不是全屏浮层，而是**选中节点的上下文 UI 切换**：节点图片保持画布原位和原尺寸，只把上方 `NodeToolbar` 换成「图层分离」工具条、下方 `PromptBar` 换成「图层分离」面板；提交或取消后恢复原工具栏与 PromptBar。画布缩放、平移、相邻节点都保持可见。

```text
          [✕ │ 图层分离 │ ↶ ↷]        ← 节点上方 10px，替换原工具栏
        ┌──────────────────────┐
        │                      │
        │   选中节点图片（不动）  │
        │   白线选区 + 方角手柄   │
        │                      │
        └──────────────────────┘
        [框选你想要拆分的物体]      ← 图片内提示，框选后消失

        ┌──────────────────────┐
        │ 图层分离        数量 ▾ │  ← 节点下方 10px，跟随节点
        │ [模型 ▾]              │
        │ [选区 1 ×] [选区 2 ×]  │
        │ ┌──────────────────┐ │
        │ │ 描述或框选…       │ │
        │ └──────────────────┘ │
        │ [  取消  ] [    拆分    ] │
        └──────────────────────┘
```

关键尺寸：

- 顶部工具条：高 36px，`rounded-card`（12px，与节点工具栏一致），`bg-surface-raised` + `shadow-float`，固定在节点卡片上方 10px、水平居中；内容只有关闭 / 标题 / 撤销 / 重做。
- 框选层：覆盖节点图片区域（`cardRef` 的 rect），不遮挡画布其他部分；坐标按图片实际显示尺寸换算，随画布缩放/平移自动更新。
- 底部面板：跟随节点图片下方 10px、水平居中，宽度取 `clamp(380, 图片宽, 720)`；进入时如果下方空间不足，自动上移画布，面板最大高度按视口剩余空间限制并在内部滚动。标题行放数量，模型独占一行。
- 主按钮只写「拆分」，不显示图标、数量或费用；与取消按钮平分。
- 框选：1px 白线 + 四角 10px 白色方块手柄，框外 1px 暗边；左上角序号。
- 选区外遮罩：有选区时用 SVG evenodd 路径给未框选区域覆盖 `--selection-mask`（黑色 12%），选区保持原亮度；外层按图片圆角（12px × 画布缩放）裁剪，避免出现直角。
- 不再渲染全屏图片、全屏遮罩、overlay 缩放/平移；缩放和平移直接使用画布本身。
- 提交后 `layerDialog` 关闭，原工具栏与 PromptBar 自动恢复；不留下分离态 UI。
- 设置面板打开时隐藏分离工具条/面板/框选层，避免覆盖设置；关闭设置后恢复分离态。

### 8.4 多选区

- 数据结构：`Box { id, x, y, width, height }`，`boxes: Box[]`，最多 4 个；提交时转成 `VisionRect[]`。
- 交互：
  - 图片空白处按住左键拖拽新增选区；框内拖动移动；四角/四边手柄缩放。
  - 点击选区或 chip 选中；`Delete` / `Backspace` 删除选中；chip 上的 × 删除对应选区。
  - 撤销/重做栈存 `Box[]` 快照，最多 20 步。
  - 达到 4 个后继续拖拽会提示「最多框选 4 个区域」。
  - 存在选区时，未框选区域覆盖一层淡灰遮罩（`--selection-mask`），突出选区。
- 提示词：每个选区生成一个 `<bbox>x y x2 y2</bbox>`，用「、」连接；多框文案使用「这些区域内的主体分别拆分为独立图层」。
- 输出上限：`layerMaxImages = auto ? autoMax + 1 : max(2, rectCount + 1)`。
- 模型限制：Seedream 5.5 的 `layer_decomposition_options` 没有结构化 bbox 入参，多选区只能通过 prompt 里的多个 `<bbox>` 表达；真实模型是否按多个 bbox 分别拆分，需用中转站验证。若不支持，退化为「首框优先」并在 UI 提示。

### 8.5 编辑态

- 移除节点内顶部图层胶囊；图层入口、当前图层名、已分离数量与「合并」合并到节点下方 6px 的悬浮条，不再占用节点顶部。
- 点击悬浮条左侧「图层 N」在条上方弹出图层面板（260px）：组选择、18px 缩略图、显隐/锁定、已分离放回；悬浮条与面板都用 `rounded-card`（12px），与节点工具栏一致。
- 悬浮条和选中图层的工具条使用 `scale(var(--canvas-zoom-inverse,1))`，画布缩放时保持屏幕尺寸不变。
- 选中图层时在框上方显示工具条：旋转 90°、水平翻转、垂直翻转、下载；不包含其他功能。工具条跟随图层框，与「背景已锁定」重叠时直接覆盖 badge，不上移离开图片。
- 选中图层：白线 + 四角方块手柄，与拆分态统一。
- 独立图层节点标题即图层名，图片上不再重复显示图层名 badge；仅图层组内编辑时显示「底图/图层名」。
- 「背景已锁定」badge 放在图片左上角（`top-2 left-2`）。
- 合并条不参与节点高度；同步删除 `LAYER_MERGE_BAR_HEIGHT = 33` 及 `assets.ts` 的落点补偿。文案为「本地合成，不调用模型」，不引入积分/费用概念。
- 拖动预览：底图由 canvas 只画底图，图层改为 DOM 图片叠在卡片上；编辑态卡片与图片容器 `overflow-visible`，图层拖到图片边缘外仍完整显示，不再被裁掉一半。
- 拖动预览：图片加载走缓存，先画到离屏 canvas，完成后一次性替换显示 canvas；旧帧在 `await` 后按 token 退出，避免拖动时闪成纯色或出现多帧残影。
- 进入拆分态时隐藏编辑态 UI：悬浮条、图层面板、背景 badge、节点选中蓝框都让位给分离工具条/框选层。

### 8.6 共用 chrome

新增 `LayerFloatBar` / `LayerFloatBarGroup` 的职责由两个 overlay 内的同构容器承担；本轮先不抽独立文件，避免为两种不同内容过度抽象。共用约束：

- 只用 `rounded-md/card/panel/pill`，不写异形圆角。
- 浮层表面只用 `bg-surface-raised` / `bg-overlay` / `shadow-float`，不新增硬编码色值。
- `Select` 用 `size`，`Textarea` 用 `rows` + `min-h`，不覆盖 `!h-*`。

### 8.7 不改什么

- 不改拆分/合并逻辑、`layerGroupId`、`layerTransform` 数据结构和 Agent 三个工具。
- 不改主进程 IPC、模型请求协议；多选区只影响送入模型前的 prompt 文本。
- 不新增「图层重绘 / 对齐 / 分离」等模型能力；LibTV 截图中的这些图标不在本轮范围。

### 8.8 验收

- 1440×900、1280×800 两档：节点图片、顶部工具条、底部面板不重叠；面板高度不超过视口 45%。
- 进入/退出分离态时，节点工具栏与 PromptBar 正确切换并恢复；其他节点和画布仍可见。
- 框选在 0.5x / 1x / 4x 缩放和平移下坐标准确；撤销/重做不回退。
- 新增、移动、缩放、删除 2–4 个选区，chip 与画布框一一对应；提交 prompt 含全部 bbox。
- 深色、浅色主题都只用 token；`check:ui` 通过。
- `typecheck`、全量测试通过；`layer-split-prompt` 增加多框用例。
- 真实中转站验证多 bbox：若模型只拆首框，记录并在 UI 标注限制。

### 8.9 风险

| 风险 | 处置 |
|---|---|
| Seedream 不支持多 bbox | 先用真实请求验证；不支持则退化为单框优先并提示 |
| 卡片宽度随图片变化导致窄图过窄 | `clamp(420, 图片宽, 720)`，移动端再加 `max-w` |
| 合并条外移后落点计算变化 | 同步删除 33px 补偿，更新 `attachTransform` 单测 |
| 全屏 blur 性能 | 仅 2px；低端机可去掉 backdrop-blur |
| 选区多时 prompt 过长 | 最多 4 个，bbox 文本长度可控 |

## 9. 改动清单

| 文件 | 改动 | 批次 |
|---|---|---|
| `resources/vision-worker/worker.py` | 删 `task_layer_split`；修 alpha 预乘；保留 matte/inpaint | P0 |
| `resources/vision-worker/inspyrenet/` | 从组件 v1 迁入源码，保留 license | P0 |
| `electron-builder.yml` / `electron-builder.mac.yml` | 增加 `resources/vision-worker` 到 extraResources | P0 |
| `src/main/media/vision.ts` | 删除 `layer-split` 分支；worker 路径改应用侧 | P0 |
| `src/main/components/service.ts` | vision 安装检查放宽为模型文件 | P0 |
| `src/shared/media.ts` | 删 `layer-split` kind / `background` 字段 | P0 |
| `src/renderer/src/stores/vision-tasks.ts` | 删 background 写节点 | P0 |
| `src/renderer/src/canvas/nodes/node-operation-runner.ts` | 删 `executeLayerSplit` | P0 |
| `src/renderer/src/canvas/nodes/node-operations.ts` | 去掉视觉组件依赖；增加 `modelMode` | P0 |
| `src/shared/node-operation-specs.ts` | `layer-split` 改为 generationProposable + requiredMode | P0 |
| `src/renderer/src/panels/ComponentsSection.tsx` | 文案去掉图层分离 | P0 |
| `src/renderer/src/canvas/PromptBar.tsx` | 收掉 layer 模式；旧 inputMode 防御性回退 | P0 |
| `src/shared/provider-schema.ts` | 兼容/推断不再路由 layer；`layer_*` appliesTo | P0 |
| `src/renderer/src/canvas/nodes/LayerSplitOverlay.tsx` | 新建：全屏框选、缩放/平移、模型、四种输入、数量 | P1 |
| `src/renderer/src/canvas/nodes/layer-split-prompt.ts` | 新建：bbox/模板/校验纯函数 | P1 |
| `src/renderer/src/canvas/nodes/NodeToolbar.tsx` | 打开全屏；创建 pending 节点并启动生成；「编辑图层」 | P1/P3 |
| `src/shared/canvas-schema.ts` | `OutputRef` 图层字段 | P2 |
| `src/shared/project-schema.ts` | `outputRefSchema` 同步字段 | P2 |
| `src/renderer/src/stores/generation.ts` | 图层组、排序、底图选中、无图层警告 | P2 |
| `src/renderer/src/canvas/nodes/LayerOverlay.tsx` | 新建：叠加、选框、合并条、已分离区 | P2/P3 |
| `src/renderer/src/canvas/nodes/CineNodeView.tsx` | 渲染叠加、编辑态、角标、双击 | P2 |
| `src/renderer/src/canvas/nodes/layer-compose.ts` | 新建：合并/坐标纯函数 | P2 |
| `src/main/ipc/media.ts` | `saveComposite` 通道 | P2 |
| `src/preload/index.ts` | 暴露 `saveComposite` | P2 |
| `src/renderer/src/stores/canvas/slices/assets.ts` | detach/attach/merge | P3 |
| `src/renderer/src/stores/canvas/slices/graph.ts` | `updateOutputLayer` | P3 |
| `src/shared/agent-tools.ts` / `src/main/agent/tools/` | `layer_merge/detach/attach` | P4 |
| `src/renderer/src/agent/canvasBridge.ts` 或 `layerBridge.ts` | Agent handler | P4 |
| `src/shared/components.ts` | `latestVersion/latestSize/updateAvailable` | P5 |
| `src/main/components/manifest.ts` | 四个组件补 `manifestUrl` | P5 |
| `src/main/components/service.ts` | `checkUpdates`、24h 缓存、占用检查 | P5 |
| `src/main/ipc/components.ts` / preload | `checkUpdates` 通道 | P5 |
| `src/renderer/src/panels/ComponentsSection.tsx` | 更新按钮、确认、红点、状态 | P5 |
| 设置导航 | 「模型与运行时」红点 | P5 |
| 测试 | prompt、compose、store、golden body、更新流程 | P4/P5 |
| 文档 | 02/08/11、ui-spec、agent-capabilities、models、model-config-skill | P4/P5 |

## 10. 影响模块

| 模块 | 影响 |
|---|---|
| 02 生成与模型 | 主改动：layer 模型路由、请求参数、输出解析、PromptBar 收口 |
| 01 画布 | 节点叠加、双击编辑、拖出/拖回、版本栈、多图层组 |
| 06 Agent | 新增三个图层工具；`layer-split` 提案；覆盖率 |
| 07 存储/IPC | `saveComposite`、`outputRefSchema`、`components.checkUpdates` |
| 10 UI | 全屏框选、图层叠加、组件更新按钮/红点 |
| 组件系统 | 四个新 manifest、更新检查、24h 缓存、占用阻断 |
| 文档 | 能力表、UI 规格、模型说明、Agent 清单 |

## 11. 验收

### 11.1 图层分离

1. `grep layer-split` 不再命中 `worker.py`、`vision.ts`、`NodeToolbar` 的本地执行路径。
2. 无 layer 模型时，点击「图层分离」只出现配置引导，不打开全屏、不启动本地任务。
3. 留空直接点「开始拆分」→ 自动识别主要主体，返回底图 + N 个图层（默认最多 4 个主体）。
4. 自动模式把「分离数量」改为 2 → 最多返回底图 + 2 图层；调到 >4 时弹一次确认，同一数值不重复弹。
5. 框选一只狗 → 固定底图 + 1 图层；底图无狗形残影。
6. 只写「蓝色房子」→ 底图 + 1 个房子图层。
7. 框选 + 提示词 → bbox 优先，提示词作为框选主体的补充描述。
8. 左键自由拖拽画轴对齐矩形；选框可移动、8 点缩放、重置；滚轮缩放/空格平移可用。
9. 按钮旁没有费用/张数小字。
10. 提交后全屏立即关闭，画布出现「新节点 + 连线 + 生成中」。
11. 生成失败 → 错误显示在新节点上，可重试。
12. 模型只返回底图 → 节点完成，保留底图，显示「未拆出图层」+ 重试。
13. 图层在节点内可移动/等比缩放；「背景已锁定」和合并条出现。
14. 图层中心拖出节点 → 独立图片节点；底图不再叠加它。
15. 独立节点有出边 → 禁止附着，提示先断开下游。
16. 独立节点被编辑（path 不一致）→ 禁止附着，提示已被编辑。
17. 「已分离」区显示灰态图层 + 「放回」；可恢复到原位置。
18. 多图层组时显示组下拉；合并结果带组归属；100 版本裁剪保护当前组。
19. 合并 → 同一节点新版本并选中；无网络请求；2K 下 <300ms；图层栈保留。
20. 合并后退出编辑；再次进入编辑 → 图层位置保留，可再次合并。
21. PromptBar 不再出现「图层拆分」；layer-only 模型不出现在 i2i 选择里。
22. 无凭据的 layer 模型置灰，提示未配置 API Key。
23. 框选/提示词/自动模式在图片超限时被预检拦截，不建 pending 节点。
24. 抠图结果合成白底/黑底无暗边；应用更新后即生效，不依赖组件 v2。
25. Agent 三个工具可用；`layer_detach`/`layer_attach` 需确认；`layer_attach` 对有出边/已编辑节点拒绝。

### 11.2 组件在线更新

26. 六个组件都能读到远端版本；有更新时显示「更新」+「卸载」。
27. 点击「更新」弹 `v1 → v2 · 大小` 确认；确认后下载，进度/暂停/失败复用现有流程。
28. 更新失败保留旧版本，组件仍可用。
29. 有任务正在使用组件时禁止更新，提示等待；查不到任务状态时由安装器回滚兜底。
30. 启动后台检查 24 小时内不重复；设置页可手动刷新；离线不显示更新。
31. 红点在设置导航「模型与运行时」和组件卡片常驻，直到更新完成。
32. 本次不发布 `vision-models` v2；staging manifest / 小组件验证更新链路。

### 11.3 工程校验

33. `corepack pnpm typecheck`、`test`、`check:ui`、`check:docs`、`check:agent-coverage` 全过。
34. 文档同步：`08-capabilities` 不再把图层分离算作本地视觉能力；`ui-spec` 更新全屏框选与图层编辑；`agent-capabilities` 更新三个工具。

## 12. 风险与取舍

| 风险 | 处理 |
|---|---|
| 删除本地后，离线/无模型不可用 | 已确认；UI 给明确引导，推荐 Seedream 5.5 / 5.0 |
| 云端按输出张数计费 | 默认自动 4 个主体、上限 8；框选/提示词固定 1；>4 确认 |
| bbox 写法在部分中转站不兼容 | 显示接口错误；提示改用自动拆分或换模型，不静默降级 |
| 自动模式拆分数量不稳定 | 按实际返回建栈；0 图层按完成 + 警告处理 |
| 5.0 最多 16 个图层 | UI 上限 8，天然安全 |
| 4K 合成内存 | OffscreenCanvas + 及时释放；先支持 2K，4K 后续压测 |
| 拖出/拖回坐标误差 | 坐标换算集中在 `layer-compose.ts`，加单测；附着后允许继续微调 |
| 独立节点有下游连线 | 禁止附着，提示先断开，避免静默断边 |
| 独立节点被编辑 | path 不一致禁止附着，避免静默丢失编辑 |
| 源节点删除后独立节点无法拖回 | 保持普通图片，不报错 |
| 旧项目 `inputMode = layer` | 防御性回退 `i2i`；不做用户提示/迁移 |
| PromptBar 收掉 layer 模式后，layer-only 模型不可用 | 预期；layer-only 模型只服务工具栏图层分离 |
| Worker 迁移后组件仍带旧 worker.py | 应用侧 worker 优先；组件 v1 兼容，未来 v2 可移除 |
| `inspyrenet` 迁入应用 | 保留 license/来源；`resources/vision-worker` 加入 extraResources |
| 组件更新目录被占用 | 有活跃任务时阻止；查不到任务状态时依赖原子替换回滚 |
| 启动后台检查增加网络请求 | 24h 缓存 + 手动刷新；离线静默 |
| 四个组件没有远端 manifest | 本方案补齐；发布资产是主要成本 |
| vision-models v2 只有清理价值 | 本次不发布；等下次模型更新再发 |

## 13. 工作量与顺序

| 批次 | 内容 | 预估 |
|---|---|---|
| P0 | Worker/inspyrenet 迁移、alpha 修复、删除本地、PromptBar 收口 | 1–1.5 天 |
| P1 | 全屏框选、缩放/平移、模型下拉、四种输入、分离数量/确认、预检 | 2–2.5 天 |
| P2 | 图层栈、叠加、合并条、合并落盘、无图层警告 | 1.5–2 天 |
| P3 | 拖动/缩放、拖出独立、拖回附着、已分离区、多组选择 | 2.5–3.5 天 |
| P4 | 测试、文档、三个 Agent 工具 | 1–1.5 天 |
| P5 | 六个组件 manifest、checkUpdates、更新按钮/红点、占用阻断 | 2–3 天 |
| 合计 | | **10–14 天** |

建议顺序 **P0 → P1 → P2 → P3 → P4 → P5**。P1 完成即可先用中转站配置验证 Seedream 底图质量；P5 可与 P3/P4 并行，但发布前必须完成。

## 14. 决策记录

| 日期 | 决策 |
|---|---|
| 2026-11-26 | 删除本地 InSPyReNet + LaMa 图层分离，只使用声明 `layer` 模式的模型 |
| 2026-11-26 | 模型范围不限 id，所有 `layer` 模型可用；无凭据模型置灰 |
| 2026-11-26 | 自动拆分：留空直接拆分，默认最多 4 个主体，范围 2–8；>4 每数值每会话确认一次 |
| 2026-11-26 | 提示词拆分、框选拆分、框选 + 提示词并存；框选/提示词固定 1 个主体 |
| 2026-11-26 | 框选为鼠标左键自由拖拽轴对齐矩形；支持滚轮缩放/空格平移 |
| 2026-11-26 | 按钮旁不显示费用/张数小字 |
| 2026-11-26 | 提交后立即建 pending 节点 + 连线，节点显示生成中 |
| 2026-11-26 | 无图层结果按完成处理，保留底图 + 警告，不标记失败 |
| 2026-11-26 | 图层中心离开节点卡片即独立；拖回源节点重新附着 |
| 2026-11-26 | 有出边或已编辑的独立节点禁止附着 |
| 2026-11-26 | 编辑器增加「已分离」区 + 「放回」 |
| 2026-11-26 | 合并写回同一节点新版本；合并后退出编辑，保留图层栈；合并结果带组归属 |
| 2026-11-26 | 支持同一节点多图层组；组数 >1 显示组下拉；100 版本裁剪保护当前组 |
| 2026-11-26 | 收掉 PromptBar 的图层拆分模式，只留工具栏入口；不做旧模板兼容 |
| 2026-11-26 | worker.py + inspyrenet 移到应用侧；组件只保留模型 + Python 环境；alpha 修复随应用发版 |
| 2026-11-26 | 预检：渲染进程查格式/尺寸，主进程查文件大小；不新增 stat IPC |
| 2026-11-26 | Agent 增加 `layer_merge`、`layer_detach`、`layer_attach`；后者需确认 |
| 2026-11-26 | 组件在线更新纳入本方案 P5，六个组件通用 |
| 2026-11-26 | 有更新时同时显示「更新」和「卸载」；点击更新弹版本/大小确认 |
| 2026-11-26 | 启动后台检查，24h 不重复；红点常驻到更新完成 |
| 2026-11-26 | 有任务占用组件时禁止更新；查不到任务状态时依赖安装器回滚 |
| 2026-11-26 | 本次不发布 vision-models v2；用 staging manifest / 小组件验证更新链路 |

## 15. 附：与 LibTV 对照

| 维度 | LibTV | CineLab 目标 |
|---|---|---|
| 分层 | 云端语义图层分解，底图完整补全 | 所有 `layer` 模型，同一机制 |
| 自动拆分 | 留空自动识别 | 支持，默认最多 4 个主体 |
| 提示词拆分 | 支持 | 支持，固定 1 个主体 |
| 框选拆分 | 支持 | 支持，固定 1 个主体；左键自由矩形 + 缩放/平移 |
| 输出 | 底图 + 图层，图层在底图节点内 | 图层栈，同一节点 outputs |
| 背景锁定 | 有 | 有 |
| 移动/缩放 | 支持 | 支持，等比缩放 |
| 拖出独立 | 支持 | 支持，中心离开节点即独立 |
| 拖回附着 | 未确认 | 支持，只吸附源节点；有出边/已编辑时阻断 |
| 合并 | 本地、不消耗积分 | 本地、不调模型、不产生费用 |
| 合并结果 | 新图片 | 同一节点新版本，保留图层栈 |
| PromptBar 入口 | 无 | 收掉，只留工具栏 |

> 说明：LibTV 的后端实现未公开；本方案只对齐「语义图层分解 + 本地合成」的行为，不依赖某个具体模型。Seedream 5.5 的 `layer_decomposition` 是当前最接近的可用能力。
