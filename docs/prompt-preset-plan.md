# 预设提示词计划

日期：2026-11-23
状态：已实施

## 目标

在 PromptBar 增加“预设提示词”入口，复用资产库「提示词」文件夹的数据。用户可以：

- 在悬浮窗中浏览、搜索、新建、编辑、删除预设提示词。
- 点击预设，在提示词输入框的光标位置插入一个**显示名称的胶囊**。
- 支持多个胶囊、任意位置；发送时胶囊在所在位置展开为实际提示词内容。
- 风格胶囊始终拼在最前面。

## 数据

复用现有 `PromptTemplate` 与「提示词」文件夹：

- 存储：`<资产库>/提示词/<名称>.prompt.json`
- 字段：`{ version, kind, prompt }`，名称来自文件名
- 悬浮窗与资产库共用 `useLibraryStore` 的 `templates` / `saveTemplate` / `deleteTemplate`
- 新建、编辑复用现有 `TemplateDialog`

## Token 规则

底层在输入框文本中写入 `#<名称>` 作为定位标记：

- 镜像层把 `#<名称>` 渲染成胶囊外观，胶囊内显示名称，`#` 作为弱化的前缀保留，保证与 textarea 字符宽度一致、光标不错位。
- 胶囊只增加背景、圆角、内阴影，不用水平 padding/border，避免破坏镜像层对齐。
- 解析时按已有预设名称最长匹配，名称可含空格。
- 发送时按 token 在文本中的位置展开为对应预设的 `prompt`。
- 未匹配的 `#<名称>` 保留原文。

## 交互

### 悬浮窗

- 入口：PromptBar 工具栏「风格库」右侧，按钮文案「预设提示词」。
- Dialog 与风格库同级，标题「预设提示词」，顶部搜索，卡片列表。
- 列表显示全部预设；当前节点类型置顶并标记适用节点。
- 卡片显示名称、适用节点、提示词摘要；hover 显示编辑/删除。
- 点击卡片：在光标处插入名称胶囊，弹窗保持打开，可连续添加多个。
- 底部「新建提示词」；新建默认当前节点类型。

### 插入与删除

- 读取 textarea 的 `selectionStart/End`，替换选区；textarea 未聚焦时使用上次插入位置或末尾。
- 插入 token 前后若紧邻非空白字符，自动补空格。
- 插入后记录光标位置，关闭弹窗时聚焦输入框并定位到该位置。
- Backspace/Delete 命中胶囊边界或内部时，整块删除该 token。

### 发送

1. 先用 `buildPromptWithContext` 处理 @ 引用。
2. 再按位置展开预设 token。
3. 最后用 `buildStyledPrompt` 把风格拼到最前。

### 资产库

资产库「提示词」文件夹的「使用」改为插入到输入框光标处（纯文本，不生成 token），与悬浮窗的胶囊行为区分：

- 悬浮窗：插入名称胶囊，发送时展开。
- 资产库：直接插入提示词正文，立即编辑。

## 文件改动

| 文件 | 改动 |
|---|---|
| `src/shared/prompt-preset.ts` | 新增 token 解析、展开函数 |
| `src/shared/__tests__/prompt-preset.test.ts` | token 解析、最长匹配、展开、顺序 |
| `src/renderer/src/canvas/promptbar-model.tsx` | 统一渲染普通 @ 与预设胶囊 |
| `src/renderer/src/canvas/PresetPromptDialog.tsx` | 新增悬浮窗、CRUD、搜索、类型标记 |
| `src/renderer/src/canvas/PromptBar.tsx` | 入口按钮、token 插入/删除、发送展开、资产库插入消费 |
| `src/renderer/src/stores/ui.ts` | 新增 `insertPrompt` 与待插入状态 |
| `src/renderer/src/panels/library/LibraryWindow.tsx` | 「使用」改为插入 |
| `src/renderer/src/panels/library/TemplateGrid.tsx` | 「新建模板」按钮移出网格，空状态与非空状态居中 |

## 边界

- 预设改名或删除后，已有 token 失效；发送时保留原文。
- 预设内容中的 `@` 不参与引用解析（先处理用户文本，再展开预设）。
- 胶囊视觉宽度与 token 文本一致，不做独立 DOM 内联编辑器。
- 多选时不做数量上限，首行空间由文本流自然换行。

## 验收

- 悬浮窗 CRUD 与资产库双向同步。
- 多个预设胶囊可插入任意位置，删除可整块移除。
- 发送顺序为「风格 → 展开后的正文」，位置正确。
- 资产库「使用」插入到光标处，不覆盖已有内容。
- 「新建模板」按钮在空状态和非空状态均居中、不孤立在左侧。
- `typecheck`、`check:ui`、相关单测、隔离实例验证通过。
