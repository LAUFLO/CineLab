# CineBot 能力扩展方案

日期：2026-11-10
状态：方案待实施
关联：`docs/agent-architecture-plan.md`、`docs/agent-full-scope.md`、`docs/agent-plan.md`
分支：`feat/agent-runtime`（PR #2）

## 1. 结论

可以在当前分支继续优化，PR 已打开且 CI 通过，后续提交会自动更新 PR。

但不建议把所有缺口一次性塞进当前 PR：

- **当前 PR #2**：先合入已经稳定的 AgentRuntime、CineBot UI、剪辑高级工具、技能文件、main 同步。
- **后续 PR**：节点操作桥、拉片 Agent、能力注册表重构。
- **Agnes 视频 503**：不阻塞合并，合并后补测。

推荐节奏：

```text
PR #2 保持可合并
  → 当前分支只做小范围、低风险补齐（边删除、文本、画幅、拉片最小工具集）
  → 推送 PR #2，CI 通过后合并
  → 新分支 feat/agent-capabilities 做通用节点操作桥和能力注册表
```

如果希望所有缺口都在当前分支完成，也可以继续提交，但 PR 体积会明显变大，review 和回滚成本更高。

## 2. 当前 main 新功能的 CineBot 覆盖情况

图例：

- ✅ 已可被 CineBot 调用
- 🟡 部分可调用 / 只能间接完成
- ❌ 目前不能调用
- ⚪ 纯 UI/设置，不需要 Agent 调用

### 2.1 画布

| 功能 | 状态 | 说明 |
|---|---|---|
| 创建/移动/连接/删除节点 | ✅ | `canvas_add_node`、`canvas_move_node`、`canvas_connect`、`canvas_delete_node` |
| 修改标题 | ✅ | `canvas_update_title` |
| 打组/解组 | ✅ | `canvas_group`、`canvas_ungroup` |
| 读取全部节点和输出类型 | ✅ | `canvas_get` |
| 删除连线 | ❌ | UI 有 EdgeContextMenu，Agent 没有 `canvas_remove_edge` |
| 修改文本正文 / Markdown | ❌ | 只能改标题，不能改 `data.text` |
| 画布右键菜单 | ⚪ | 纯 UI |
| 上传/资产导入 | 🟡 | 用户可用 CineBot 上传按钮；模型没有通用导入工具 |
| 画布参考/引用 | ✅ | `refNodeIds`、`libraryRefs`、附件 |

### 2.2 节点工具栏操作

当前 `node-operations.ts` 已定义 29 个操作，但 **CineBot 一个都不能直接调用**。

| 类别 | 操作 | 状态 |
|---|---|---|
| 切分 | 宫格切分 | ❌ |
| 裁剪 | 裁剪、画面裁切 | ❌ |
| 视频 | 片段截取、分离音视频、抽帧、逐帧拉片 | ❌ |
| 生成 | 九宫格、角色三视图、画面推演、多角度、720 全景、扩图 | ❌ |
| 图像编辑 | 抠图、重绘、擦除、元素编辑、图层分离、去字幕 | ❌ |
| 视频编辑 | 片段重拍、元素替换、主体消除、智能抠像、智能续写 | ❌ |
| 本地处理 | 深度动作捕捉 | ❌ |
| 音频节点 | 裁剪、变速 | ❌（时间线片段可裁剪/变速，但画布音频节点资产操作不行） |

这是当前最大的能力缺口。UI 已经有统一的操作定义，但执行逻辑仍绑在 `NodeToolbar.tsx`。

### 2.3 剪辑室

