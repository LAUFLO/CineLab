# 工作流模板方案

日期：2026-11-25
状态：方案确定，待实施
适用版本：v0.5.x
最后核对：2026-11-25

> 目标：把用户已经跑通的画布流程保存为可复用的工作流，新建项目时从自己的工作流列表里选择。
> 官方不再提供固定模板，只保留「空白项目」。工作流存放在全局资产库的「工作流」目录，用户可以在资产库和项目中心管理。

## 1. 背景

当前新建项目时，项目中心会展示 4 个硬编码模板：

| 模板 ID | 名称 | 实现 |
|---|---|---|
| `blank` | 空白项目 | 空画布 |
| `storyboard` | 分镜脚本 | `project-templates.ts` 硬编码节点和边 |
| `product` | 产品广告 | 同上 |
| `character` | 角色短片 | 同上 |

这些模板只生成画布结构，不预置模型和素材；用户无法保存自己的流程，也无法在新建项目时复用。

画布本身就是节点图（节点 + 连线），具备保存为工作流的数据基础，但存在三个缺口：

1. 节点没有持久化模型和参数（`modelKey`、`params` 是 PromptBar 组件状态）
2. 没有工作流存储、列表、导入导出
3. 没有处理「引用素材」「项目级对象」的机制

## 2. 目标与非目标

### 目标

- 用户可以选中节点或整个画布，保存为工作流
- 工作流保留：节点、连线、提示词、模型、参数、输入模式、风格、分组、位置
- 工作流存全局资产库 `工作流/` 目录，跟随资产库根目录迁移
- 新建项目时展示用户自己的工作流列表，官方固定模板移除
- 资产库可以查看、添加工作流到当前画布
- 项目中心可以在无项目时导入、重命名、删除工作流
- 支持更新已有工作流、导入导出 `.cinelab-workflow.zip`
- Agent / MCP 可以列出、保存、应用工作流
- 导演台文档随工作流打包；拉片和剪辑室节点进入占位，等待用户重新创建
- 结果素材不保存；本地上传素材、生成节点、全局素材缺失时使用占位节点

### 非目标

- **不做自动运行**：工作流只保存结构和配置，用户下次使用时替换素材后手动生成
- 不保存生成结果（图片、视频、音频输出）
- 不打包项目内素材文件（本地素材只在工作流中留下占位）
- 不改变现有项目的存储格式，除节点新增可选字段
- 不做工作流版本管理、协作、云端同步
- 不做只读画布预览（只提供轻量信息弹窗）

## 3. 核心概念

### 工作流

一份工作流是画布子图的快照，包含：

- 节点结构：类型、位置、分组、尺寸
- 节点配置：标题、文本、提示词、模型、参数、输入模式、风格、拉片配置
- 连线：源、目标、类型、角色
- 导演台文档（只打包 `stage`）
- 占位标记：哪些节点需要用户上传素材或重新生成

### 占位节点

不新增节点类型。复用现有 `cine` 节点，在 `data.workflowSlot` 上标记：

```ts
workflowSlot?: 'upload' | 'generate'
```

| 标记 | 含义 | UI |
|---|---|---|
| `upload` | 原本是本地/资产库素材节点 | 虚线框 +「点击上传素材」 |
| `generate` | 原本是生成节点 | 空输出 +「待生成」，PromptBar 可用 |

拉片和剪辑室使用独立的占位状态，见第 7 节。

### 项目级对象

| 对象 | 存储 | 处理 |
|---|---|---|
| 导演台文档 | `stages/<stageId>.json` | 打包进工作流 |
| 时间线 | `timelines/<timelineId>.json` | 不打包，剪辑室节点占位，分配新 ID 懒创建 |
| 拉片结果 | `studies/<studyId>.json` | 不打包，拉片节点占位 |

## 4. 存储：全局资产库目录包

工作流存放在全局资产库的 `工作流/` 目录，和「风格」一样是「目录 + JSON 元数据 + 封面」的目录包：

