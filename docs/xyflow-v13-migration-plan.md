# React Flow 13 迁移评估与改动方案

日期：2026-11-23
状态：待实施
关联：[code-map/01-canvas.md](code-map/01-canvas.md)、[code-map/10-ui.md](code-map/10-ui.md)、[code-map/08-capabilities.md](code-map/08-capabilities.md)

> 本文基于 v0.4.5（`@xyflow/react` 12.12.1）代码评估，行号仅供参考，实施时以最新代码为准。

## 1. 背景与目标

Dependabot PR #115 将 `@xyflow/react` 从 12.12.1 升级到 13.0.2。这次是主版本升级，Dependabot 只改了 `package.json`，CI 的 `typecheck` 直接失败，不能按普通依赖升级处理。

目标：

- 平滑迁移到 React Flow 13，保持现有画布交互与视觉一致；
- 明确每个破坏性变更的落点与改法，避免实施时边改边猜；
- 给出可回滚的实施顺序与验证清单。

## 2. 现状与约束

| 要求 | 项目现状 | 结论 |
|---|---|---|
| React ≥ 18 | React 19.3.1 | 满足 |
| Zustand 5 | Zustand 5.1.0 | 满足 |
| Node ≥ 20（Electron 内置） | Electron 45.4.1 → Node 22 | 满足 |
| TypeScript | TS 7，加密环境回退 5.9 | 满足 |

`@xyflow/react` 在项目中的使用点共 20 处导入，集中在：

- `src/shared/canvas-commands.ts`
- `src/renderer/src/stores/`：`canvas.ts`、`canvas-model.ts`、`canvas/slices/graph.ts`、`canvas/slices/groups.ts`、`ui.ts`
- `src/renderer/src/canvas/`：`Canvas.tsx`、`edges/FlowEdge.tsx`、`PromptBar.tsx`、`context-actions.ts`
- `src/renderer/src/canvas/nodes/`：`CineNodeView.tsx`、`FilmNodeView.tsx`、`GroupNodeView.tsx`、`StageNodeView.tsx`、`StudioNodeView.tsx`、`VideoOpNodeView.tsx`、`VideoPreview.tsx`
- `src/renderer/src/panels/`：`NodeSearch.tsx`、`HistoryPanel.tsx`

## 3. 破坏性变更影响矩阵

| v13 变更 | 是否受影响 | 落点 |
|---|---|---|
| `applyNodeChanges` / `applyEdgeChanges` 移除，改用 `changeset.applyTo()` | 必改 | `stores/canvas/slices/graph.ts` 的 `onNodesChange` / `onEdgesChange` |
| `addEdge` 移除 | 必改 | 同文件 `onConnect` |
| `useStore` 移除，拆为 `useNodesStore` / `useEdgesStore` 等 | 必改 | `canvas/edges/FlowEdge.tsx` |
| `onNodesChange` / `onEdgesChange` 参数由数组改为 `NodeChangeset` / `EdgeChangeset` | 必改 | `stores/canvas.ts` 类型、`graph.ts`、`PromptBar.tsx` 手动调用、`stores/__tests__/canvas.test.ts` |
| 变更类型改名（`NodePositionChange` → `PositionChange` 等） | 不受影响 | 项目只使用 `'position'` / `'select'` / `'remove'` 字符串字面量 |
| `fitView` 的 `padding` 数字按像素解释 | 必改 6 处 | `Canvas.tsx`、`CineNodeView.tsx`、`PromptBar.tsx`、`HistoryPanel.tsx`、`NodeSearch.tsx` |
| 样式进入 `@layer xyflow` | 需调整层顺序 | `styles/tailwind.css`、`Canvas.tsx` 的样式导入 |
| pane 光标移到 `::before` 伪元素 | 需改选择器 | `styles/infrastructure.css` 的手型工具规则 |
| `colorMode` prop 移除，自动读取 `data-theme` | 兼容 | 项目已在 `document.documentElement.dataset.theme` 设置主题 |
| `elevateEdgesOnSelect` 默认改为 `true` | 需视觉验证 | 选中连线流光与节点层级 |
| `onConnectEnd` 的 `to` 改为 flow 坐标 | 不受影响 | 代码只用 `state.fromNode` / `fromHandle` / `toNode` |
| `Handle` 类型改名 `HandleBounds` | 不受影响 | 项目未使用该类型 |
| `useHandleConnections` / `getHandleConnections` 移除 | 不受影响 | 未使用 |
| `nodeClickDistance` 移除、`paneClickDistance` → `paneDragThreshold` | 不受影响 | 未使用 |
| 父节点无需排在子节点之前 | 不受影响 | 无顺序依赖假设 |