| 功能 | 状态 | 说明 |
|---|---|---|
| 读取/选择/移动/裁剪/切分/删除片段 | ✅ | timeline 工具 |
| 速度、音量、静音、淡入淡出、透明度 | ✅ | `timeline_update_clip` |
| 轨道显示/静音/锁定 | ✅ | `timeline_set_track` |
| 标记 | ✅ | `timeline_add_marker` |
| 自动字幕 | ✅ | `timeline_auto_subtitles` |
| 删静音 | ✅ | `timeline_remove_silence` |
| 转场 | ✅ | `timeline_set_transition` |
| 导出成片 | ✅ | `timeline_export`，写回 studio 节点 |
| 检查器分页 | ⚪ | 纯 UI |
| 画幅/分辨率设置 | ❌ | UI 有比例按钮，Agent 没有 `timeline_set_video` |
| 按镜头切分 | ❌ | UI 有，Agent 没有 `timeline_split_by_shots` |
| 节拍标记 / 节拍切分 | ❌ | UI 有，Agent 没有 |
| 导入字幕 | ❌ | 只有 UI |
| 音频清理/响度 | ❌ | 导出时生效，Agent 不能单独设置 |

### 2.4 导演台

| 功能 | 状态 | 说明 |
|---|---|---|
| 读取场景/能力 | ✅ | `stage_get`、`stage_capabilities` |
| 添加/移动对象 | ✅ | `stage_add_object`、`stage_transform_object` |
| 添加/切换机位 | ✅ | `stage_add_camera`、`stage_set_active_camera` |
| 删除对象 | ✅ | `stage_remove_object` |
| 机位变换 | ❌ | 只能添加和切换，不能调整机位位置/朝向 |
| 镜头/运镜列表 | ❌ | 不能增删改 shots |
| 白模预演导出 | ❌ | UI 有，Agent 没有 `stage_export_preview` |
| 灯光/背景/环境 | ❌ | 当前工具未覆盖 |

### 2.5 拉片室

| 功能 | 状态 | 说明 |
|---|---|---|
| 读取拉片数据 | ❌ | 没有 film 工具 |
| 抽帧/镜头检测/自动拉片 | ❌ | 没有 film 工具 |
| 修改段落/结构/情绪曲线 | ❌ | 没有 film 工具 |
| 导出 Markdown / 分析包 / Bundle | ❌ | 没有 film 工具 |
| 导入分析 | ❌ | 没有 film 工具 |

`AgentProfileId` 已定义 `film`，但没有 `FILM_TOOLS`，Agent 面板也不会切换 film profile。

### 2.6 技能 / 项目 / 设置

| 功能 | 状态 | 说明 |
|---|---|---|
| 技能列表/读取 | ✅ | `skill_list`、`skill_read` |
| 技能启用/禁用/覆盖 | ⚪ | 设置 UI；不建议模型自动改 |
| 技能文件上传/删除 | ⚪ | 设置 UI；用户操作 |
| 资产库搜索 | ✅ | `library_search` |
| 供应商/模型配置 | ⚪ | 设置 UI，不需要 Agent 操作 |
| 主题/快捷键/更新 | ⚪ | 纯设置 |

## 3. 目标架构：能力注册表 + 统一执行器

### 3.1 核心原则

1. **UI 和 Agent 调同一个执行器**：不允许 UI 一套逻辑、Agent 一套逻辑。
2. **所有写操作走命令层**：`CanvasCommand` / `TimelineCommand` / `StageCommand` / `FilmCommand`，天然获得回合撤销。
3. **能力用描述符注册**：工具定义、参数校验、权限、确认、执行器、结果摘要放在同一个模块。
4. **模型不直接操作 store**：工具只调用能力执行器，不直接 `set()`。
5. **新功能必须声明是否 Agent 可调用**：UI-only 功能显式标记 `agentExposed: false`，避免遗漏。

### 3.2 目录建议

```text
src/main/agent/capabilities/
  registry.ts          // 聚合、按 profile/mode 过滤
  types.ts             // AgentCapability
  canvas.ts            // 画布能力
  canvas-node-ops.ts   // 节点工具栏操作
  timeline.ts          // 时间线能力
  stage.ts             // 导演台能力
  film.ts              // 拉片能力
  library.ts           // 资产库能力
  project.ts           // 项目能力（可选）
```

