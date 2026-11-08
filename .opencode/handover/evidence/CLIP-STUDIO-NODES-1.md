# CLIP-STUDIO 节点接线第一刀：studio / film 双节点

日期：2026-11-07
状态：完成
验证：typecheck / 57 测试 / build 通过；CDP 端到端实测

## 1. 数据模型

- `NodeKind` 仍只表示媒体节点：`text / image / video / audio`。
- 新增独立节点类型：
  - `studio`：`timelineId`、`filmNodeId`、`clipCount`、`durationMs`
  - `film`：`studioNodeId`、`filmStatus`、`outputs`（版本栈）、`selectedOutputId`
- `CanvasNode = CineNode | StudioNode | FilmNode | GroupNode`。
- `NODE_META` 增加剪辑室 360×260、成片 480×320；`NODE_KINDS` 仍只含媒体节点。
- `project-schema.ts` 增加 `studioNodeSchema` / `filmNodeSchema`，复用 `outputRefSchema`。

## 2. 时间线文件

- 新增 `src/main/timeline/storage.ts`：
  - `timelines/<timelineId>.json`
  - `timeline:load` / `timeline:save` IPC
  - timelineId 只允许 `[A-Za-z0-9_-]{1,80}`
  - 原子写入
- 项目创建/打开时自动创建 `timelines/`。
- 编辑器加载顺序：文件 → 旧 localStorage 迁移 → 空时间线。
- 保存 400ms 防抖写文件；关闭时补一次保存；切换剪辑室时先保存上一个时间线。

## 3. 节点 UI

- `StudioNodeView`：
  - 标题、状态徽章、`N 个片段 · 时长`、「进入剪辑室」
  - 左侧接收素材连线
  - 右侧派生 handle 不可手动连接、不可见，只用于系统 studio → film 连线
- `FilmNodeView`：
  - 封面帧、分辨率、时长、状态徽章
  - 版本切换 `‹ 2/2 ›`
  - 「剪辑室」「生成成片 / 重新生成 / 取消」
  - 右侧 source handle 可把成片当素材接到其他节点
  - 左侧 target handle 不可手动连接、不可见
- 注册到 React Flow `nodeTypes`。
- 左侧「画布素材」页签只显示连线到当前剪辑室的节点输出，不再展示全画布素材。

## 4. 创建入口

| 入口 | 行为 |
|---|---|
| 画布右键菜单 | 「剪辑室」在点击位置创建空剪辑室并打开 |
| 媒体节点工具栏 | 「剪辑室」在节点右侧 80px 创建、自动连线并打开 |
| `Ctrl+Shift+E` | 有选中的剪辑室就打开；否则打开已有剪辑室；没有则在视口中心创建 |
| 成片节点「剪辑室」 | 打开关联的剪辑室 |

上传同步、多选工具栏、分镜组入口按计划留到第二刀。

## 5. 保存与状态机

- 打开剪辑室加载文件后调用 `syncStudioAfterSave(..., { markStale: false })`：
  - 更新片段数/时长
  - 缺失成片时补建
  - 不把 ready 改成 stale
- 只有真实编辑触发的保存才把 `ready / rendering → stale`。
- 时间线清空：已有成片标记 `empty`，导出禁用。
- 首次有片段：自动创建成片节点，位置在剪辑室右侧 80px，自动连线。
- 成片节点被删除后，下次保存会重新补建。
- 应用重启时，残留的 `rendering` 状态按是否有 outputs 归一为 `ready / pending`。

## 6. 成片与版本栈

- 剪辑室顶部移除「生成成片」，只提示「成片在画布节点生成」。
- 成片节点是唯一导出入口。
- 导出前：
  - 如果剪辑室正打开，使用当前文档并先保存；
  - 否则从时间线文件加载。
- 成功后向 `outputs` 头部插入一条 `OutputRef`：
  - `kind: video`
  - `model: '剪辑室'`
  - 分辨率、时长、fps、hasAudio
- 版本栈上限 20，复用现有节点版本切换交互。
- 导出中可以取消，取消/失败恢复到上一版状态。

## 7. 实测

项目：`P3 Nodes.cinelab`，测试实例 CDP 9222。

| 场景 | 结果 |
|---|---|
| Ctrl+Shift+E 启动 | 自动创建 `剪辑室 1`，剪辑室打开，`timelines/timeline_mw6j4kir_2.json` 生成（978B） |
| 媒体节点工具栏 | 创建 `剪辑室 2`，自动连线 `video → studio`，直接打开 |
| 画布素材页签 | `剪辑室 2` 只显示连线进来的「素材 1」，不显示其他画布节点 |
| 画布右键菜单 | 创建 `剪辑室 3`，位置等于右键 flow 坐标 (1200,700) |
| 时间线保存 | 1 个片段写入 `timeline_mw6j5ivf_5.json`（1489B） |
| 成片自动派生 | 生成 `剪辑室 2 · 成片`，`studio → film` 自动连线；剪辑室摘要 `1 个片段 · 00:06` |
| 首次导出 | 6 秒 1080p，2.55MB，成片状态 `ready`，版本 1 |
| 编辑时间线 | 改成 3 个片段 / 11 秒后，成片状态 `stale`，旧版本保留 |
| 重新生成 | 版本栈变为 2，`2/2`，新文件 3.72MB |
| 版本切换 | 点「更早的版本」后 `1/2`，`selectedOutputId` 指向旧版本 |
| 重新打开剪辑室 | ready 保持 ready，不会误标 stale |
| 关闭剪辑室 | 无修改时保持 ready；有修改时保存并 stale |
| 页面 reload | 节点、连线、片段数/时长、成片状态、2 个版本全部恢复 |

## 8. 已知缺口（第二刀）

- 从剪辑室上传素材时，画布同步创建素材节点、成组、连线。
- 多选工具栏 / 分镜组一键创建剪辑室并按顺序送入素材池。
- 删除剪辑室时选择「保留成片为普通视频 / 一起删除」。
- 复制剪辑室时深拷贝时间线文件；成片不复制。
- 上游素材节点新版本提示、时间线片段 `missing` 标记。
- 无输出媒体节点目前不显示工具栏，因此没有剪辑室入口。
- 工具栏宽度未在 360 / 480 节点上实测。
- 成片节点被手动删除后需要下一次保存才补建。