## 4. 改动方案

### 4.1 依赖

```bash
corepack pnpm add @xyflow/react@^13.0.2
```

`@xyflow/system` 1.0.0 作为传递依赖自动引入。Zustand 与 React 已满足要求，不需要额外升级。

### 4.2 store 层

#### `src/renderer/src/stores/canvas.ts`

- 删除未使用的 `addEdge`、`applyNodeChanges`、`applyEdgeChanges` 导入。
- 接口签名改为兼容数组与 changeset，避免外部手动调用方（PromptBar、测试）大改：

```ts
import type { NodeChangeset, EdgeChangeset } from '@xyflow/react'

onNodesChange: (changes: NodeChangeset<CanvasNode> | NodeChange<CanvasNode>[]) => void
onEdgesChange: (changes: EdgeChangeset<CineEdge> | EdgeChange<CineEdge>[]) => void
```

#### `src/renderer/src/stores/canvas/slices/graph.ts`

`NodeChangeset` / `EdgeChangeset` 是 `@xyflow/system` 的 `Changeset` 子类，支持：

- `applyTo(elements): Element[]`
- `getByType(type): Change[]`
- `getForNode(id)` / `removeForNode(id)`
- `toArray(): Change[]`
- `[Symbol.iterator]()`

需要注意：**它不是数组**，没有 `some` / `map` / `filter` 方法，现有代码需要改写。

推荐实现：

```ts
import {
  NodeChangeset,
  EdgeChangeset,
  type NodeChange,
  type EdgeChange
} from '@xyflow/react'

const asNodeChanges = (
  input: NodeChangeset<CanvasNode> | NodeChange<CanvasNode>[]
): NodeChangeset<CanvasNode> =>
  input instanceof NodeChangeset ? input : new NodeChangeset(input)

const asEdgeChanges = (
  input: EdgeChangeset<CineEdge> | EdgeChange<CineEdge>[]
): EdgeChangeset<CineEdge> =>
  input instanceof EdgeChangeset ? input : new EdgeChangeset(input)

onNodesChange: (input) => {
  const changes = asNodeChanges(input)

  if (changes.getByType('remove').length > 0) get().pushHistory()

  const boxSelecting = get().boxSelecting
  const effective = boxSelecting
    ? new NodeChangeset(
        changes.toArray().map((change) =>
          change.type === 'select' &&
          change.selected &&
          get().nodes.some((node) => node.id === change.id && isGroupNode(node))
            ? { ...change, selected: false }
            : change
        )
      )
    : changes

  const nodes = effective.applyTo(get().nodes)
  const removed = changes.getByType('remove').map((change) => change.id)

  let edges = get().edges
  if (removed.length > 0) {
    edges = edges.filter(
      (edge) => !removed.includes(edge.source) && !removed.includes(edge.target)
    )
  }

  set({ nodes, edges })
}

onEdgesChange: (input) => {
  const changes = asEdgeChanges(input)
  const removedIds = new Set(
    changes.getByType('remove').map((change) => change.id)
  )

  if (removedIds.size === 0) {
    set({ edges: changes.applyTo(get().edges) })
    return
  }

  const removedEdges = get().edges.filter((edge) => removedIds.has(edge.id))
  const edges = changes.applyTo(get().edges)
  set({
    edges,
    nodes: clearEdgeReferences(get().nodes, edges, removedEdges)
  })
}
```