`tools.ts` 只保留兼容导出，具体工具从 `capabilities/*` 聚合。

### 3.3 AgentCapability 契约

```ts
export interface AgentCapability {
  id: string
  toolName: string
  description: string
  profiles: AgentProfileId[]
  scope: AgentToolScope
  readOnly: boolean
  modes: AgentPermissionMode[]
  parameters: JSONSchema
  replay: 'safe' | 'unsafe'
  requiresConfirm?: boolean | ((args: Record<string, unknown>) => string | null)
  validate?: (args: Record<string, unknown>, scope: AgentScope) => void
  execute: (args: Record<string, unknown>, scope: AgentScope, turnId: string) => Promise<ToolResult>
  summary?: (args: Record<string, unknown>) => string
}
```

`registry.ts` 负责：

- 聚合能力。
- 按 profile / 权限模式过滤。
- 生成模型工具 schema。
- 统一参数校验、确认原因、只读检查。
- 统一错误码。

### 3.4 节点操作桥（最高优先级）

当前 `NodeToolbar.tsx` 把 29 个操作绑在组件里。建议抽出：

```text
src/renderer/src/canvas/nodes/node-operation-runner.ts
```

导出：

```ts
export interface NodeOperationRequest {
  nodeId: string
  operationId: string
  itemId?: string
  params?: Record<string, unknown>
}

export async function executeNodeOperation(
  request: NodeOperationRequest
): Promise<NodeOperationResult>
```

`NodeToolbar` 和 Agent 的 `canvas_node_operation` 工具都调用它。

Agent 工具设计：

- `canvas_node_operations`：读取节点可用操作（id、label、菜单项、是否需要模型/组件、是否已实现）。
- `canvas_node_operation`：执行一个操作，参数包括 `nodeId`、`operationId`、`itemId`、`params`。
- `canvas_node_operations` 只读，`canvas_node_operation` 写，破坏性/覆盖操作要求确认。

这样新增一个节点操作时：

1. 在 `node-operations.ts` 增加定义。
2. 在 `node-operation-runner.ts` 增加执行分支。
3. Agent 自动获得 `canvas_node_operations` 列表和 `canvas_node_operation` 调用能力，不需要新增一个工具。

### 3.5 能力发现

新增只读工具：

```text
capability_catalog
```

返回当前空间/节点/片段可用的能力：

```json
{
  "space": "canvas",
  "selectedNode": {
    "id": "node-a",
    "kind": "image",
    "operations": ["crop", "grid-split", "film-study", "panorama"]
  },
  "tools": [
    { "name": "canvas_node_operation", "readOnly": false }
  ]
}
```

同时给 `canvas_get` / `timeline_get` 增加：

- 节点：`availableOperations`
- 片段：`availableTimelineActions`
- 当前空间：`capabilitiesVersion`

模型不需要一次性记住所有工具；先查能力，再调用。

### 3.6 工具数量控制

节点操作合并成一个工具后，工具总数仍然可控。后续如果超过 50 个工具：

- 按 profile/空间分组暴露。
- 增加 `capability_search`，让模型按关键词查找工具。
- 系统提示只保留策略，不列全部工具。

## 4. 后续功能接入清单

以后新增任何功能，按这个清单走：

### 必须做

1. **定义领域命令/操作**
   - 画布：`CanvasCommand`
   - 时间线：`TimelineCommand`
   - 导演台：`StageCommand`
   - 拉片：新增 `FilmCommand`
2. **抽出共享执行器**
   - UI 事件和 Agent 工具都调用同一个函数。
3. **注册 Agent 能力**
   - 加 `AgentCapability` 描述符。
   - 声明 profile、scope、权限模式、是否只读、确认规则。
4. **参数校验**
   - 主进程校验 ID、路径、范围、数量。
   - 渲染进程校验节点/片段存在与类型。
5. **回合撤销**
   - 写操作必须带 `turnId`，一轮 Agent 只压一条历史。
6. **测试**
   - 纯函数/命令层单测。
   - 工具参数校验测试。
   - 隔离实例 Agent smoke test。
