# Tailwind 锚点迁移方案（收尾最后一公里）

日期：2026-11-16
状态：待实施
关联：[tailwind-migration-plan.md](tailwind-migration-plan.md)

## 1. 背景

九批迁移 + 两次收尾后，组件样式已全部 utility 化：

| 文件 | 行数 | 内容 |
|---|---:|---|
| `global.css` | 334 | 基础设施 |
| `tokens.css` | 96 | 主题变量 |
| `tailwind.css` | 52 | `@theme` |
| `studio.css` | 32 | 左右栏变量覆盖 |
| `stage.css` | 15 | three.js canvas |
| `base.css` | 14 | base layer |

但 JSX 中仍有约 20 个**不承载样式**的语义类名，作为行为钩子使用。它们与 utility 混在 `className` 里，容易被误认为"还有一套旧样式体系"，也会诱导后来者在 `global.css` 里为它们补规则。

本方案把这些钩子统一为 `data-*` 属性，使 `className` 只含 utility。

## 2. 现状清单（已核实）

### 2.1 画布节点锚点

| 类名 | 出现点 | 用途 |
|---|---|---|
| `cnode__handle` / `--left` / `--right` / `-icon` | 5 个 NodeView、`global.css` 20 行、`scripts/cdp-connect.mjs`、`scripts/cdp-drag.mjs`、`AddNodeMenu` | React Flow 连接点覆盖 + 脚本定位 |
| `cnode__card` | 5 个 NodeView、`global.css` | `body.is-picking` 高亮锚点 |
| `cnode` | 5 个 NodeView、`global.css` | 连接点作用域、选中态 |
| `group-node` | `GroupNodeView`、`global.css` | 组节点连接点 |
| `studio-node` / `stage-node` / `film-node` | 对应 NodeView、`global.css`、`stores/canvas/slices/graph.ts` | 派生/被动连接点隐藏 |
| `is-selected` | 5 个 NodeView、`global.css` 2 行 | 选中时显示连接点 |

### 2.2 功能锚点

| 类名 | 出现点 | 用途 |
|---|---|---|
| `agent-panel` | `AgentPanel`、`e2e/app.spec.ts` | e2e 断言 |
| `promptbar__input-wrap` | `PromptBar` 3 处 | 提及菜单 `closest()` |
| `promptbar__advanced` | `PromptBar` 3 处 | 点击外部关闭 `closest()` |
| `add-menu` | `AddNodeMenu`、`scripts/cdp-drag.mjs` | CDP 脚本检测 |
| `studio-window` / `stage-window` | `scope.ts`、`StudioWindow`/`StageWindow`、`studio.css`/`stage.css` | 窗口作用域与 CSS 变量 |
| `brand-wordmark__dark/light` | `Brand.tsx`、`global.css` 3 行 | 主题切换图片显隐 |

### 2.3 body 状态类

| 类名 | 出现点 | 用途 |
|---|---|---|
| `is-exporting` | `TopBar`、`global.css` 8 行 | 导出时隐藏浮层 |
| `is-picking` | `PromptBar`、`global.css` 2 行 | 画布选点高亮 |
| `is-node-menu-open` | `NodeToolbar`、`global.css` 1 行 | 节点层级 |
| `is-hand-tool` | `Canvas`、`global.css` 2 行 | 抓手光标 |

## 3. 映射表

| 现在 | 改后 |
|---|---|
| `cnode__handle` + `--left`/`--right` | `data-handle="left"` / `"right"` |
| `cnode__handle-icon` | `data-handle-icon` |
| `cnode__card` | `data-node-card` |
| `cnode` | `data-cnode` |
| `group-node` | `data-node-kind="group"` |
| `studio-node` / `stage-node` / `film-node` | `data-node-kind="studio|stage|film"` |
| `is-selected` | `data-selected` |
| `agent-panel` | `data-testid="agent-panel"` |
| `promptbar__input-wrap` | `data-promptbar-input` |
| `promptbar__advanced` | `data-promptbar-advanced` |
| `add-menu` | `data-add-menu` |
| `studio-window` / `stage-window` | `data-window="studio|stage"` |
| `brand-wordmark__dark` / `__light` | `data-brand="dark"` / `"light"` |
| `body.is-exporting` | `body[data-exporting]` |
| `body.is-picking` | `body[data-picking]` |
| `body.is-node-menu-open` | `body[data-node-menu-open]` |
| `body.is-hand-tool` | `body[data-hand-tool]` |

`topbar` / `bottombar` / `statusbar` / `promptbar` / `window-controls` / `library-panel` / `export-menu` 同样改为 `data-slot="topbar"` 等，导出隐藏选择器同步改写。

## 4. CSS 选择器改写

`global.css` 约 20 条规则需要同步：

```css
/* 连接点 */
.cnode .react-flow__handle[data-handle='left'] { ... }
.cnode .react-flow__handle[data-handle='right'] { ... }
[data-cnode][data-selected] .react-flow__handle[data-handle] { ... }

/* 派生命名连接点 */
[data-node-kind='studio'] .react-flow__handle[data-handle].is-derived { ... }
```