`onConnect` 中的 `addEdge` 替换为数组追加。现有代码在调用前已用 `exists` 做了 `source` / `target` 去重，`addEdge` 实际只负责追加：

```ts
set({
  edges: [
    ...get().edges,
    {
      id: nextId('edge'),
      source: connection.source,
      target: connection.target,
      type: 'flow',
      data: { role: 'auto' }
    }
  ]
})
```

#### `src/renderer/src/stores/canvas-model.ts`

删除未使用的 `addEdge`、`applyNodeChanges`、`applyEdgeChanges` 导入，只保留类型导入。

### 4.3 `src/renderer/src/canvas/edges/FlowEdge.tsx`

v12 使用：

```ts
const nodeHighlighted = useStore((state) => state.nodeLookup.get(source)?.selected || ...)
const glowEnabled = useStore((state) => state.edges.length <= 300)
```

最小改动版（行为与 v12 等价）：

```ts
import { BaseEdge, getBezierPath, useNodesStore, useEdgesStore, type EdgeProps } from '@xyflow/react'

const nodeHighlighted = useNodesStore(
  useCallback(
    (state) =>
      Boolean(
        state.nodeLookup.get(source)?.selected ||
        state.nodeLookup.get(target)?.selected
      ),
    [source, target]
  )
)
const glowEnabled = useEdgesStore((state) => state.edges.length <= 300)
```

性能优化版（v13 推荐）：

```ts
import { useNode } from '@xyflow/react'

const sourceSelected = useNode(source)?.selected ?? false
const targetSelected = useNode(target)?.selected ?? false
const highlighted = selected || sourceSelected || targetSelected
const glowEnabled = useEdgesStore((s) => s.edges.length <= 300)
```

`useNode(id): NodeType | undefined` 在 13.0.2 中存在。优化版只在对应节点变化时重渲染，适合边数量较大的画布。

注意：v13 的 store hooks 不再接受 equality 参数，需要浅比较时改用 `useShallow` 或 `useEqualSelector`。当前选择器只返回布尔值，不需要。

### 4.4 `fitView` padding

v12 的 `padding` 是视口比例；v13 中无单位数字按像素解释。换算公式（与官方锚点 0.1 ≈ 4.5%、0.5 ≈ 16.7%、1 ≈ 25%、2 ≈ 33% 一致）：

```text
pct = (1 - 1 / (1 + p)) / 2 × 100%
```

| 位置 | 现值 | 建议值 |
|---|---|---|
| `Canvas.tsx` 的 fitView token 效果 | `padding: 0.2` | `padding: '8%'` |
| `Canvas.tsx` 的 arrange 效果 | `padding: 0.2` | `padding: '8%'` |
| `CineNodeView.tsx` 的节点聚焦 | `padding: 0.6` | `padding: '19%'` |
| `PromptBar.tsx` 的参考返回聚焦 | `padding: 0.8` | `padding: '22%'` |
| `PromptBar.tsx` 的槽位聚焦 | `padding: 0.6` | `padding: '19%'` |
| `HistoryPanel.tsx` 的历史跳转 | `padding: 0.8` | `padding: '22%'` |
| `NodeSearch.tsx` 的搜索跳转 | `padding: 0.8` | `padding: '22%'` |

百分比可按实际视觉微调，不必严格等于换算值。

### 4.5 样式

#### `src/renderer/src/styles/tailwind.css`

v13 的样式位于 `@layer xyflow`，必须排在 Tailwind 的 `base` 之后、`utilities` 之前。在文件第一行（`@import 'tailwindcss'` 之前）声明层顺序：

```css
@layer theme, base, xyflow, components, utilities;

@import 'tailwindcss';
```

#### `src/renderer/src/styles/infrastructure.css`

手型工具的 pane 光标改到伪元素：

```css
.react-flow[data-hand-tool] .react-flow__pane::before {
  cursor: grab;
}

.react-flow[data-hand-tool] .react-flow__pane:active::before {
  cursor: grabbing;
}
```

