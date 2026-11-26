# 文本节点所见即所得方案

日期：2026-11-25
状态：已实施（真实界面待复测）
适用版本：v0.5.x
最后核对：2026-11-25

> 目标：文本节点改为 Markdown 原生所见即所得编辑，去掉“预览 / Markdown”切换和格式工具栏；格式通过 `#`、`-`、`>`、`**`、代码块等 Markdown 输入即时生效，顶部只保留一行支持说明。

## 1. 背景

当前文本节点编辑弹窗是 `textarea + Markdown 语法按钮 + 预览切换`：

- 用户需要手动点“预览”才能看到排版，编辑和阅读割裂。
- H2、粗体、列表、引用、代码、表格按钮只是插入 Markdown 字符，不是所见即所得。
- 文本节点本身已经以 Markdown 字符串存储，节点卡片也用 `renderMarkdown` 渲染，具备直接做 WYSIWYG 的基础。

## 2. 最终决策

| 决策 | 结论 |
|---|---|
| 编辑器 | 引入 Milkdown 核心版（ProseMirror + remark），Markdown 原生 WYSIWYG |
| 预览切换 | 删除 |
| 格式工具栏 | 删除；通过 Markdown 输入规则直接格式化 |
| 顶部提示 | 保留一行“支持 Markdown · Ctrl+Enter 保存” |
| 数据格式 | 继续存 Markdown 字符串，不迁移项目数据 |
| 源码模式 | 不提供 |

## 3. 为什么选 Milkdown

- Markdown 是它的原生存储格式，保存时不需要 HTML/JSON 往返转换。
- 基于 ProseMirror，列表、表格、代码块、撤销/重做、中文输入法比自建 `contentEditable` 可靠。
- 使用核心包即可，不引入 `@milkdown/react`、`@milkdown/crepe`，避免把 Vue 3 带进 React 项目。
- TipTap 需要额外做 Markdown ↔ HTML/JSON 序列化；自建 `contentEditable` 在表格、列表、撤销和输入法上风险过高。

依赖：

- `@milkdown/core`
- `@milkdown/preset-commonmark`
- `@milkdown/preset-gfm`
- `@milkdown/plugin-history`
- `@milkdown/plugin-listener`

## 4. 交互

1. 双击文本节点或点工具栏“编辑文本”，打开弹窗。
2. 弹窗直接显示格式化后的内容，不再有“预览 / Markdown”按钮。
3. 输入 `# `、`- `、`1. `、`> `、` ``` `、`**粗体**` 等 Markdown 语法时，编辑器即时转成对应格式。
4. 顶部一行提示：`支持 Markdown · Ctrl+Enter 保存`。
5. 底部保留字数、取消、保存。
6. 保存后仍写入 Markdown，节点卡片渲染结果与编辑器一致。

表格说明：

- 已有 Markdown 表格可正常解析和编辑，从网页复制的 HTML 表格可由 GFM 保留结构。
- 不提供表格插入按钮；GFM 内置 `|3x3|` 加空格的输入规则，可直接创建表格。
- 纯文本 Markdown 粘贴按纯文本插入，不会自动重新解析为富文本；这是富文本编辑器的常见行为。

## 5. 实现设计

### 5.1 编辑器组件

新增 `src/renderer/src/canvas/nodes/WysiwygMarkdownEditor.tsx`：

- 用 `Editor.make()` 创建 Milkdown 编辑器。
- 插件：`commonmark`、`gfm`、`history`、`listener`。
- 初始内容通过 `defaultValueCtx` 注入。
- 通过 `listenerCtx.markdownUpdated` 回写 Markdown 草稿。
- 组件卸载时 `editor.destroy()`。
- 挂载后聚焦编辑区。
- 空内容显示占位提示。

### 5.2 弹窗改造

`TextEditorDialog.tsx`：

- 删除 `view`、`preview`、`TOOLBAR`、`insert`、`textareaRef`。
- 删除 `Textarea` 和预览分支。
- 正文替换为 `WysiwygMarkdownEditor`。
- 顶部只保留 Markdown 提示和 `Ctrl+Enter`。
- 保留 `draft`、字数统计、取消/保存。

### 5.3 样式

`text-markdown.ts`：

- 拆出 `MARKDOWN_CONTENT_CLASS`：只负责标题、段落、列表、引用、代码、表格等排版。
- `MARKDOWN_CLASS` 继续用于节点卡片，增加定位、滚动条和弱化文字色。
- 列表补充 `list-disc` / `list-decimal`，保证节点卡片和编辑器都能看到项目符号。
- 编辑器使用主题变量，不硬编码色值。

## 6. 影响文件

| 类型 | 文件 |
|---|---|
| 新建 | `src/renderer/src/canvas/nodes/WysiwygMarkdownEditor.tsx`、本方案 |
| 修改 | `src/renderer/src/canvas/nodes/TextEditorDialog.tsx` |
| 修改 | `src/renderer/src/canvas/nodes/text-markdown.ts` |
| 修改 | `package.json`、`pnpm-lock.yaml` |
| 文档 | `docs/README.md`、`docs/ui-spec.md`、`docs/code-map/01-canvas.md`、`docs/code-map/11-feature-index.md` |

## 7. 数据兼容

- 文本节点仍存 `data.text` Markdown 字符串。
- Agent `canvas_update_text`、工作流导出、节点卡片渲染不需要改协议。
- 现有 Markdown 标题、列表、引用、代码、表格可加载。
- Milkdown 保存时可能规范化列表符号、空白和表格对齐，语义不变。
- 原始 HTML 片段不再保证保留，文本节点以 Markdown 语法为准。

## 8. 验收

1. 文本节点编辑弹窗没有“预览 / Markdown”切换和格式工具栏。
2. 输入 `# `、`- `、`1. `、`> `、` ``` `、`**粗体**` 能即时格式化。
3. 表格内容能正常显示和编辑；粘贴 Markdown 表格不丢结构。
4. 保存后节点卡片渲染与编辑器一致。
5. 中文输入法、撤销/重做、粘贴、长文本滚动正常。
6. Agent 更新文本、工作流导出、文本节点卡片不受影响。
7. `typecheck`、`test`、`build`、`check:ui`、`check:docs`、`check:code-map` 通过。

## 9. 风险

- 新增 ProseMirror/Milkdown 依赖，前端包体增加数百 KB。
- Markdown 规范化可能改变原始文本的空白/符号，但语义不变。
- 纯文本 Markdown 粘贴按纯文本插入，不自动解析成富文本；需要整段源码导入时可先写成本地 Markdown 文件或通过 Agent 更新节点。
- 编辑器初始化失败时需要回退到可保存的纯文本状态，避免内容丢失。

## 10. 实施记录

- 2026-11-25：接入 `@milkdown/core` + commonmark + GFM + history + listener，文本节点改为 Markdown 原生所见即所得。
- 删除预览切换与格式工具栏，顶部仅保留 Markdown 语法提示和 Ctrl+Enter 保存。
- 编辑器按需加载为独立 chunk，避免把 ProseMirror/Milkdown 打进首屏包；失败时回退到纯文本 textarea。
- 保存通过 `serializerCtx` 同步读取当前文档，避开 listener 的 200ms 防抖，避免刚输入就保存丢字。
- 增加 jsdom 测试：编辑器挂载与 Markdown 读取、`#` / `-` / `1.` / `>` / 代码块 / `|3x3|` / `**粗体**` 输入规则。
- 已通过 `typecheck`、`test`、`build`、`check:ui`、`check:docs`、`check:code-map`；真实界面与中文输入法待复测。
