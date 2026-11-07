# 模型参数编辑器方案

日期：2026-11-07
状态：实施中
关联：`docs/models.md`、P1-1

## 现状

- `ModelDef.params` 已经是完整参数模型（select/number/text/boolean）
- PromptBar 能渲染参数，但只支持 select 展开菜单；number/text/boolean 点击无反应
- 设置页只能删除模型，不能编辑参数；手动输入模型 ID 时 `params` 为空，prompt bar 不显示尺寸/比例
- 内置 `MODEL_PRESETS` 的参数对用户不可见、不可改

## 目标

- 设置页可以为每个模型配置参数
- 按能力提供模板：尺寸、画幅比例、数量、质量、时长、分辨率、声音、语速、格式、温度等
- 支持手动添加自定义参数
- PromptBar 能编辑 select/number/text/boolean 四类参数
- 保存进 `models.json`，生成链路无需改动

## 设计

### 1. 参数模板

新增 `src/shared/param-presets.ts`：

| 能力 | 模板参数 |
|---|---|
| 图片 | 尺寸、画幅比例、数量、质量 |
| 视频 | 画幅比例、时长、分辨率、生成音频 |
| 音频 | 声音、语速、格式 |
| 文本 | 温度、最大 token |

模板只提供 `ParamDef`，参数 key 与各适配器约定一致（`size/ratio/n/quality/duration/resolution/voice/speed/format/temperature/max_tokens`）。

### 2. 参数编辑器

新增 `src/renderer/src/canvas/nodes/ModelParamsDialog.tsx`（设置页使用）：

- 顶部「快速添加」模板 chips，已存在的 key 置灰
- 参数列表：key、显示名、类型、默认值、选项
- select 选项用每行 `值|显示名` 编辑
- 支持删除参数和添加自定义参数
- 保存后写回 `draft.models`，再随供应商保存到 `models.json`

### 3. PromptBar

- select：保持现有下拉
- boolean：点击 chip 切换开/关
- number：点击 chip 展开数字输入浮层
- text：点击 chip 展开文本输入浮层

### 4. 校验

保存供应商时沿用 `models-config.ts` 的参数校验：

- key/label/type 必填
- select 必须有 options
- 默认值类型与参数类型一致

## 验收

- 设置页模型卡片有「参数」入口
- 从模板添加尺寸/比例后，PromptBar 出现对应下拉
- 视频模型添加时长/分辨率后，PromptBar 可切换
- number/boolean 参数可在 PromptBar 编辑
- 保存后重新打开设置，参数仍在
