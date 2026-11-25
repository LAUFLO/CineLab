# 扩图改为生图模型图生图方案

日期：2026-11-25
状态：已实施（真实模型待复测）
适用版本：v0.5.x
最后核对：2026-11-25

> 目标：扩图不再使用本地 LaMa，统一使用用户配置的图片模型做图生图；目标比例只来自节点工具栏/右键菜单，优先精确匹配，没有精确选项时自动选最接近的尺寸，只有完全无法控制比例的模型才置灰。

## 1. 背景

改造前，扩图有两条路径：

1. 已安装本地视觉组件：`executeOutpaintOrCutout` 直接启动 `outpaint-image` 视觉任务，由 LaMa 缩放原图、反射填边并补全，结果模型名为 `LaMa 扩图`。
2. 未安装视觉组件：回退到 `AiOperationDialog`，用图片模型提示词版扩图。

问题：

- LaMa 只做低层纹理补全，不理解场景语义，大面积扩图容易糊、重复纹理、透视断裂。
- 两条路径行为不一致，用户无法选择模型。
- 回退路径没有把菜单里的目标比例传给模型参数，输出比例不可控。
- Agent 可直接执行 `outpaint`，绕过模型选择。
- 组件设置页仍宣称视觉模型可以解锁“本地扩图”。

## 2. 最终决策

| 决策 | 结论 |
|---|---|
| 本地扩图 | 彻底删除，包括 Python worker、主进程分支、类型字段和组件文案 |
| 目标比例 | 不新增比例控件，只使用工具栏/右键菜单项；主按钮未选比例时默认 16:9 |
| 模型适配 | 精确优先；没有精确选项时自动选最接近的比例/尺寸，并在对话框标注实际比例；完全不支持比例或尺寸参数的模型置灰 |

## 3. 目标交互

1. 用户点击「扩图 → 扩成 16:9」。
2. 打开 AI 操作对话框，当前节点图片作为参考图。
3. 对话框按 16:9 计算模型适配：
   - 能精确输出 16:9 的模型排在前面并可选；
   - 不支持参考图的模型置灰；
   - 没有精确选项、但有 `ratio` / `size` / `width+height` 的模型也可选，并显示“将按 1536x1024（3:2）近似生成”；
   - 完全无法控制比例的模型置灰；
   - 默认模型优先取节点上次使用的图片模型；它不可用时选第一个可用模型；
   - 没有任何可用模型时确认按钮禁用，提示去设置。
4. 确认后使用图片模型走图生图，结果创建新节点，`op=outpaint`，模型名为实际生图模型。近似模型按实际输出比例保存，不做本地裁切。

不新增比例下拉、比例输入框或比例胶囊；目标比例只来自菜单项。

## 4. 比例支持判定

优先精确匹配；没有精确选项时自动选最接近的尺寸，并标记 `exact: false`。容差用于浮点比较，近似比例不会伪装成精确比例。

| 模型参数 | 判定 |
|---|---|
| `ratio` / `aspect_ratio` | 先找精确选项；没有时选宽高比最接近的选项；允许自定义时直接写目标比例 |
| `size` | 先找宽高比精确相等的 `WxH` 选项；没有时选最接近的选项 |
| `size` 且 `allowCustom` / `type: text` | 按目标比例构造精确的 `WxH` |
| `width` + `height` | 在 `min/max` 范围内构造精确比例的尺寸 |
| 没有比例或尺寸参数 | 不支持，置灰 |
| 只有 `1K` / `2K` 这类无法确定宽高比的档位 | 不支持，除非模型另有 `ratio` 参数 |

示例：

- 有 `1024x576` 时，16:9 精确使用它。
- 只有 `1024x1024 / 1536x1024 / 1024x1536` 时：
  - 16:9 → `1536x1024（3:2）`
  - 9:16 → `1024x1536（2:3）`
  - 4:3 → `1536x1024（3:2）`
  - 3:4 → `1024x1536（2:3）`
  - 1:1 → `1024x1024`，精确
  - 21:9 → `1536x1024（3:2）`
- 近似结果不做本地裁切，避免裁掉刚扩出的画面；对话框和提交提示都会标注实际比例。

## 5. 实现设计

### 5.1 共享层

新增 `src/shared/outpaint.ts`：

- `OUTPAINT_RATIOS`：6 档比例唯一来源。
- `isOutpaintRatio` / `outpaintRatioOf`：校验与默认值。
- `outpaintSupport(model, ratio)`：返回 `supported`、`params`、`target`、`exact`、`effective`、`reason`。
- `planOutpaint(model, prompt, ratio, baseParams)`：在支持时合并参数并补全提示词，近似模型也能提交。
- `outpaintPrompt(prompt, ratio)`：追加目标画幅说明，避免重复追加。

比例判定顺序：`ratio` → `aspect_ratio` → `size` → `width/height`。每个候选都计算与目标比例的误差，精确候选优先，否则选误差最小的候选。

### 5.2 UI

- `node-operation-runner.ts`：`outpaint` 分支直接 `openAiDialog`，不再检查视觉组件；抠图继续走本地视觉。
- `AiOperationDialog.tsx`：
  - 新增 `outpaintRatio` 与 `preferredModelKey` 可选 props。
  - 模型列表按“精确 → 近似 → 不可用”排序；近似模型可选并标注实际尺寸，无法控制比例的模型置灰。
  - 默认模型从可用模型中选择。
  - 全部不可用时显示专用空状态。