```
<全局资产库>/工作流/<slug>/
  workflow.json
  thumbnail.svg
  stages/<stageId>.json
```

- 全局资产库默认 `文档/CineLab Assets`，用户可在设置里改根目录
- 工作流跟着资产库根目录迁移，跨项目、跨设备可用
- `工作流/` 加入 `DEFAULT_LIBRARY_FOLDERS`，默认不可重命名/删除
- 目录名用工作流名称清洗后的 slug，重名自动加 `(2)`
- 引用一律使用 `workflow.json` 内的 `id`，不依赖目录路径；重命名目录不会破坏已创建的项目

### 必须与通用资产扫描隔离

资产库通用扫描会把 `工作流/` 下的封面图当成媒体素材，出现在 PromptBar、剪辑室素材池和 Agent 搜索里。必须显式排除：

- `listAssets` / `listAllAssets` 跳过 `工作流/` 子树
- `listTree` 不把 `工作流/<slug>` 子目录作为普通文件夹展示
- 移动素材弹窗的目标目录树隐藏 `工作流/` 子树
- 剪辑室 `MaterialPool` 和 Agent 的 `library_search` 不返回工作流包内文件
- 缩略图使用 `thumbnail.svg`，SVG 不在媒体扩展名集合内；即使如此也要依赖子树排除兜底

### workflow.json

```ts
interface WorkflowPackage {
  version: 1
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  canvas: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
  /** 打包的导演台文档，按原 stageId 索引 */
  stages: Record<string, DirectorStageDoc>
  meta: {
    nodeCount: number
    edgeCount: number
    generationCount: number
    uploadSlotCount: number
    missingGlobalAssets: number
    sizeBytes: number
  }
}
```

版本策略：只接受 `version: 1`。版本过新或过旧时拒绝加载，提示「请升级 CineLab」。

## 5. 节点字段处理

| 类别 | 字段 | 处理 |
|---|---|---|
| 标识 | `id` | 保存原样；实例化时重新分配 |
| 结构 | `type`、`position`、`parentId`、`style` | 保留；位置保存时归一化 |
| 基础 | `data.kind`、`data.title`、`data.text`、`data.templates`、`data.assetOnly`、`data.mediaFrame` | 保留 |
| 生成配置 | `data.prompt`、`data.modelKey`、`data.params`、`data.inputMode`、`data.style` | 保留 |
| 拉片配置 | `data.studyModelKey`、`data.studyOutputs`、`data.studyInterval` | 保留 |
| 占位 | `data.workflowSlot` | 保存时生成，实例化时写入 |
| 运行时 | `status`、`progress`、`error`、`outputUrl`、`outputs`、`selectedOutputId`、`selected`、`dragging`、`measured` | 剥离 |
| 项目内引用 | `refOrder`、`referencePath`、`sourcePath`、`sourceScope`、`sourceName`、`sourceNodeId` | 剥离或转为占位 |
| 拉片结果 | `studyId`、`studyRef`、`studySummary`、`studyAnalyzed`、`studyAnalysisError`、`studyOutputNodeIds` | 剥离，节点进入拉片占位 |
| 剪辑室 | `timelineId`、`clipCount`、`durationMs`、`references`、`filmStatus`、`upstreamAck`、`outputs` | 剥离，节点进入剪辑占位 |
| 导演台 | `stageId`、`activeCameraId`、`objectCount`、`cameraCount`、`shotCount` | 保留 `stageId` 用于映射；实例化时重新分配 |
| 视频操作 | `operation`、`range`、`duration`、`direction`、`modelKey`、`prompt`、`expanded` | 保留 |

### 全局素材

`scope: 'global'` 的引用（`refOrder`、`referencePath` 等）保留路径。实例化时检查全局资产库是否存在该文件：

- 存在：保留引用
- 不存在：节点转 `upload` 占位，并在工作流卡片显示缺失数量

### 位置归一化

