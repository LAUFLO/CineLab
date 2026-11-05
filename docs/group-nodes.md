# 打组 / 分组节点设计方案

> 状态：已确认，待开新分支实现
> 建议分支：`feat/group-nodes`
> 日期：2026-11-05

## 1. 目标

在画布上支持持久的节点分组：

- 多个节点组成一个组，刷新后关系保留
- 组可以重命名
- 组框颜色可切换
- 组内节点支持横排、竖排、网格三种整理方式
- 拖动组时子节点一起移动
- 子节点拖出组后自动变成独立节点
- 支持和多选工具栏配合的「打组」「合并分组」

## 2. 多选与组的区别

| | 多选 | 组 |
|---|---|---|
| 生命周期 | 临时，点击空白即取消 | 持久，写入画布 JSON |
| 视觉 | 只有选中框 | 有组框、标题、颜色 |
| 移动 | 需要重新框选 | 拖动组即可整组移动 |
| 用途 | 批量操作 | 场景 / 镜头 / 素材组织 |
| 子节点 | 各自独立 | 仍独立，但归属于组 |

多选工具栏继续保留，增加「打组」「合并分组」。

## 3. 数据模型

采用 React Flow 父子节点。

```ts
type GroupColor =
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'lime'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'violet'
  | 'slate'

interface GroupNodeData {
  title: string
  color: GroupColor
}

type GroupNode = Node<GroupNodeData, 'group'>

type CanvasNode = CineNode | GroupNode
```

子节点增加可选字段：

```ts
{
  parentId?: string
  position: { x: number; y: number } // 有 parentId 时相对组左上角
}
```

组节点使用 `type: 'group'`，尺寸放在 `style.width` / `style.height`。

### 持久化

`src/shared/project-schema.ts` 增加：

- `groupColorSchema`
- `groupNodeSchema`
- `canvasDataSchema.nodes` 改为 `z.union([cineNodeSchema, groupNodeSchema])`
- `cineNodeSchema` 增加可选 `parentId`

旧画布没有 `parentId` 和 group 节点，仍能正常解析，`schemaVersion` 保持 1。

## 4. 创建组

入口：多选工具栏「打组」。

步骤：

1. 收集当前选中的生成节点（不含 group）
2. 计算包围盒
3. 创建组节点，位置为包围盒左上角减去内边距
4. 计算组初始宽高：内容包围盒 + 左右 padding + 标题栏高度
5. 子节点设置 `parentId`，位置改为相对组坐标
6. 组标题默认「分组 N」，N 按现有组数量递增
7. 新组选中，显示组工具栏
8. 记录一次历史

### 合并分组

选中 2 个以上组，或「组 + 散节点」时显示「合并分组」：

1. 收集所有组的子节点和散节点
2. 创建新组
3. 把子节点迁移到新组
4. 删除旧组框
5. 新组自动网格整理
6. 记录一次历史

v1 不支持嵌套组。

## 5. 选择与拖动

- 点击组标题或组框空白：选中组
- 点击子节点：选中子节点，不选中组
- 框选：只选中子节点，不选中组
- 组被选中时，隐藏 prompt bar 和节点工具栏，显示组工具栏
- 拖动组标题/组框：整组移动，子节点跟随
- 拖动子节点：组内自由移动，不设置 `extent: 'parent'`

### 拖出组

在 `onNodeDragStop` 判断：

1. 节点有 `parentId`
2. 计算节点中心点在组内的相对坐标
3. 中心点超出组内容区域 → 脱离
4. 中心点仍在组内 → 保留

脱离时：

- 删除 `parentId`
- 把相对坐标转换为画布绝对坐标
- 组框收缩到剩余子节点
- 如果组变空，保留空组（标题显示「空分组」），不自动删除

部分边缘超出但中心在组内时，组框自动扩大包住节点。

## 6. 组的外观

```
┌─ 分组 1 · 5 个节点 ──────────────┐
│                                  │
│   [节点]  [节点]  [节点]          │
│                                  │
└──────────────────────────────────┘
```

- 标题栏高度：36px
- 内容 padding：左右 24px，底部 24px
- 组框圆角：14px
- 边框：1px，使用组颜色
- 背景：组颜色 6% 透明度
- 标题：组名 + 节点数
- 组框在子节点下方渲染

颜色只存 token key，不存十六进制，组件通过 class 使用 CSS 变量。

## 7. 组工具栏

选中单个组时，在组框上方显示：

```
重命名 | 排列 ▾ | 颜色 ▾ | 解组 | 删除
```

### 重命名

- 点击「重命名」或双击标题进入编辑
- Enter / 失焦保存，Esc 取消
- 空名称回退为「分组 N」

### 颜色

展开 10 个色块：

