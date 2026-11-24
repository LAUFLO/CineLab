# PromptBar 浮窗与胶囊改造方案

日期：2026-11-24
状态：现行
适用版本：v0.4.6
最后核对：2026-11-24

## 1. 背景

预设提示词上线后，实际使用暴露了四个问题：

1. 预设提示词浮窗内删除预设时，二次确认弹窗被浮窗遮挡；
2. 预设卡片上的编辑/删除按钮过小，不易点击；
3. 连续插入两个预设提示词后，输入框中的胶囊互相遮盖、名称显示不全；
4. 浮窗居中且尺寸大，点击卡片后输入框被完全挡住，看不到插入结果。

随后又提出：浮窗改为按输入框居中、与输入框留出间距；卡片改为多列网格并支持全文预览；预设胶囊去掉装饰图标、改用绿色与风格胶囊区分；打开浮窗时自动把节点放到视口中心偏下，保证浮窗完整展示。

## 2. 现状（代码级）

| 问题 | 根因 | 位置 |
|---|---|---|
| 确认框被遮挡 | 确认框 `z-[300]`，预设/风格浮窗 `z-[900]`，嵌套模板框 `z-[950]`，通用 Popover `z-[1000]` | `panels/ConfirmDialog.tsx`、`canvas/PresetPromptDialog.tsx`、`canvas/StyleLibraryDialog.tsx` |
| 卡片按钮过小 | 24×24 按钮、11px 图标，且 `opacity-0 group-hover:opacity-100` 默认不可见 | `canvas/PresetPromptDialog.tsx`、`canvas/StyleLibraryDialog.tsx` |
| 胶囊互相遮盖 | 镜像层用 `invisible` 的 `#名称` 撑占位，胶囊绝对定位 `-left-[2px] -right-[5px]` 外扩 7px；内部还要放三横图标与 ×，可用宽度不足 | `canvas/promptbar-model.tsx` |
| 浮窗遮挡输入框 | 浮窗为居中模态 Dialog，尺寸 760×560 / 980×640，输入框位于其下方 | 同上 |
| 浮窗不能锚定 | `Popover` 只按可用空间自动判断上下，没有显式 `placement` | `components/ui/Popover.tsx` |
| 节点太靠上时空间不足 | PromptBar 跟随节点，节点在视口上半部分时，按钮上方放不下浮窗 | `canvas/PromptBar.tsx` |
| `setCenter` 放大画布 | React Flow 的 `setCenter` 在未传 `zoom` 时使用 `maxZoom` | `canvas/PromptBar.tsx` |

## 3. 方案

### 3.1 层级

| 层 | z-index | 说明 |
|---|---|---|
| 通用 `Popover` | 1000 | 预设/风格主浮窗使用它 |
| 浮窗内嵌编辑框、预览框 | 1100 | `TemplateDialog`、预设全文预览 |
| `ConfirmDialog` | 1200 | 全站最高业务层，任何浮窗内的确认都不再被遮挡 |

### 3.2 通用 Popover

新增可选参数，默认行为不变：

- `placement?: 'auto' | 'top' | 'bottom'`：`auto` 沿用现有空间判断，`top` 强制向上；
- `height?: number`：期望高度，实际按可用空间收缩；
- `maxHeight?: number`：最大高度，默认 420；
- `gap?: number`：与锚点间距，默认 6；
- `avoidRef?: RefObject<HTMLElement | null>`：向上展开时浮窗底部不越过该元素顶部，用于避开提示词输入框；
- `bare?: boolean`：不套用默认内边距与滚动。

### 3.3 预设提示词浮窗

- 模态 Dialog → `Popover`，锚定 PromptBar（而非按钮），水平居中，`placement="top"`、`gap=14`、`follow` 跟随画布；
- 尺寸 620×480，与风格库一致；
- 顶部一行：标题 + 搜索 + 新建 + 关闭；移除底栏、分隔线与说明文字；
- 卡片两列网格：标题 + 两行提示词摘要；右上角常显三个 28px 按钮（预览、编辑、删除），默认 60% 透明度、悬停 100%；
- 预览按钮打开全文弹窗（`z-[1100]`），显示名称、完整提示词与适用节点；
- 点击卡片插入后浮窗保持打开，可连续添加；与风格库浮窗互斥，打开一个自动关闭另一个；
- 新建/编辑仍用 `TemplateDialog`，`z-[1100]`。

### 3.4 风格库浮窗

- 模态 Dialog → `Popover`，同样按 PromptBar 居中、`gap=14`；
- 尺寸 620×480，保留 4 列封面网格、分类筛选与搜索；
- 单击卡片即应用并关闭，移除「先选中 → 使用这个风格」两步；
- 移除底部分隔线、提示行与选中态勾选；
- 编辑/删除按钮 28px，悬停显示；删除走 `requestConfirm`。