React Flow 子节点 `position` 是相对父节点的坐标。保存时只对顶层节点做偏移，子节点保持相对坐标不变；实例化时同样只偏移顶层节点，分组内部结构不变。

## 6. 保存流程

### 入口

| 入口 | 范围 |
|---|---|
| 画布右键菜单 | 有选中节点时「保存选中为工作流」 |
| 多选工具栏 | 「保存为工作流」 |
| 项目菜单 | 「保存当前画布为工作流」 |

### 步骤

1. 收集节点
   - 选中节点（含分组子节点）
   - 未选中时使用整个画布
2. 收集边
   - 两端都在节点集合内的边
   - 外部连线丢弃，保存弹窗提示「将丢弃 N 条外部连接」
3. 补齐必填引用
   - `video-op` 的 `sourceNodeId` 不在集合内时，向上追溯一层源节点，弹窗提示「已包含 N 个源节点」
4. 关联文本节点
   - 扫描 prompt 中的 `@标题`，如果画布上存在同名文本节点但未被选中
   - 弹窗提供「一并包含关联文本节点」勾选项，默认勾选
5. 打包导演台
   - 对每个 `stage` 节点读取 `stages/<stageId>.json`
   - 清除文档内的背景图、glTF 等项目内素材引用
   - 按原 `stageId` 存入 `stages`
6. 处理拉片节点
   - 清空 `studyId`、`studyRef`、`studySummary`、`studyAnalyzed`、`studyAnalysisError`、`studyOutputNodeIds`、`sourcePath`、`sourceScope`、`sourceName`
   - 保留 `studyModelKey`、`studyOutputs`、`studyInterval`
   - 实例化后进入「待重新拉片」占位
7. 处理剪辑室节点
   - 清空 `timelineId`、`clipCount`、`durationMs`、`references`、`filmStatus`、`upstreamAck`、`outputs`
   - 实例化后分配新 `timelineId`，进入「待创建时间线」占位
8. 处理素材引用
   - `scope: project` → 清空，节点标记 `upload`
   - `scope: global` → 保留路径
9. 区分素材节点和生成节点
   - `assetOnly === true` 且来源为本地/资产库 → `upload`
   - 其他生成节点 → `generate`
   - `assetOnly` 且输出来源是生成结果 → `generate`
   - 无法判断时：有 `prompt` / `modelKey` 走 `generate`，否则 `upload`
10. 剥离运行时字段
11. 位置归一化：以选中区域左上角为原点，只偏移顶层节点
12. DAG 校验：Kahn 拓扑排序，有环拒绝并列出环节点
13. 生成缩略图 SVG：按节点位置和连线绘制矩形、标题、连线
14. 计算统计：节点数、边数、生成节点数、上传占位数、缺失全局素材数、体积
15. 写入 `工作流/<slug>/workflow.json`，刷新列表

### 名称、重名与更新

- 名称必填，最多 60 字符
- 新建重名自动加 `(2)`
- 保存弹窗可选择「覆盖已有工作流」，重新计算统计、缩略图和 stage 文档，替换整个目录
- 保存成功后 toast 提供「用此工作流新建项目」按钮

### 限制

- 最多 500 个节点
- 工作流包最多 200MB
- 超过上限在保存前拒绝，并提示具体数字

## 7. 资产库与项目中心集成

### 资产库

- `工作流/` 是默认一级目录，加入 `DEFAULT_LIBRARY_FOLDERS`
- 左侧目录树固定项，与「风格」「提示词」同级
- 工作流视图使用专用 `WorkflowGrid`，仿 `StyleFolderGrid`，不套通用 `AssetGrid`
- 卡片显示：缩略图、名称、节点数、生成节点数、上传占位数、更新时间、缺失全局素材角标
- 搜索：按名称搜索，按更新时间倒序
- 卡片交互与素材一致：单击选中，悬浮「+」添加到当前画布；不新增双击和拖拽
- 卡片悬浮菜单：重命名、删除、导出、用此工作流新建项目、打开所在文件夹
- 「添加到当前画布」：追加到视口中心，自动选中新节点并 `fitView`；节点标题保留原名，允许同名
- 添加时复制 `stages/*` 到当前项目 `stages/`，重新分配 `stageId`
- 当前项目已有同名 stage 不影响，stageId 全局重新分配
- 只读预览：点击卡片信息区打开轻量弹窗，放大缩略图 + 统计 + 节点列表，不渲染画布

