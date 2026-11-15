# 模型配置合并与配置驱动接入方案

日期：2026-11-14
状态：已完成
关联：[models.md](models.md)、[video-operations-plan.md](video-operations-plan.md)、[sora-video-plan.md](sora-video-plan.md)

## 1. 目标

1. 删除独立的「输入能力」按钮和对话框，把输入能力、视频操作、生成参数合并为一个「模型配置」对话框。
2. 修复视频操作与输入能力的联动，以及元素替换的能力推断。
3. 给模型定义增加 `extraBody` / `omitBody`，新增请求字段不再必须改 adapter。
4. 补齐 Sora 的参考图、分辨率、比例、音频开关，补齐 Seedream 5.5 预设与透明背景。
5. 预设升级时参数按 key 自动合并，输入/操作提供「恢复预设」。
6. 模型配置增加高级区，可编辑请求扩展和 http-template。
7. 支持 Seedream 图层拆分与富文本 OCR 的结果入库和查看。

## 2. 模型配置合并

- 模型卡片只保留「模型配置」和「删除」两个按钮。
- `ModelParamsDialog` 重命名为 `ModelConfigDialog`。
- 对话框分区：输入能力 → 视频操作（仅 `video.t2v`）→ 生成参数 → 高级。
- 勾选任一视频操作自动勾选「视频」输入；取消视频输入时清空操作并提示。
- 非 `http-template` 或缺少模板的模型，视频操作区禁用并显示原因。
- 删除 `ModelInputsDialog.tsx`。
- `inferModelOperations`：`element-replace` 额外要求模板包含 `refs.images` 或 `refs.image`。
- `VideoOpNodeView` 的模型可用性增加「未开启视频输入」检查。

## 3. 配置驱动请求字段

`ModelDef` 新增：

```ts
extraBody?: Record<string, unknown>
omitBody?: string[]
```

- `extraBody` 在 adapter 构造完默认请求体后合并，支持 `{{params.*}}`、`{{refs.*}}`、`{{prompt}}`、`{{model}}`。
- `omitBody` 从默认请求体删除顶层字段。
- 变量替换逻辑抽到 `src/shared/template-vars.ts`，与 http-template 共用。
- 执行器接入：`openai-compat` 图片、`sora` 视频、`volcengine` 视频。

## 4. Sora

- 无参考图：JSON 提交。
- 有参考图：优先 multipart，`input_reference` 作为文件字段。
- multipart 返回 400/415 且错误涉及参考图或 content-type 时，自动回退 JSON data URL。
- 参数：`duration`、`resolution`、`ratio`、`generate_audio`，通过 `extraBody` 映射。
- 保留 `/videos/{id}/content` 下载路径。

## 5. Seedream 官方参数

以火山方舟官方文档为准：

| 模型 | 组图 | background | output_format |
|---|---|---|---|
| Seedream 5.5 | 不支持 | `auto`（默认）/ `transparent` / `opaque` | `png`（默认）/ `jpeg` |
| Seedream 5.0 pro / flash | 不支持 | `transparent` / `opaque`（默认） | `jpeg`（默认）/ `png` |
| Seedream 5.0 lite / 4.5 / 4.0 | 支持 | 按模型 | 按模型 |

- 5.5 模型 ID：`doubao-seedream-5-5-261028`。
- 透明背景必须 `output_format: png`。
- 图层拆分参数：`layer_decomposition`、`layer_decomposition_options.max_images`（2–100）、`text_recognition`；图层拆分场景不能传 `background`。
- 5.0 pro/flash 与 5.5 移除「数量」参数，并通过 `omitBody: ["n"]` 避免发送 `n`。
- 组图模型通过 `extraBody` 映射 `sequential_image_generation` 和 `max_images`。

## 6. 预设升级合并

- `params`：预设当底稿，用户同 key 覆盖，预设新增自动补上。
- `inputs` / `operations`：保持显式覆盖，模型配置提供「恢复预设默认值」按钮。
- 手动添加、无 `preset` 的模型不受影响。

## 7. 图层拆分与 OCR

- `GeneratedAsset` 增加可选的 `layer` 和 `textRecognition` 字段。
- `openai-compat` 解析 `data[]` 时保留 `z_index`、`name`、`description`、`bounding_box`、`text_recognition`。
- 多图层作为同一节点的多个输出，沿用现有输出轮播。
- 当前输出带 `textRecognition` 时，节点卡片提供「OCR」入口查看文本。
- 图层叠加预览留作后续增强。

## 8. 验收

1. 模型卡片只有「模型配置」「删除」。
2. 合并对话框三区正常，联动正确，非 http-template 操作区禁用。
3. `extraBody` / `omitBody` 只改配置即可追加请求字段。
4. Sora 参考图 multipart 与 JSON 回退均可用。
5. Seedream 5.0/5.5 不发送 `n`；5.5 透明背景输出 RGBA。
6. 预设新增参数在升级后自动出现；恢复预设可用。
7. 图层拆分返回多图并显示图层名；OCR 文本可查看。
8. `pnpm typecheck`、`pnpm test`、`pnpm check:docs` 通过。

## 9. 实施结果

- 阶段 1：`ModelConfigDialog` 合并输入能力、视频操作、生成参数和高级配置；`ModelInputsDialog` 已删除；元素替换推断额外要求 `refs.images` / `refs.image`；视频操作节点增加「未开启视频输入」置灰原因。
- 阶段 2：`ModelDef` / `ModelsFileModel` 增加 `preset`、`extraBody`、`omitBody`；新增 `src/shared/template-vars.ts` 和 `src/main/providers/model-body.ts`；图片、Sora、火山视频、文本、TTS、音乐均接入。
- 阶段 3：Sora 参考图优先 multipart，400/415 且错误涉及参考图时回退 JSON data URL；Seedream 5.0 改为分辨率档位并移除 `n`；新增 Seedream 5.5 预设、透明背景和 PNG 输出规则。
- 阶段 4：`resolveModels` 按 key 合并预设与用户参数，保留 `preset` 来源；模型配置提供「恢复预设默认值」。
- 阶段 5：模型配置增加「高级」折叠区，可编辑 `extraBody`、`omitBody`、`http-template`，保存前做 JSON 结构校验。
- 阶段 6：`GeneratedAsset` / `OutputRef` / 工程 Zod schema 增加 `layer` 与 `textRecognition`；图层拆分走 `/images/generations` JSON 路径；节点卡片显示底图/图层名，OCR 图层提供文本查看弹窗；单节点输出上限提高到 100，避免图层被截断。

补充说明：

- Sora 的 `resolution` / `ratio` / `generate_audio` 通过 `extraBody` 映射，未内置固定预设，避免官方 Sora 与中转网关字段不一致。
- 模型配置对话框改为整体滚动，参数列表不再单独滚动，保证高级区展开后底部按钮仍可到达。