#### `src/renderer/src/canvas/Canvas.tsx`

- 样式导入可改为新路径（旧路径仍兼容）：`import '@xyflow/react/style.css'`
- 不传 `colorMode`，v13 自动读取 `documentElement[data-theme]`
- `onConnectEnd` 无需改，现有实现未使用 `state.to`

### 4.6 调用方兼容

`PromptBar.tsx` 与 `stores/__tests__/canvas.test.ts` 直接向 `onNodesChange` / `onEdgesChange` 传数组。由于 4.2 的兼容层，这两处不需要改；若希望严格类型化，可改为 `new NodeChangeset([...])`。

## 5. 验证

### 5.1 自动验证

- `corepack pnpm typecheck`
- `corepack pnpm test`（重点 `stores/__tests__/canvas.test.ts`；本地透明加密环境会有临时文件尺寸误报，以 CI 为准）
- `corepack pnpm check:ui`
- `corepack pnpm check:docs`
- `corepack pnpm check:encryption`
- `corepack pnpm build`

### 5.2 手动回归（隔离实例）

1. 节点拖拽、多选、框选（组节点不应被框选选中）
2. 连线创建、节点删除后关联边清理、参考 `refOrder` 清理
3. 撤销 / 重做（`onNodesChange` 的 remove 历史触发）
4. 选中节点后连线流光刷新
5. `elevateEdgesOnSelect` 默认 true 后，选中边与节点、右键菜单的层级
6. `fitView` 留白：状态栏缩放、排列、节点定位、搜索跳转、历史跳转
7. 手型工具光标 grab / grabbing
8. 主题切换后 MiniMap、Background、控制点配色
9. 300 条边以上流光降级
10. `onlyRenderVisibleElements` 下大画布滚动

### 5.3 打包验证

- Windows 安装包冒烟
- macOS 构建（CI）

## 6. 实施步骤

在 `feat/xyflow-v13` 分支按可回滚的小提交推进：

1. `chore: upgrade @xyflow/react to 13.0.2`（仅 `package.json` + lockfile，预期 typecheck 失败）
2. `refactor: migrate canvas store to changesets`（`canvas.ts`、`graph.ts`、`canvas-model.ts` + 测试）
3. `refactor: migrate FlowEdge store subscriptions`（`FlowEdge.tsx`）
4. `fix: migrate fitView padding and xyflow css layer`（padding + 2 个 CSS 文件）
5. `fix: restore xyflow v13 visual parity`（按回归结果微调）
6. 开 PR，CI 通过后合并，纳入下一个版本

## 7. 风险与回滚

| 风险 | 等级 | 应对 |
|---|---|---|
| 选中节点流光不刷新（store 拆分） | 中 | 用 `useNode` 精确订阅，回归第 4 项 |
| `elevateEdgesOnSelect` 默认 true 改变层级 | 中 | 显式传 `elevateEdgesOnSelect={false}` 保持 v12 行为，或接受后调样式 |
| CSS layer 顺序错误导致基础样式被 Tailwind preflight 覆盖 | 中 | 按 4.5 声明层顺序，回归节点、控制点、MiniMap |
| `fitView` 留白变化 | 低 | 百分比可调，视觉验收 |
| 框选过滤组节点的 changeset 逻辑写错 | 中 | 单测覆盖 + 手动框选 |
| `addEdge` 替换遗漏去重 | 低 | 现有 `exists` 已去重，可补单测 |

回滚方式：`git revert` 整个分支，或将 `package.json` 改回 `^12.12.1` 后重新安装。v13 无数据格式变更，项目文件不需要迁移。

## 8. 工作量

| 项 | 预计 |
|---|---|
| 依赖升级 + 类型对齐 | 1–2 小时 |
| store changeset 迁移 | 3–4 小时 |
| FlowEdge / padding / CSS | 2–3 小时 |
| 回归与视觉微调 | 3–4 小时 |
| 合计 | 约 1.5 天 |