### 项目中心（无项目）

- 模板弹窗读取 `工作流/` 列表，与资产库同一数据源
- 空状态：「还没有保存的工作流。在画布中选中节点，右键「保存为工作流」。」
- 模板弹窗内提供「管理工作流」：导入、重命名、删除
- 点击工作流卡片：新建项目并实例化
- 提供「导入工作流…」入口

### 设置页

不新增「工作流」分区。管理统一在资产库和项目中心模板弹窗。

## 8. 实例化流程

### 新建项目

1. 主进程读取 `工作流/<slug>/workflow.json`
2. 复制 `stages/*`，重新分配 `stageId`
3. 检查全局素材是否存在
4. 重新分配节点 ID：`node_<stamp>_<index>`
5. 重映射 `parentId`、边、`study`/`video-op` 的内部引用
6. 写入节点 `workflowSlot`
7. 更新 `stageId` 引用
8. 为 `studio` 节点分配新 `timelineId`
9. 用 `canvasDataSchema` 校验
10. 写入新项目画布

### 添加到当前画布

- 追加到视口中心，不覆盖现有节点
- 重新分配 ID，允许标题重名
- 复制 stage 文档并重新分配 `stageId`
- 为 studio 节点分配新 `timelineId`
- 选中新节点并 `fitView`

## 9. 占位节点 UI

### `upload`

- 显示：虚线边框、上传图标、「点击上传素材」
- 点击：按 `kind` 打开图片/视频/音频选择，或从资产库选择
- 上传后：把 `OutputRef` 写入当前节点，清除 `workflowSlot`，下游自动可用
- 不新建节点

### `generate`

- 显示：空输出 +「待生成」
- PromptBar 正常打开，模型/参数/提示词已恢复
- 生成后正常写回输出

### 拉片占位

- 显示：「待重新拉片」
- 重建时沿连线找到唯一上游视频节点，读取输出写入 `sourcePath/sourceScope/sourceName`，再调用 `runAuto`
- 没有唯一上游时弹窗让用户选择本地上传或资产库视频
- 保留 `studyModelKey`、`studyOutputs`、`studyInterval`

### 剪辑室占位

- 显示：「待创建时间线」
- 节点已分配新 `timelineId`，点击直接打开剪辑室，由 `StudioWindow` 懒创建空时间线
- 上游素材节点是 `upload` 占位，用户上传后可拖入时间线

### 视频操作节点

- 保留 `operation`、`range`、`duration`、`direction`
- 保存时已追溯源节点；实例化后源节点是 `upload` 占位
- 源输出为空时按钮按现有逻辑提示「节点还没有可用输出」

## 10. 节点配置持久化

### 背景

PromptBar 的 `modelKey`、`paramValues`、`inputMode` 是组件状态（`PromptBar.tsx:178-181`）。只有 `prompt`、`inputMode`、`style` 写回节点，模型和参数不持久化。

### 以前的行为

| 场景 | 行为 |
|---|---|
| 切换节点 | 模型和参数沿用上一个节点的选择，只有 prompt/inputMode/style 恢复 |
| 关闭应用 / 重开项目 | 模型回到默认，参数回到默认 |
| 生成 | 使用 PromptBar 内存里的模型和参数 |
| 复制节点 | 不带模型和参数 |
| 保存工作流 | 无法知道节点原本的模型和参数 |

### 修改后

