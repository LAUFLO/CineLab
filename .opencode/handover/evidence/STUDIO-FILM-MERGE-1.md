# STUDIO-FILM-MERGE-1 · 剪辑室合并成片、文本节点编辑入口、模型参数常用卡片压缩

日期：2026-11-09

## 1. 剪辑室与成片节点合并

### 数据结构

- `StudioNodeData` 增加 `filmStatus / outputs / selectedOutputId / upstreamAck`。
- `filmNodeId`、`FilmNodeData` 保留为旧项目兼容字段。
- `NODE_META.studio` 从 360×260 改为 480×340（含标题总高 368）。

### 节点

`StudioNodeView` 重写为完整成片卡片：

- 标题栏状态徽标：待生成 / 渲染中 / 可导出 / 待更新 / 时间线为空 / 成片缺失
- 16:9 成片预览，圆形播放按钮打开全屏 `VideoPlayer`
- 摘要行：片段数 / 成片时长与分辨率 / 多版本切换
- 操作条：剪辑室、VTT、H.264/HEVC/AV1、生成成片 / 重新生成 / 取消
- 双击卡片进入剪辑室；右侧 source handle 输出成片
- 渲染进度覆盖在预览区左下角

### 迁移

`loadCanvas` 内执行一次、幂等：

1. film 节点的 `outputs / selectedOutputId / filmStatus / upstreamAck` 并入对应剪辑室
2. film 的下游边 source 改写为剪辑室
3. 删除「剪辑室 → 成片」边与 film 节点
4. 孤儿 film 降级为普通视频素材节点，outputs 不丢
5. 旧剪辑室尺寸统一迁移到 480×368

实测：构造 33 节点 / 20 边的旧项目，加载后变为 32 节点 / 19 边；film 节点 0 个；剪辑室显示「可导出」、640×360、成片预览；`edge_film_down` 的 source 由 `film_old_1` 改写为 `studio_mw7ldl83_1`。

### 状态同步

- `syncStudioAfterSave` 不再创建成片节点，直接更新剪辑室摘要与成片状态。
- 时间线清空但已有成片时标记 `stale`，保留成片。
- `UpstreamWatcher`、`StudioWindow` 改为读剪辑室自身的 `filmStatus / upstreamAck`。
- 删除剪辑室：有成片时提供「保留成片为视频节点 / 一起删除」，新增 `detachStudioOutput`。
- 右键菜单新增「下载成片」，保留「进入剪辑室」。
- 资产移动同步剪辑室成片路径（`LibraryWindow`）。
- `FilmNodeView` 改为只读兜底组件。

## 2. 文本节点编辑入口

- 根因：放大按钮统一调用 `onExpand`，但预览弹层只在 image/video 时渲染，文本节点点击无任何反应。
- 文本节点的放大按钮现在打开 Markdown 大编辑弹窗，tooltip 改为「放大编辑」。
- `NodeToolbar` 新增 `onEdit`，文本节点工具栏出现「编辑」按钮。
- 无 output 的文本节点（minimal 工具栏）也增加「编辑」按钮。
- 四个入口统一到同一个弹窗：双击节点内文本、节点右上角编辑、工具栏编辑、工具栏放大。
- 实测无 output 文本节点工具栏为「编辑 | 剪辑室」，点击编辑弹窗正常打开并显示 Markdown 预览。

## 3. 模型参数常用卡片压缩

- 2 列大卡片改为单行 chips：`尺寸 4 项 +`、`画幅比例 6 项 ✓`。
- 已有参数时默认折叠为一行「常用参数 2/5 · 点击标签添加 · 全部添加」。
- 参数为空时自动展开。
- 描述文案收进 hover tooltip。
- 常用参数区域高度从约 320px 降到约 36px（折叠）/ 约 80px（展开）。

## 4. 环境问题修复

- 现象：dev 模式下所有边不渲染，但 store 中 edges 正常、生产构建正常。
- 原因：`node_modules/.vite` 依赖预打包缓存损坏（上一轮新增 marked 触发 re-optimize 后出现）。
- 处理：删除 `node_modules/.vite` 重新预打包。dev 恢复 19 条边渲染。

## 验证

- `corepack pnpm typecheck` 通过
- `corepack pnpm test`：24 个文件、145 个用例通过
- `corepack pnpm build` 通过
- dev 实例：32 节点 / 19 边，剪辑室合并成片卡片正常
- preview 生产构建：32 节点 / 19 边，迁移与渲染正常
- 截图：`STUDIO-FILM-MERGE-1-studio.png`、`-params-collapsed.png`、`-params-open.png`
