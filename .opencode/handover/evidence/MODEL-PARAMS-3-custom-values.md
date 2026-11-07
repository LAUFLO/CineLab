# 模型参数自定义值验证

日期：2026-11-07
关联：`docs/model-params-plan.md`、`MODEL-PARAMS-2`

## 需求

图片模型可能支持预设之外的比例或尺寸，Prompt Bar 需要允许用户直接输入自定义值，而不是只能选预设。

## 改动

- `ParamDef` 新增 `allowCustom?: boolean`
- 模型参数模板：
  - 尺寸 `size`、图片比例 `ratio`、视频比例、分辨率默认允许自定义
- 模型参数编辑器：
  - 下拉参数增加「允许在生成设置中自定义值」复选框
  - 保存时写入 `allowCustom`
- Prompt Bar 生成设置：
  - `allowCustom` 的下拉参数在选项末尾显示「自定义」
  - 点击后出现输入框：
    - 比例占位「例如 2:1」
    - 尺寸占位「例如 2048x1152」
  - 自定义值直接进入生成参数，不必属于预设 options
  - 摘要显示自定义值，例如 `2:1 · 1024×1024`
  - 选择预设时退出自定义状态

## 实测

- 测试图片模型配置 `ratio` 和 `size`，均开启 `allowCustom`
- Prompt Bar 生成设置出现两个「自定义」按钮
- 点击比例「自定义」，输入 `2:1`
- 摘要更新为 `2:1 · 1024×1024`
- 输入框占位符为「例如 2:1」
- 截图：`shot-prompt-custom2.png`（会话临时目录）

## 验证

```text
corepack pnpm typecheck  通过
corepack pnpm test       6 files / 18 tests 通过
corepack pnpm build      通过
```