| 场景 | 行为 |
|---|---|
| 节点数据 | 增加 `modelKey?: string`、`params?: Record<string, unknown>` |
| 切换节点 | 恢复该节点的模型和参数；缺失时回退默认 |
| 修改模型/参数 | 防抖写回当前节点 `data` |
| 保存/加载 | 随项目持久化，`cineNodeSchema.data` 同步加字段 |
| 复制/粘贴 | 随节点复制 |
| 工作流 | 完整保留 |
| 生成 | 使用节点 `data` 的配置 |
| 旧项目 | 字段缺失，回退默认；只在用户修改 PromptBar 时写入，不在打开项目时自动补 |

### 跨机器模型匹配

`modelKey` 是 `providerId/modelId`。跨机器复制 `models.json` 时 provider id 会保留；重新配置供应商时会生成新 UUID。

实例化时按三级匹配：

1. `modelKey` 精确命中
2. 按 `remoteModel id + capability` 找唯一候选
3. 仍失败时节点标记「模型不可用」，用户手动重选

provider name 不唯一，不参与自动匹配，只用于提示。

## 11. 官方模板移除

- `PROJECT_TEMPLATES` 只保留 `blank`
- 删除 `storyboard`、`product`、`character` 的构造函数和类型引用
- `ProjectTemplateId` 从固定 union 改为 `string`
- `createProject(name, dir, template)` 支持工作流 ID
- 旧 Agent 调用 `template: 'storyboard'` 等映射到 `blank`，API 返回 warnings，UI toast「旧模板已移除，已使用空白项目」
- 现有项目不受影响

## 12. 管理与导入导出

### 重命名 / 删除

- 重命名：更新目录名、`workflow.json` 的 `name` 和 `updatedAt`；不改 `id`
- 删除：二次确认，递归删除目录；已用该工作流创建的项目不受影响
- 通用资产 API 的 `deleteFolder` 只允许空目录，工作流必须走专用删除

### 导入导出

- 导出：打包 `工作流/<slug>/` 为 `.cinelab-workflow.zip`，复用 `zipDirectory`
- 导入：复用 `extractZipSafely`，先解压到临时目录，校验 `workflow.json` 和 stage 文档，再移入 `工作流/`
- 安全边界：
  - 拒绝绝对路径、`..`、符号链接
  - 超过 200MB 拒绝
  - `workflow.json` 版本不支持时拒绝
  - stage 文档校验失败时跳过该文档，节点转「待重新创建场景」占位，其余正常导入
- 导入重名：目录名自动加 `(2)`，`id` 冲突时生成新 ID

## 13. Agent / MCP

新增工具：

| 工具 | 作用 |
|---|---|
| `workflow_list` | 列出用户工作流及统计 |
| `workflow_save` | 保存选中节点或整个画布为工作流 |
| `workflow_apply` | 把工作流应用到当前画布 |

同步更新：

- `docs/agent-capabilities.md`
- `agent-coverage` 工具清单
- `docs/mcp.md` 工具数
- `docs/code-map/06-agent.md`

## 14. 改动清单

