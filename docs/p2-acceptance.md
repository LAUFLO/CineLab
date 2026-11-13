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

## 视觉回归

环境：生产预览构建，临时 userData，打开本地 `AgentSpike.cinelab` 测试项目。

检查结果：

- 画布、节点、连线、节点工具栏正常
- Prompt Bar 的上传、画布参考、模型入口、发送按钮正常
- 设置页的 Switch、Select、输入框正常
- 资产库的搜索框、文件夹树、底部操作正常
- 剪辑室的顶栏、检查器输入框、时间线工具栏正常
- 文本编辑弹窗（Dialog bare）正常打开，Escape 可关闭
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
