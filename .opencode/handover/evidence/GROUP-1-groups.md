# GROUP-1 分组节点实现与验证

日期：2026-11-05
代码状态：已实现，未提交

## 实现范围

| 层 | 内容 |
|---|---|
| `src/shared/canvas-schema.ts` | `GroupColor`、`GroupNodeData`、`GROUP_COLORS`、`GROUP_LABELS`、`GROUP_HEADER_HEIGHT/PADDING/GAP` |
| `src/shared/project-schema.ts` | `groupColorSchema`、`groupNodeSchema`、`canvasNodeSchema` 联合、`cineNodeSchema.parentId` |
| `src/renderer/src/stores/canvas.ts` | `CanvasNode` 联合类型、`nodeSize`、`absolutePosition`；动作：`groupSelection` / `mergeSelection` / `ungroup` / `deleteGroupWithChildren` / `renameGroup` / `setGroupColor` / `arrangeGroup` / `detachNode` / `syncGroupBounds`；复制、删除级联、撤销重做、框选过滤 |
| 新增 `canvas/nodes/GroupNodeView.tsx` | 组框、标题、节点数、双击重命名 |
| 新增 `canvas/GroupToolbar.tsx` | 重命名、排列（横/竖/网格）、10 色、解组、删除 |
| `canvas/MultiSelectBar.tsx` | 打组、合并分组、组删除文案 |
| `canvas/Canvas.tsx` | 注册 `group` 节点、拖出脱离、Delete 二次确认、框选标记 |
| `components/WindowControls.tsx` | 主题、设置按钮并入全局右上角常驻区 |
| `styles/tokens.css` / `global.css` | 10 组深浅主题色、组框与工具栏样式 |

## 自动化验证（隔离实例，CDP 9222）

| 验收项 | 结果 |
|---|---|
| 框选/选中 2+ 节点打组，组框包住全部节点 | 通过（相对坐标 24/36 起，组宽高按内容计算） |
| 拖动子节点到组外后脱离 | 通过（parentId 移除，坐标转绝对，组框收缩） |
| 刷新后组与子节点关系保留 | 通过（磁盘 JSON 含 group + parentId） |
| 双击标题重命名 | 通过（Enter 提交，DOM 与 store 同步） |
| 10 色切换 | 通过（violet 切换后 class 与变量生效） |
| 横排 / 竖排 / 网格 | 通过（间距 24，组框重算） |
| 解组后子节点位置不变 | 通过（绝对坐标 100,200 与原位一致） |
| 删除组级联子节点 | 通过（removeSelection 一次删 5 个，二次确认弹出） |
| 复制整个组 | 通过（新组 + 子节点，偏移 24） |
| 复制组内单个子节点 | 通过（留在原组，偏移 24，组框扩大） |
| 撤销 / 重做 | 通过（undo 恢复散节点，redo 恢复组） |
| 旧画布（仅 cine 节点）打开与保存 | 通过（原项目正常打开，保存无 ZodError） |

## 待人工验证

- 真实鼠标拖动组标题整组移动（自动化用 store 调用代替）
- 真实鼠标拖拽框选（已用 store 模拟 select change 验证过滤逻辑）
- 组框跟随子节点边缘超出时自动扩大（逻辑已实现，未做边界拖拽实测）

## 2026-11-05 视觉复查

- 清除 React Flow 对 `node-group` 的默认深色边框、白底、10px 内边距和选中阴影；选中组时不再出现外层黑框
- 组标题栏取消底部分隔线
- 单选组时隐藏 `nodesselection` 的高亮伪元素，避免与组框重复
- 多选包围框改为圆角 18px、命中区域外扩 10px，使用 `--link` 主题色

## 2026-11-05 组工具栏定位修复

- 原因一：居中偏移被 `Math.min(rect.width / 2, 240)` 限制，宽组会偏左；改为按组框中心计算，并限制在视口内
- 原因二：`transform: translateX(-50%)` 被入场动画 `menu-in` 覆盖，居中失效；改用独立 `translate: -50% 0` 属性，`multi-bar` 同步修正
- 工具栏与组框间距固定 14px
- 实测：工具栏中心 = 组框中心（638 = 638），间距 14px；多选栏中心差 0

## 已知限制

- 复制组沿用原标题，可能出现同名分组（未按设计第 4 节递增编号）
- 不支持嵌套组（按设计 v1 范围）
- 组内子节点 zIndex 固定 1，组固定 0，选中提升由 React Flow 控制