| 模块 | 文件 | 改动 |
|---|---|---|
| 共享 schema | `src/shared/workflow-schema.ts`（新建） | 工作流类型、zod 校验、字段规则 |
| 共享 schema | `src/shared/project-schema.ts` | `cineNodeSchema.data` 增加 `modelKey`、`params`、`workflowSlot` |
| 共享类型 | `src/shared/canvas-schema.ts` | `CineNodeData` 增加对应字段 |
| 共享模板 | `src/shared/project-templates.ts` | 移除 3 个官方模板，保留 blank |
| 共享资产库 | `src/shared/library-schema.ts` | `DEFAULT_LIBRARY_FOLDERS` 增加 `工作流` |
| 主进程资产库 | `src/main/library/workflows.ts`（新建） | 工作流目录包列表、保存、删除、重命名、读取 |
| 主进程资产库 | `src/main/library/store.ts` | `工作流/` 子树从媒体扫描、目录树、移动目标中排除 |
| 主进程工作流 | `src/main/workflows/build.ts`（新建） | 从画布提取、清理、DAG 校验 |
| 主进程工作流 | `src/main/workflows/instantiate.ts`（新建） | 实例化、ID 重映射、stage 复制、全局素材检查 |
| 主进程工作流 | `src/main/workflows/thumbnail.ts`（新建） | 生成 SVG 缩略图 |
| 主进程 IPC | `src/main/ipc/workflow.ts`（新建） | `workflow:*`、导入导出 IPC |
| 主进程 IPC | `src/main/ipc/project.ts` | `project:create` 支持工作流 ID |
| 主进程 | `src/main/project/manager.ts` | `createProject` 接受工作流 |
| IPC 契约 | `src/shared/ipc-contract.ts` | `WorkflowApi` |
| preload | `src/preload/index.ts` | 暴露 `workflow.*` |
| 节点配置 | `src/renderer/src/canvas/PromptBar.tsx` | 读写节点 `modelKey` / `params` |
| 节点配置 | `src/renderer/src/stores/generation.ts` | 生成请求读取节点配置 |
| 占位 UI | `src/renderer/src/canvas/nodes/CineNodeView.tsx` | `workflowSlot` 占位与上传入口 |
| 占位 UI | `src/renderer/src/canvas/Canvas.tsx` | 给已有节点附加素材 |
| 占位 UI | `src/renderer/src/stores/canvas/slices/assets.ts` | `attachAssetToNode` |
| 保存入口 | `src/renderer/src/canvas/CanvasContextMenu.tsx` | 保存选中为工作流 |
| 保存入口 | `src/renderer/src/canvas/MultiSelectBar.tsx` | 保存选中为工作流 |
| 保存入口 | `src/renderer/src/canvas/TopBar.tsx` | 保存当前画布为工作流 |
| 保存弹窗 | `src/renderer/src/canvas/WorkflowSaveDialog.tsx`（新建） | 名称、描述、统计预览、覆盖、关联文本节点 |
| 资产库 UI | `src/renderer/src/panels/library/LibraryWindow.tsx` | `工作流` 特殊视图 |
| 资产库 UI | `src/renderer/src/panels/library/WorkflowGrid.tsx`（新建） | 工作流卡片、悬浮菜单、预览弹窗 |
| 资产库 store | `src/renderer/src/stores/library.ts` | `loadWorkflows`、列表状态、刷新 |
| 项目中心 | `src/renderer/src/panels/ProjectCenter.tsx` | 用户工作流列表、管理工作流、导入 |
| Agent | `src/main/agent/tools/workflow.ts`（新建） | 三个工具 |
| 文档 | `docs/code-map/02-generation.md`、`07-storage-ipc.md`、`08-capabilities.md`、`11-feature-index.md` | 同步能力与 IPC |
| 文档 | `docs/workflow-plan.md`（本文件） | 方案 |

## 15. 风险与处理

| 风险 | 处理 |
|---|---|
| 工作流引用项目内素材，换项目失效 | 不打包，转为 `upload` 占位 |
| 全局素材被删除后工作流失效 | 实例化时检查，缺失转占位并统计 |
| 工作流包被通用资产扫描当素材 | `工作流/` 子树显式排除 |
| 节点模型/参数未持久化导致工作流空壳 | 先补 `modelKey` / `params` 持久化 |
| 导演台文档引用素材 | 打包时清除背景/glTF 引用，实例化后占位 |
| 拉片 `runAuto` 只读自身 `sourcePath` | 重建时沿连线写入上游视频输出，无唯一上游则让用户选 |
| 拉片/剪辑室占位增加重复劳动 | 保留重建配置和上游连线，提供一键重建入口 |
| 工作流文件过大 | 不打包素材、不打包时间线；500 节点 / 200MB 上限 |
| 循环连接 | 保存前 Kahn 校验，拒绝并列出环节点 |
| video-op 悬空源节点 | 保存时向上追溯一层源节点 |
| 旧模板 ID 兼容 | 映射 `blank` 并返回 warnings |
| 工作流 ID 冲突 | ID 用 UUID，导入时冲突则生成新 ID |
| 导入 zip 目录穿越 | 解压到临时目录，拒绝绝对路径、`..`、符号链接 |
| stage 文档版本不兼容 | 跳过该文档，节点转占位，其余正常导入 |
| 工作流版本过新/过旧 | 拒绝加载，提示升级 |