（具体选择器在执行时逐条核对，避免破坏 React Flow 的基础选择器优先级。）

## 5. 执行步骤

### 第一步：画布节点锚点

1. 5 个 NodeView 的 `cnode__*`、`*-node`、`is-selected` 改为对应 `data-*`。
2. `global.css` 的连接点、选中态、`is-picking` 规则改写为属性选择器。
3. `scripts/cdp-connect.mjs`、`scripts/cdp-drag.mjs`、`AddNodeMenu` 的选择器同步。
4. `stores/canvas/slices/graph.ts` 中的 `stage-node` 字符串同步。

验收：typecheck / test / build / check:docs，外加手动确认节点选中时连接点正常显示、拖拽建连线正常。

### 第二步：功能锚点与 body 状态

1. `agent-panel` → `data-testid`，同步 `e2e/app.spec.ts`。
2. `promptbar__*` 钩子 → `data-*`，同步 `PromptBar` 的 `closest()`。
3. `add-menu` → `data-add-menu`，同步 `cdp-drag.mjs`。
4. `studio-window` / `stage-window` → `data-window`，同步 `scope.ts` 与 `studio.css` / `stage.css` 的变量作用域选择器。
5. `brand-wordmark__*` → `data-brand`，同步 `global.css` 的主题切换规则。
6. body 状态类 → `data-*`，同步 `TopBar`、`PromptBar`、`NodeToolbar`、`Canvas` 与导出隐藏规则。
7. `topbar` / `bottombar` 等布局锚点 → `data-slot`。

验收：typecheck / test / lint / build / check:docs，加 `pnpm test:e2e`。

## 6. 影响文件

| 类型 | 文件 |
|---|---|
| 节点视图 | `CineNodeView`、`GroupNodeView`、`StudioNodeView`、`StageNodeView`、`FilmNodeView`、`VideoOpNodeView` |
| 画布 | `Canvas`、`TopBar`、`NodeToolbar`、`PromptBar`、`AddNodeMenu`、`StatusBar`、`BottomBar` |
| Agent | `AgentPanel` |
| 品牌 | `Brand` |
| 窗口作用域 | `studio/scope.ts`、`StudioWindow`、`StageWindow` |
| Store | `stores/canvas/slices/graph.ts` |
| 样式 | `global.css`、`studio.css`、`stage.css` |
| 脚本/测试 | `scripts/cdp-connect.mjs`、`scripts/cdp-drag.mjs`、`e2e/app.spec.ts` |

## 7. 验证与回滚

每一步独立分支 + PR，验收门槛与前面一致：

1. `corepack pnpm typecheck`
2. `corepack pnpm test -- --run`（59 文件 / 400 用例）
3. `corepack pnpm lint`（0 errors）
4. `corepack pnpm build`
5. `corepack pnpm check:docs`
6. 第二步额外跑 `corepack pnpm test:e2e`

回滚单位是单步：`git revert` 对应 PR 即可，两步互不依赖。

## 8. "完全迁移"的判定标准

完成本方案后，满足以下条件即视为完全迁移：

1. `className` 中只有 utility，没有任何自定义语义类名。
2. 行为钩子全部为 `data-*`，且不参与样式（只被选择器或脚本读取）。
3. `global.css` 只剩文件头列出的基础设施：滚动条、原生控件重置、React Flow 覆盖、连接点、导出隐藏、全局状态、keyframes、品牌字标。
4. 六个 CSS 文件合计 ≤ 550 行，其中组件样式 0 行。
5. 新增组件不需要写任何 CSS 文件或语义类名。

## 10. 进度

| 步骤 | 状态 | 结果 |
|---|---|---|
| 第一步：画布节点锚点 | done | 6 个 NodeView、`global.css` 10 条选择器、2 个 CDP 脚本、`AddNodeMenu`；连接点选中态验证通过 |
| 第二步：功能锚点与 body 状态 | done | `agent-panel`、`promptbar__*`、`add-menu`、`*-window`、`brand-wordmark`、导出隐藏、body 状态全部改 `data-*`；同步 e2e 与脚本 |
| 补漏：工具提示与节点工具栏 | done | `app-tooltip` / `ref-preview` 原先类名在、样式已丢，已补 utility；`cnode__toolbar-item/submenu` 改 `data-toolbar-*` |

最终状态：组件 `className` 只含 utility 与 Tailwind 变体，行为钩子全部为 `data-*`；`global.css` 332 行仅剩基础设施。

## 9. 不迁移的项（物理边界）

以下内容永远保留 CSS，不属于"未完成"：

- `::-webkit-scrollbar*`：无对应 utility。
- `@layer base` 的原生控件重置：utility 化按钮依赖该基线。
- React Flow 运行时注入 DOM 的覆盖样式。
- `@keyframes promptbar-in` / `welcome-in`。
- three.js canvas 尺寸。
- 运行期计算的 inline style（节点位置、播放头、进度、相机）。