- `NodeToolbar.tsx`：
  - 扩图弹窗传 `requireExactRatio`（菜单项或默认 16:9）和节点当前模型。
  - 确认时调用 `planOutpaint`，合并默认参数、比例参数和提示词。
- `node-operations.ts`：菜单比例引用共享常量。

### 5.3 Agent

- `outpaint` 的 Agent spec 改为不可直接执行、`generationProposable: true`，保留 6 档 `itemOptions`。
- `canvasBridge.generation_propose` 在 `operationId=outpaint` 时按精确优先、近似兜底注入参数；只有完全无法控制比例的模型才返回不可用错误。
- 更新 Agent 工具描述、能力文档和 UI spec 中的数量。

### 5.4 删除本地扩图

- `src/main/media/vision.ts`：删除 `outpaint-image` 分支与 `targetSize()`。
- `src/shared/media.ts`：删除 `outpaint-image` 和仅扩图使用的 `ratio` 字段。
- `resources/vision-worker/worker.py`：删除 `task_outpaint_image`、任务注册与文件头说明。
- `ComponentsSection.tsx`：视觉组件文案去掉“本地扩图”。

抠图、图层分离、视频抠像、智能去字幕、主体消除、人声/背景音分离不受影响。

## 6. 改动文件

| 类型 | 文件 |
|---|---|
| 新建 | `src/shared/outpaint.ts`、`src/shared/__tests__/outpaint.test.ts`、本方案 |
| 修改 | `src/shared/node-operation-specs.ts`、`src/shared/__tests__/node-operation-specs.test.ts` |
| 修改 | `src/renderer/src/canvas/nodes/node-operations.ts` |
| 修改 | `src/renderer/src/canvas/nodes/node-operation-runner.ts` |
| 修改 | `src/renderer/src/canvas/nodes/AiOperationDialog.tsx` |
| 修改 | `src/renderer/src/canvas/nodes/NodeToolbar.tsx` |
| 修改 | `src/renderer/src/agent/canvasBridge.ts` |
| 修改 | `src/main/agent/tools/canvas.ts` |
| 修改 | `src/main/providers/openai-compat.ts`：把模型显式声明的比例/宽高参数补进 edits 表单和 generations JSON |
| 修改 | `src/shared/media.ts`、`src/main/media/vision.ts`、`resources/vision-worker/worker.py` |
| 修改 | `src/renderer/src/panels/ComponentsSection.tsx` |
| 文档 | `docs/README.md`、`docs/agent-capabilities.md`、`docs/ui-spec.md`、`docs/code-map/02-generation.md`、`08-capabilities.md`、`11-feature-index.md` |

## 7. 影响模块

- 01 画布：节点工具栏、右键菜单扩图入口。
- 02 生成与模型：AI 操作对话框、生成参数、参考图、结果节点。
- 06 Agent：扩图从直接执行改为生成提案。
- 10 UI：AI 操作对话框模型可用性展示。
- 本地视觉：只移除扩图，其他能力不变。

## 8. 验收

1. 装或不装本地视觉组件，扩图都只走配置的图片模型。
2. 有精确模型时优先精确；没有精确选项时 `1536x1024` 这类模型可选，对话框显示 `1536x1024（3:2）`。
3. 完全没有 `ratio` / `size` / `width+height` 参数的模型置灰。
4. 生成结果创建新节点，模型名为实际生图模型，不再出现 `LaMa 扩图`。
5. 无可用模型时不发起任何本地任务或扣费请求。
6. Agent `generation_propose` 传 `operationId=outpaint` 与 `itemId` 时注入比例参数；近似模型返回实际比例说明。
7. `canvas_node_operation` 扩图返回引导使用 `generation_propose` 的错误。
8. 抠图、图层分离、视频抠像、去字幕、主体消除、人声/背景音分离回归通过。
9. `corepack pnpm typecheck`、`pnpm test`、`check:docs`、`check:agent-coverage` 通过。

## 9. 风险与后续

- 近似模型输出的比例不是精确目标比例。例如 OpenAI 兼容服务扩 16:9 会得到 3:2，这是模型能力限制，本次不做本地裁切。
- 模型参数配置不完整会导致误判为不可用。需要在模型设置中补齐 `ratio` / `size` / `width` / `height`。
- 如果后续要求“原图 100% 不变、只补边缘”，再评估本地预填充画布 + 只开放新增区域的 mask；本次不做。
- 旧项目中的本地扩图结果保持为普通素材，不迁移、不重新生成。

## 10. 实施记录

- 2026-11-25：删除本地 LaMa 扩图分支、worker 任务、类型字段和组件文案；扩图改为 `AiOperationDialog` 图生图。
- 新增 `src/shared/outpaint.ts` 与单元测试，覆盖 ratio / aspect_ratio / size / width+height / 无参数。
- 2026-11-25 调整：改为精确优先 + 近似兜底；OpenAI 兼容的 1024x1024 / 1536x1024 / 1024x1536 可自动适配，近似模型在对话框和提交提示中标注实际尺寸。
- OpenAI 兼容适配器会把模型显式声明的 `ratio` / `aspect_ratio` / `width` / `height` 补进 edits 表单或 generations JSON，避免本地判定支持但请求静默丢参。
- 已通过 `typecheck`、`test`、`build`、`check:docs`、`check:code-map`、`check:ui`、`check:agent-coverage`；真实供应商 Key 下的请求体与出图比例仍待复测。
