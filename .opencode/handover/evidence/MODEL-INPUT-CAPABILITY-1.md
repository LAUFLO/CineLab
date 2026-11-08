# 模型输入能力与菜单置灰

日期：2026-11-08
状态：已完成（第一期）

## 背景

用户反馈：部分图片模型不支持图生图、Agnes 2.5 Flash 视频不支持参考视频，但界面没有任何提示；希望模型选择菜单按当前引用把不支持的模型置灰。操作模型页暂不合并，专用操作继续单独绑定。

根因：

- `Capability` 只有 `image.t2i` / `image.i2i` / `video.t2v` 等粗粒度枚举，无法表达“是否接受视频/音频参考”。
- 模型能力由 `inferCapability()` 按模型名推断，设置页没有编辑入口。
- Prompt Bar 只按节点类型过滤模型，不检查当前引用；后端也不校验输入能力。

## 实现

### 能力声明

- `ModelDef.inputs?: MediaInput[]`，`MediaInput = 'text' | 'image' | 'video' | 'audio'`。
- 新增 `inferModelInputs()`、`modelInputs()`、`missingInputsFor()`。
- 默认推断：
  - `image.t2i` → `text`；Agnes 图像额外 `image`
  - `image.i2i` → `text`、`image`
  - `video.t2v` → 非 http-template 默认 `text`、`image`；Agnes 2.5 Flash 为 `text`、`image`、`audio`；Agnes 2.5 标准版含 `video`
  - `http-template` 按模板的 `image` / `keyframe` / `reference` / `video` 模式推断
- 内置预设逐个补齐 `inputs`。
- `models.json` 支持 `inputs`；`models-config.ts` 增加校验和解析，`resolveModels()` 优先用户配置、其次预设、最后推断。

### 设置页

- 模型列表元信息显示「输入 文本/图片/视频/音频」。
- 新增「输入能力」按钮和 `ModelInputsDialog`，文本必选，可勾选图片/视频/音频。
- 保存后写回 `models.json`，文件监听刷新后 Prompt Bar 立即生效。

### Prompt Bar

- 根据 `mergedRefs` 计算必需输入：文本 + 图片（如有）+ 视频（如有）。
- 模型菜单项缺少输入能力时置灰（保留在菜单中），显示红色「不支持视频」等原因；点击显示 toast。
- 当前模型不可用时，模型 chip 显示红色「不支持视频」警告，提交时拦截。
- 图片节点不显示视频节点/视频素材作为引用；画布点选视频输出时提示改用视频节点。
- `AiOperationDialog` / `SphereDialog` 中不支持参考图的模型置灰并标注「不支持参考图」。

### 后端

- `generate:run` 在加载素材后校验 `inputs`：
  - 有参考图或蒙版但模型不含 `image` → 报错
  - 有参考视频但模型不含 `video` → 报错
- `loadRefs()` 增加图片 MIME 白名单，防止视频被误当图片读取。

## 验证

- `corepack pnpm typecheck` 通过。
- `corepack pnpm test`：8 个测试文件、36 个用例通过（新增模型输入推断和 models.json inputs 校验）。
- 隔离实例（CDP 9222）实测：
  - 设置页显示 Agnes 图像「输入 文本/图片」、Agnes Flash 视频「输入 文本/图片/音频」、文本模型「输入 文本」。
  - 输入能力对话框正确显示文本必选、视频未勾选。
  - 勾选视频并保存后，`models.json` 写入 `text,image,audio,video`，列表和 Prompt Bar 立即刷新。
  - 视频节点连线引用视频时，Prompt Bar 显示「素材 1」；Agnes Flash 菜单项置灰并显示「不支持视频」，点击弹出「不支持视频输入」toast。
  - 当前模型 chip 显示红色「不支持视频」警告。
  - 图片节点连线引用图片时，MOSS 菜单项置灰并显示「不支持图片」，Agnes 图像仍可选；当前模型 chip 显示红色「不支持图片」警告。
  - 模型菜单与输入区的层叠顺序修正：`.promptbar__footer` 增加 `position: relative; z-index: 2`，菜单完整显示在输入区之上。

## 保留限制

- Agnes 2.5 Flash 官方不支持 `videos` 输入；即使手动勾选视频，提交仍会被 `http-template` 适配器校验拦截，需要绑定支持视频输入的专用接口或使用 Agnes 2.5 标准版。
- 操作模型页保留，继续用于 4 个视频专用操作的全局绑定；第二期再评估是否并入模型能力。
- 本期只做输入能力，不包含图片/视频专用操作的能力声明（`operations`）。