## 16. 验收

1. 「文本 → 图片 → 视频」工作流保存后，新建项目选择它，节点、连线、模型、参数、提示词、风格完整还原
2. 本地上传素材节点变为 `upload` 占位，上传后写入当前节点，下游可用
3. 生成节点变为 `generate` 占位，保留配置，PromptBar 可用
4. 导演台节点实例化后场景文档可用，背景素材占位
5. 拉片节点显示「待重新拉片」，可沿连线找到上游视频并重建
6. 剪辑室节点显示「待创建时间线」，点击打开剪辑室并懒创建空时间线
7. 全局素材存在时保留引用；删除后实例化转为 `upload` 占位
8. 资产库 `工作流/` 下的目录包不出现在素材列表、剪辑室素材池和 Agent 素材搜索中
9. 工作流可重命名、删除、更新、导出 zip、导入后新建项目可用
10. 官方模板列表只剩空白项目；旧 `template: 'storyboard'` 不报错并提示
11. `typecheck`、`check:ui`、`check:docs`、全量测试通过

## 17. 实施顺序

同一版本内按以下顺序开发：

1. 节点 `modelKey` / `params` 持久化 + schema + 测试
2. 工作流 schema、资产库目录包模块、保存/实例化
3. 占位节点 UI + 上传写入当前节点 + 拉片/剪辑室重建入口
4. 新建项目列表 + 官方模板移除 + 项目中心管理
5. 保存入口 + 保存弹窗 + 缩略图
6. 资产库工作流视图 + 导入导出
7. Agent / MCP 工具
8. 文档、代码地图、测试、CI

## 18. 已确认决策

| 决策 | 结论 |
|---|---|
| 是否自动运行工作流 | 不做，用户替换素材后手动生成 |
| 占位实现 | 现有节点 + `data.workflowSlot` |
| 本地上传素材 | `upload` 占位，点击上传写入当前节点 |
| 生成节点 | `generate` 占位，保留配置 |
| 导演台 | 打包 `stage.json` |
| 拉片 | 占位，保留重建配置，沿连线找上游视频 |
| 剪辑室 | 占位，分配新 `timelineId`，打开时懒创建 |
| 项目内素材 | 不打包，引用清空 |
| 全局素材 | 保留引用，缺失时转占位 |
| 官方模板 | 移除，只保留空白项目 |
| 工作流存储 | 全局资产库 `工作流/` 目录包 |
| 资产库交互 | 单击选中，悬浮「+」添加到当前画布 |
| 资产库扫描 | `工作流/` 子树对媒体扫描隐身 |
| 管理入口 | 资产库 + 项目中心模板弹窗，设置页不新增分区 |
| 无项目入口 | 项目中心模板弹窗内管理工作流 |
| 跨机器模型匹配 | `modelKey` → `remoteModel + capability` → 提示重选 |
| video-op 源节点 | 保存时向上追溯一层 |
| `@` / `#` 引用 | 保留动态；弹窗默认勾选「包含关联文本节点」 |
| 导入导出 | `.cinelab-workflow.zip`，严格路径与 schema 校验 |
| 工作流版本 | 只接受 version 1 |
| 更新工作流 | 支持覆盖保存 |
| 重名 | 新建自动加 `(2)` |
| 节点标题重名 | 添加到画布时保留原名 |
| 只读预览 | 轻量信息弹窗，不渲染画布 |
| 保存后 | 提供「用此工作流新建项目」 |
