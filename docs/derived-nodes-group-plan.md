# 派生节点自动成组与尺寸规范

> 状态：实施中
> 日期：2026-11-07
> 关联：`src/renderer/src/stores/canvas.ts`、`NodeToolbar.tsx`、`PromptBar.tsx`

## 1. 调研结果

会产生多个节点的功能：

| 功能 | 结果 | 处理 |
|---|---|---|
| 宫格切分 | 4/9/16/25 张图片 | 自动成组，按切分行列排列，节点宽 240 |
| 分离音视频 | 视频 + 音频 2 个节点 | 自动成组，垂直排列 |
| 上传/导入多个文件 | 每个文件一个节点 | 自动成组，垂直排列 |
| 抽帧（首/尾/当前） | 1 个节点 | 不成组 |
| 分镜拼接 | 1 个节点 | 不成组 |
| 深度动作捕捉 | 1 个节点 | 不成组 |
| 裁剪/裁切/截取 | 单节点版本回写 | 不成组 |
| AI 图像操作 | 单节点版本回写 | 不成组 |
| 一次生成多张图 | 同一节点多个 outputs | 不涉及多节点 |
| 分镜组 | 本身是组 | 不变 |

## 2. 尺寸

- 图片节点默认宽度 360，视频节点默认宽度 480。
- 宫格切分节点宽 `GRID_SPLIT_CELL_WIDTH`（240），高度按切图比例 + 标题栏。
- 分镜组单元格保持 `STORYBOARD_CELL_WIDTH`（480）。
- 分离音视频保持原节点尺寸（视频 480、音频 348）。
- 上传素材保持原节点尺寸。
- 组内布局：padding 24、header 36、gap 24。

## 3. 实现

### 3.1 `addAssetNodes` 增加布局参数

```ts
interface AddAssetLayout {
  columns?: number
  cellWidth?: number
  groupTitle?: string
  groupColor?: GroupColor
}
```

- 宫格切分传 `columns: cols`、`cellWidth: 240`、`groupTitle: '宫格组 N'`。
- 传入 `groupTitle` 时，同步创建普通组，子节点使用相对坐标。
- 不传时保持现有行为。

### 3.2 新增 `createGroupFromNodes`

```ts
createGroupFromNodes(nodeIds, options): string | null
```

- 用于分离音视频和多文件上传。
- 按指定列数排列，自动创建普通组。
- 组标题默认 `分组 N`，可传 `音视频组 N` / `素材组 N`。
- 少于 2 个节点时不成组。

### 3.3 调用点

- `NodeToolbar.executeGridSplit`：宫格切分 → `宫格组 N`。
- `NodeToolbar.executeSplitAv`：视频 + 音频 → `音视频组 N`，垂直排列。
- `PromptBar.handleLocalUpload`：多文件上传 → `素材组 N`，垂直排列，上传后仍选中原节点。

## 4. 验收

- 宫格切分后自动出现组框，节点按切分行列排列，宽度 240。
- 组内节点仍保留 source → 子节点连线。
- 分离音视频生成组，包含视频和音频。
- 上传多个文件生成素材组；单个文件不成组。
- 撤销可以恢复生成前的画布。
- `pnpm typecheck`、`pnpm build` 通过。