| key | 名称 |
|---|---|
| `blue` | 蓝 |
| `cyan` | 青 |
| `teal` | 蓝绿 |
| `green` | 绿 |
| `lime` | 黄绿 |
| `amber` | 琥珀 |
| `orange` | 橙 |
| `rose` | 玫红 |
| `violet` | 紫 |
| `slate` | 灰 |

颜色保存在 `data.color`，并在 `tokens.css` 提供深浅主题各一套变量：

- `--group-blue`
- `--group-cyan`
- ...
- `--group-slate`

背景使用 `color-mix(in srgb, var(--group-blue) 6%, transparent)`。

### 排列

「排列」菜单提供三种：

1. **横排**
2. **竖排**
3. **网格**

整理规则：

- 子节点排序：横排按 x + y，竖排按 y + x，网格按 y + x
- 间距 24px
- 横排：单行，顶部对齐
- 竖排：单列，左侧对齐
- 网格：列数 = `ceil(sqrt(n))`，按行优先排列
- 整理后按内容重新计算组框宽高
- 组位置保持左上角不变
- 每次整理只记录一次历史

### 解组

- 删除组节点
- 子节点保留
- 子节点坐标从相对转为绝对
- 连线不变
- 记录历史

### 删除

两种语义：

- **解组**：只删组框，保留子节点
- **删除组和节点**：删除组、所有子节点、相关连线，需要二次确认

Delete 键在选中组时等同于「删除组和节点」，必须弹确认。

## 8. 组内节点操作

- 组内节点仍可生成、编辑、复制、删除
- 删除最后一个子节点后，组保留为空组
- 组内节点复制：保持在同一组内，偏移 24px
- 复制整个组：连同子节点一起复制，创建新组和新子节点

## 9. 多选工具栏

在多选工具栏中增加：

```
打组 | 合并分组（选择多个组时出现）
```

多选工具栏原有动作保持：

- 保存到资产
- 创建副本
- 导出选中
- 删除

如果多选中包含组：

- 删除时提示「删除组及组内节点」
- 导出/保存资产只处理有输出的子节点

## 10. 涉及文件

| 文件 | 改动 |
|---|---|
| `src/shared/canvas-schema.ts` | `GroupNodeData`、`GroupColor`、`CanvasNode` 类型 |
| `src/shared/project-schema.ts` | group 节点 schema、`parentId`、联合类型 |
| `src/renderer/src/stores/canvas.ts` | 联合类型、打组/解组/整理/颜色/重命名/组感知复制 |
| `src/renderer/src/canvas/Canvas.tsx` | 注册 `group` 节点类型、拖拽结束检测 |
| 新增 `src/renderer/src/canvas/nodes/GroupNodeView.tsx` | 组框、标题、颜色、组工具栏 |
| 新增 `src/renderer/src/canvas/GroupToolbar.tsx` | 重命名、排列、颜色、解组、删除 |
| `src/renderer/src/canvas/MultiSelectBar.tsx` | 打组、合并分组 |
| `src/renderer/src/canvas/nodes/CineNodeView.tsx` | 组内节点位置、组选中时隐藏节点工具栏 |
| `src/renderer/src/canvas/PromptBar.tsx` | 选中组时隐藏 |
| `src/renderer/src/stores/generation.ts` | 忽略 group 节点 |
| `src/renderer/src/styles/tokens.css` | 10 组颜色变量 |
| `src/renderer/src/styles/global.css` | 组框、组工具栏、颜色块样式 |
| `src/main/ipc/generate.ts` 等 | 不需要改，生成仍按节点 id |

## 11. 实现顺序

1. shared 类型与持久化 schema
2. store 联合类型与基础打组/解组
3. `GroupNodeView` 渲染组框
4. 组工具栏：重命名、颜色
5. 三种排列算法
6. 拖出脱离与组框收缩
7. 多选工具栏「打组 / 合并分组」
8. 复制、删除、历史、自动保存兼容
9. 手动验收 + typecheck

## 12. 验收清单

- [ ] 框选 3 个节点，打组，组框包住全部节点
- [ ] 拖动组，3 个节点一起移动
- [ ] 刷新页面，组和子节点关系保留
- [ ] 双击标题重命名，刷新后名称保留
- [ ] 切换 10 种颜色，深浅主题都正常
- [ ] 横排 / 竖排 / 网格三种整理效果正确
- [ ] 子节点拖出组框，松开后变成独立节点，组框收缩
- [ ] 子节点边缘超出但中心在组内，组框自动扩大
- [ ] 解组后子节点位置不变
- [ ] 删除组和节点有二次确认
- [ ] 撤销 / 重做能恢复组操作
- [ ] 旧画布（无 group）能正常打开
- [ ] `corepack pnpm typecheck` 通过

## 13. 暂不做

- 嵌套组
- 组收起 / 展开
- 手动拖拽调整组框大小
- 组级别的批量生成
- 组内节点自动布局以外的对齐工具
