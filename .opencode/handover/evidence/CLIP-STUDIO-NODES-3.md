# CLIP-STUDIO 节点接线第三刀：引用状态、missing、无输出入口、工具栏

日期：2026-11-07
状态：完成
验证：typecheck / 57 测试 / build 通过；CDP 端到端实测

## 1. 素材引用状态

- `PoolAsset` 增加 `nodeId / outputId`；`assetToClip` 写入 `media.nodeId + media.outputId`。
- 剪辑室节点保存/加载时写入 `data.references: Record<nodeId, outputId>`。
- 成片节点新增 `upstreamAck`，导出成功时记录当前上游输出签名。
- 新增 `studio/references.ts`：
  - `analyzeClipReferences(doc, nodes)`：检查节点/output 是否存在、文件是否存在、是否有更新版本
  - `referencesFromDoc(doc)`：生成 references 映射
  - `upstreamSignature(references, nodes)`：生成上游输出签名
- 新增 `media:exists(path, scope)` IPC：
  - project scope 只查项目
  - global scope 只查全局库
  - 不传 scope 时先项目后全局

## 2. Missing / 新版本展示

- 时间线片段：
  - `is-missing`：半透明 + 虚线边框 +「素材缺失」
  - `has-update`：描边 +「有新版本」
- 剪辑室「画布素材」卡片：右上角「有新版本」徽章。
- `UpstreamWatcher` 挂在画布层：
  - 即使剪辑室未打开，只要 references 里的节点产生新 output，就把对应成片标 `stale`
- 成片导出后写 `upstreamAck`：
  - 同一上游版本不会反复标脏
  - 上游再出新版本时签名变化，再次 stale

## 3. 无输出媒体节点入口

- `CineNodeView` 在「选中 + 没有 output + 非 busy」时显示精简工具栏，仅含「剪辑室」。
- 图片 / 视频 / 音频 / 文本节点在生成前也能创建剪辑室。

## 4. 分组嵌套边界

- `copySelection` 展开选中分组的子节点，复制分组不再丢子节点。
- 删除入口先展开分组子节点：
  - 分组内有剪辑室+成片时，同样弹「保留成片 / 一起删除」
  - 「保留成片」会先把成片从组里脱出（`parentId` 清空、位置转绝对），再删除组，避免被组级联删除
- 复制分组内剪辑室时，子节点与新时间线一起复制；成片不复制。

## 5. 工具栏

按方案文档瘦身：

- 高度 36、按钮 28、字号 12、按钮内边距 `0 5px`、间距 `1px`
- 主操作上限恢复为 6
- 工具栏根据节点在屏幕中的位置自动左 / 中 / 右对齐，避免窗口边缘裁切

实测（视口 1240）：

| 节点 | 工具栏尺寸 | 对齐 | 结果 |
|---|---|---|---|
| 360px 图片 | 471×36 | 居中 | 不换行，底边在节点标题上方，不遮挡 |
| 480px 视频 | 735×36 | 右对齐 | 左 137 / 右 872，完整落在窗口内 |

## 6. 端到端实测

项目：`Slice3.cinelab`，CDP 9224。

| 场景 | 结果 |
|---|---|
| 从素材池双击加入时间线 | clip.media 写入 `nodeId/outputId` |
| 保存后 studio.references | `{ video_mw6kssol_3: '真实素材-01.mp4#1' }` |
| 首次导出 | film ready，upstreamAck 记录 `...:真实素材-01.mp4#1:...` |
| 上游换 `真实素材-02.mp4` | 剪辑室关闭状态下成片立即 `stale` |
| 打开剪辑室 | 素材卡「有新版本」，片段「有新版本」+ `has-update` |
| 重新导出 | 版本 2，upstreamAck 更新到 `真实素材-02.mp4#2` |
| 再次打开剪辑室 | 成片保持 `ready`，不因同一版本反复标脏 |
| 删除来源媒体节点 | 成片 `stale`；打开剪辑室片段显示「素材缺失」+ `is-missing` |
| media:exists | 存在 true、全局不存在 false、项目不存在 false |
| 无输出图片节点 | 选中出现精简工具栏「剪辑室」，点击创建并打开剪辑室 2 |
| 分组内保留成片 | 组和剪辑室删除，成片转 `cine` 视频，outputs 2 保留 |
| 复制分组 | 新组、新剪辑室、新 timelineId、图片子节点复制，成片不复制 |
| 页面 reload | 节点、分组、时间线、成片版本与状态恢复 |

## 7. 已知限制

- `references` 每个节点只记录一个 outputId；同一节点在时间线里使用多个版本时，以最后一次为准。
- 旧时间线片段没有 `media.nodeId`，无法检测上游新版本；只做文件存在性检查。
- `analyzeClipReferences` 片段多时会发起较多 `media:exists` IPC，目前没有批量接口。
- 「有新版本」徽章在重新导出后仍然存在（它表示片段仍引用旧 output）；成片通过 `upstreamAck` 保持 ready。
- 无输出节点创建的剪辑室，在节点生成前素材池为空。
- 宽工具栏按方案允许溢出；在相邻节点密集时可能覆盖邻节点标题（不遮挡自身标题）。
- 多时间线仍未做。
