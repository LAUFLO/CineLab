# 结果节点隐藏 PromptBar 方案

日期：2026-11-22
状态：参考（已实施）
关联：[ui-spec.md](ui-spec.md)、[code-map/01-canvas.md](code-map/01-canvas.md)、[ui-polish-plan.md](ui-polish-plan.md)

## 1. 背景

Prompt Bar 原本只对 `assetOnly` 的素材节点隐藏。裁剪、抽帧、分离音视频、人声/背景音提取、去字幕、图层分离、分镜拉片、导演台预演等操作产出的结果节点没有写入 `assetOnly`，因此仍显示提示词输入框。

这些节点是结果素材，不是创作节点。应只保留上方 NodeToolbar，隐藏下方 PromptBar；用户仍可通过工具栏继续派生操作，或通过右侧 `+` 创建下游生成节点。

## 2. 规则

- **创作节点**：显示 PromptBar。包括空白节点、Prompt Bar 直接生成并写回版本栈的节点。
- **结果/素材节点**：隐藏 PromptBar。包括上传/素材库/导入、操作派生结果、AI 工具栏新建结果（含打光/光影校正/人像/重绘/擦除/元素编辑）、拉片/导演台/剪辑室产出、生成历史插入。
- 结果节点保留 NodeToolbar。
- `addPendingNodes` 是结果占位 API，默认写入 `assetOnly: true`；`applyOutput` 保留该标记。
- 旧项目通过输出 `op` / model 兜底识别，不要求重新生成。

## 3. 实现

1. `shared/node-operation-specs.ts` 增加 `isResultOutputOp` / `isResultOutput`。
2. `AddAssetLayout` 增加 `assetOnly`；`addPendingNodes` 默认 `assetOnly: true`。
3. `applyOutput` 根据结果 op 或已有标记保留/设置 `assetOnly`。
4. `PromptBar` 的纯素材判定增加输出 op / model 兜底。
5. 标记结果创建路径：
   - `addPendingNodes` 自动覆盖操作/生成结果；
   - `VideoOpNodeView` 结果节点；
   - `HistoryPanel`、`film-study`、`stage/preview-runner`、`StageWindow` 的 `addAssetNodes` 结果；
   - 拉片分镜表、镜详情文本、`addShotNodes` 图像/文本结果写入 `assetOnly: true`；
   - 剪贴板粘贴的图片/文本写入 `assetOnly: true`；
   - `studio/nodes` 已有 `assetOnly`；
   - 上传/素材库/导入/Agent 资产库已有 `assetOnly`。
6. `color-grade` / `portrait` / `inpaint` / `erase` / `element-edit` 改为新建结果节点；不加入 `RESULT_OUTPUT_OPS`，旧项目已写回原节点的历史结果继续显示 PromptBar。
7. `relight` 改为新建结果节点并连线；新节点由 `addPendingNodes` 写入 `assetOnly: true`，旧项目已写回原节点的打光结果保持原状。`relight` 不加入 `RESULT_OUTPUT_OPS`，避免旧项目源节点被误判为结果节点。
8. 自定义光位复用 `relight` 的新节点逻辑；只有 PromptBar 直接生成继续写回版本栈。

## 4. 结果 op 清单

- 本地：`grid-split`、`crop`、`crop-free`、`video-crop`、`trim`、`stitch`、`storyboard-stitch`、`motion-capture`、`深度动作捕捉`、`layer-split`、`matting`、`object-remove`、`outpaint`、`cutout`、`reverse-prompt`、`audio-trim`、`audio-speed`、`split-av-*`、`frame-*`、`subtitle-*`。
- AI 新建结果：`grid-generate`、`character-sheet`、`time-shift`、`multi-angle`、`panorama`、`relight`、`color-grade`、`portrait`、`inpaint`、`erase`、`element-edit`、`shot-retake`、`element-replace`、`extend`。
- 旧项目 model 兜底：`本地分离`、`本地截取`、`本地画面裁切`、`本地框选去字幕`、`本地抽帧`、`本地宫格切分`、`分镜拼接`、`逐帧拉片`、`InSPyReNet`、`LaMa`、`深度动作捕捉`、`导演台`、`整片预演`、`剪辑室素材`。

## 5. 验收

- 分离音视频/人声/背景音结果节点：无 PromptBar，有上方工具栏。
- 裁剪、抽帧、去字幕、图层分离、抠像、主体消除、扩图、音频截取/变速、分镜拼接：同样无 PromptBar。
- AI 工具栏新建结果节点：无 PromptBar。
- 拉片/导演台/剪辑室/生成历史结果节点：无 PromptBar。
- 空白创作节点、Prompt Bar 直接生成节点：仍有 PromptBar。
- 电影级光影校正、人像质感、重绘、擦除、元素编辑、打光（含自定义光位）：新建结果节点且无 PromptBar。
- 旧项目已有分离、打光等派生结果无需重新生成即可隐藏 PromptBar；旧项目写回原节点的光影校正/人像/重绘/擦除/元素编辑保持原样。