7. **能力发现**
   - 在 `capability_catalog` / `canvas_get` / `timeline_get` 中暴露可用操作。
8. **文档**
   - 更新 `docs/agent-architecture-plan.md` 工具表。
   - 在 `docs/agent-capabilities.md` 记录能力 id 和状态。

### 明确不需要 Agent 调用

以下功能标记 `agentExposed: false`，不注册工具：

- 纯布局/主题/快捷键/更新设置。
- 需要用户手动确认的账号/Key 配置。
- 破坏性极强的项目级操作（删除项目、恢复快照）默认不开放给模型。

## 5. 分阶段实施计划

### Phase 1（当前分支可做，小范围补齐）

目标：先补齐 main 新功能里低风险、收益高的缺口。

- `canvas_remove_edge`：删除连线。
- `canvas_update_text`：修改文本节点正文。
- `timeline_set_video`：画幅/分辨率/帧率/背景。
- `timeline_split_by_shots`：按镜头切分。
- `timeline_beat_markers` / `timeline_beat_split`：节拍标记/切分。
- `stage_transform_camera`：机位位置/朝向。
- `stage_export_preview`：白模预演导出。
- `film_study_get` / `film_study_auto` / `film_study_export`：拉片最小工具集。

这些改动相对独立，可以继续提交到当前 PR。

### Phase 2（建议合并 PR #2 后新分支）

目标：节点操作桥 + 能力注册表。

- 抽出 `node-operation-runner.ts`。
- 新增 `canvas_node_operations` / `canvas_node_operation`。
- 新增 `capability_catalog`。
- 把现有 `CANVAS_TOOLS` / `TIMELINE_TOOLS` / `STAGE_TOOLS` 迁入 capabilities 目录。
- 保持兼容导出，避免一次性大改。

### Phase 3（后续）

- 拉片完整 Agent：读取、自动拉片、段落编辑、导出、导入。
- 导演台完整 Agent：镜头/运镜、灯光/背景、预览。
- 能力搜索与动态工具暴露。
- 真实 tokenizer / 动态上下文预算。
- Agnes 视频补测。

## 6. 合并策略建议

### 推荐

1. 当前 PR #2 保持现状，CI 通过。
2. 只把 Phase 1 中**低风险、小范围**的能力补进当前分支。
3. 推送后 CI 重跑，合并 PR #2。
4. Phase 2/3 在新分支 `feat/agent-capabilities` 做，单独 PR。

原因：

- PR #2 已经包含 33 个提交和一次 main 合并，继续加架构重构会让 review 过重。
- 节点操作桥和能力注册表是结构性改动，单独 PR 更容易回滚。
- Phase 1 的小工具可以复用现有命令层，风险低。

### 如果希望全部在当前分支完成

也可以，但建议至少拆成两个 PR 逻辑：

- PR #2：已完成的 Agent/CineBot/技能/剪辑。
- PR #3：能力注册表 + 节点操作桥 + 拉片/导演台扩展。

不要把所有改动都压进 PR #2。

## 7. 验收标准

Phase 1：

- 画布连线可被 CineBot 删除。
- 文本节点正文可被 CineBot 修改。
- 时间线画幅、镜头切分、节拍工具可被 CineBot 调用。
- 导演台机位变换/预览导出可被 CineBot 调用。
- 拉片最小读取/自动/导出链路可被 CineBot 调用。
- 每个工具都有参数校验、确认规则和回合撤销。

Phase 2：

- 29 个节点操作中已实现的都能通过 `canvas_node_operations` 被发现。
- 已实现操作能通过 `canvas_node_operation` 执行。
- UI 和 Agent 共用同一个 runner。
- 新增一个节点操作只需改 operation 定义 + runner，不需要新增 Agent 工具。

Phase 3：

- 拉片/导演台能力完整覆盖。
- 能力目录可按空间/节点返回。
- 新功能接入清单固化到文档和测试模板。