### 3.5 预设胶囊

去掉三横图标，改用绿色区分：

```
┌──────────────┐
│ 名称........ │ ×  ← 右上角悬浮角标，不占水平宽度
└──────────────┘
```

- 胶囊宽度严格等于镜像占位宽度，去掉左右负外扩；
- 不再放装饰图标，名称从 `#` 之后开始（`padding-left` 对齐字符位置），删除入口始终可见；
- 颜色用新增的 `--preset`（浅色 `#16a34a`、深色 `#4ade80`），与风格胶囊的 `--accent` 蓝色区分；
- 风格胶囊保留 sparkles 图标，`×` 改为同样的 12px 右上角悬浮角标；
- 两类胶囊统一 22px 高、11px 字号；
- 插入逻辑保证 token 之间至少一个空格。

为什么不能「图标 + 名称 + ×」三者原位常显：镜像层占位宽度由 `#名称` 字符宽度决定，图标（约 7px）+ ×（约 9px）的固定开销超过 `#` 字符宽度（约 6px），名称必然被压缩。要彻底解决只能改编辑器架构（contenteditable 富文本 token），不在本次范围。

### 3.6 打开浮窗时自动就位

- 打开预设/风格浮窗前判断节点底部在屏幕中的位置；
- 若不足 520px，调用 `setCenter` 把节点移到视口中心偏下（约 58% 高度），并显式传入当前 `zoom`；
- 滚动动画 180ms，浮窗通过 `follow` 持续跟随；
- 节点已在合适位置时不滚动，避免打断用户空间感。

## 4. 改动点

| 文件 | 改动 |
|---|---|
| `src/renderer/src/components/ui/Popover.tsx` | 新增 `placement`、`height`、`maxHeight`、`gap`、`avoidRef`、`bare` |
| `src/renderer/src/components/Icon.tsx` | 新增 `eye` 图标 |
| `src/renderer/src/styles/tokens.css` | 新增 `--preset`（深浅主题） |
| `src/renderer/src/styles/tailwind.css` | 新增 `--color-preset` 映射 |
| `src/renderer/src/panels/ConfirmDialog.tsx` | 确认框层级 300 → 1200 |
| `src/renderer/src/canvas/PresetPromptDialog.tsx` | 锚定浮窗、两列网格、预览弹窗、按钮放大、互斥 |
| `src/renderer/src/canvas/StyleLibraryDialog.tsx` | 锚定浮窗、单击即用、按钮放大、去分隔线 |
| `src/renderer/src/canvas/promptbar-model.tsx` | 胶囊去图标、改绿色、宽度对齐占位 |
| `src/renderer/src/canvas/PromptBar.tsx` | 浮窗锚点、互斥开关、节点居中、风格胶囊角标 |
| `docs/ui-spec.md` | Prompt Bar 浮窗与胶囊说明 |
| `docs/code-map/10-ui.md` | 当前状态表 |
| `docs/code-map/08-capabilities.md` | 能力状态 |
| `docs/code-map/11-feature-index.md` | 关键词索引 |
| `docs/README.md` | 登记本文档 |

## 5. 影响模块

- 画布 PromptBar（预设、风格、胶囊渲染）
- 通用 UI 组件（Popover、Icon）
- 全局颜色变量与 Tailwind 映射
- 全站确认框层级
- 资产库提示词/风格的数据源不变（复用 `library` store）

不涉及主进程、IPC、数据格式与模型请求。

## 6. 验收

自动校验：

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm check:ui`
- `corepack pnpm check:docs`
- `corepack pnpm check:code-map`

隔离实例手测：

1. 预设浮窗中删除预设，确认框显示在浮窗之上且可操作；
2. 卡片预览、编辑、删除按钮尺寸足够，悬停清晰；
3. 连续插入两个预设，胶囊不重叠、名称完整、× 可点；
4. 预设胶囊为绿色且无装饰图标，风格胶囊保留图标、× 为角标；
5. 浮窗按输入框居中，底部与输入框保持 14px 间距；
6. 风格库单击卡片即应用并关闭；两个浮窗互斥；
7. 节点位于视口上方时，打开浮窗自动把节点移到中心偏下，缩放保持不变。

## 7. 风险与回滚

- 风险：层级调整影响其他浮窗内的确认场景。缓解：只提升确认框，不降低既有浮窗层级。
- 风险：Popover 新增参数若实现有误会影响所有调用点。缓解：参数可选，默认路径保持原逻辑。
- 风险：新增颜色变量需同时维护深浅主题。缓解：两套主题均已补充并用 `color-mix` 派生透明背景。
- 回滚：本次为独立分支，整体 revert 或放弃分支即可。
