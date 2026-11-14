# P2 UI 基础设施验收记录

日期：2026-11-14
状态：现行
适用版本：v0.1.0
最后核对：2026-11-14

## 完成范围

- Tailwind 4 主题基础层：`styles/tailwind.css`、`styles/base.css`
- `components/ui/` primitives：
  - Button / IconButton
  - Input / Textarea
  - Select / NativeSelect
  - Switch
  - Field / SettingRow
  - Dialog
  - Menu / MenuItem / MenuSeparator
  - Toast
- 全量控件迁移：`src/renderer/src` 下除 `components/ui` 外，原生 `<button>`、`<input>`、`<textarea>`、`<select>` 已清零，共替换 510 处、覆盖 60 个文件。
- `Button`、`Input`、`Textarea`、`NativeSelect` 增加 `unstyled` 变体，迁移期保留既有视觉。
- `Dialog` 增加 `bare` 模式，调用方保留 overlay/panel 类和内部结构，公共组件负责 portal、焦点圈定、Escape 和遮罩点击。
- 节点弹窗统一由 `Dialog` 承载：
  - 裁剪 `CropDialog`
  - 片段截取 `TrimDialog`
  - 字幕框选 `SubtitleDialog`
  - 遮罩编辑 `MaskEditorDialog`
  - 深度捕捉 `DepthCaptureDialog`
  - 模型参数 `ModelParamsDialog`
  - 模型能力 `ModelInputsDialog`
  - AI 操作 `AiOperationDialog`
  - 光位/机位 `SphereDialog`
  - 文本编辑 `TextEditorDialog`
- 删除 `components/Select.tsx` 转发层，全部改为从 `components/ui` 导入。
- TopBar 导出提示、App 启动错误提示改为共享 `Toast`。

## CSS 清理

| 指标 | P2 基础完成 | 全量迁移后 |
|---|---:|---:|
| `global.css` 行数 | 8,467 | 8,122 |
| 构建后 CSS | 299.7 KB | 281.9 KB |

已删除且确认引用为 0 的类：

- `app-select*`
- `settings-row*`、`settings-toggle*`、`settings-input`
- `confirm-overlay`、`confirm-dialog*`
- `library-modal*`、`library-textarea`、`tag-input`
- `export-toast`、`toast`
- `cnode__toolbar-menu__item*`
- `promptbar__upload-item`、`promptbar__switch`
- `mention-menu__item*`

说明：`global.css` 行数相比上一轮略有增加，是因为 Prettier 展开了部分单行规则；实际构建体积继续下降。

## 视觉还原修正

P2 早期迁移曾直接用公共组件的默认 Tailwind 样式替换原 CSS 类，导致按钮高度、字号、菜单行高、弹窗面板和输入框尺寸与原版不一致。本轮已按迁移前基线逐项还原：

- `Button`：恢复 34px 高、13px 字号、8px 圆角、`.btn-*` 的边框与悬停行为；`xs` 对应 26px 的 `btn-small`，`sm` 对应 28px。
- `IconButton`：默认 28px，恢复 `.icon-btn` 的尺寸和悬停。
- `Select`：恢复 `.app-select` 的 34px 高度、13px 字号、`surface-hover` 背景和 280px 菜单。
- `Switch`：默认 30×17（设置页），`sm` 为 22×12（Prompt Bar）。
- `SettingRow`：恢复 56px 最小高度、12.5px 标题、11px 提示和 14px 横向内边距。
- `Input`：恢复 `settings-input` 的 240×30 样式；设置行 Select 恢复 210×30。
- 节点工具栏菜单：恢复 `.cnode__toolbar-menu__item` 的 12px 字号、32px 行高和 `text-2` 颜色。
- Prompt Bar：恢复上传菜单、模型菜单、提及菜单的原始字号和行高，恢复 22×12 开关。
- 弹窗：确认、命名、模板、移动、合成、标签弹窗恢复原 `.confirm-dialog` / `.library-modal` 结构；节点弹窗继续使用 `Dialog` 的 `bare` 模式。
- 剪辑室：恢复 `.studio-icon-btn`、`.studio-ghost-btn`、`.studio-textarea` 和原生 select 的 30px 视觉。
- Toast：恢复 `.export-toast` 和 `.toast` 的原样式。

根因修正：`global.css` 里的 `button`、`input`、`textarea` 重置原先不在 layer 中，优先级高于 Tailwind utilities，导致公共组件的 `padding`、`font-size`、`line-height` 被覆盖。现已移入 `@layer base`，组件默认样式和自定义类都能正确生效。

## 视觉回归

环境：生产预览构建，临时 userData，打开本地 `AgentSpike.cinelab` 测试项目。

检查结果：

- 画布、节点、连线、节点工具栏正常
- Prompt Bar 的上传、画布参考、模型入口、发送按钮正常
- 设置页的 Switch、Select、输入框正常
- 资产库的搜索框、文件夹树、底部操作正常
- 剪辑室的顶栏、检查器输入框、时间线工具栏正常
- 文本编辑弹窗（Dialog bare）正常打开，Escape 可关闭
- 节点工具栏「更多」菜单与迁移前截图逐项对比：字号、行高、颜色、图标间距一致
- 设置页的 Switch、Select、设置行高度与迁移前 CSS 一致
- 遮罩、聚焦和弹窗层级未发现明显回归

AgentPanel 的模型选择浮层保留原有面板内定位，不套用全屏 Dialog，避免遮罩范围和宽度变化。

截图保存在本机临时目录，未提交到仓库，避免把测试项目画面和本地路径带入公开仓库。

## 验证

```text
typecheck:  通过
lint:       0 errors
test:       49 文件 / 345 用例
build:      通过
check:docs: 通过
grep:       components/ui 之外原生控件标签 0 处
```

## 剩余事项

- P3：拆分 `agent/tools.ts`、`canvas.ts`、`PromptBar.tsx`
- P3：Studio / Stage / three 懒加载与性能基线
- P3：补齐 protocol、project、library、IPC 测试
