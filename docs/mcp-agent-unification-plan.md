# MCP 与 CineBot 能力统一方案

日期：2026-11-24
状态：现行
适用版本：v0.4.6
最后核对：2026-11-24

> 目标：让「新增或修改一个功能」只需要在 CineBot 的工具清单登记一次，MCP 自动获得同名工具，不再手工维护第二套声明。
> 同时让 MCP 不依赖用户先在画布上选中节点。

## 1. 背景

CineLab 现在有两个 AI 入口：应用内 CineBot 和外部 MCP。两者共用执行器，但不共用声明：

| 层 | CineBot | MCP | 是否共用 |
|---|---|---|---|
| 能力声明 | `AGENT_TOOLS` 70 个，JSON Schema | 61 个手写 zod（`tools.ts` 3 + `app-tools.ts` 10 + `write-tools.ts` 48） | 否 |
| 执行 | `main-tools` + 4 个 bridge | `commandBridge` → `executeAgentTool` | 是 |
| 确认 | `toolConfirmationReason` | 每个工具手写摘要 | 否 |
| 校验 | `assertToolAllowed` | zod 预校验 + 同一套 `assertToolAllowed` | 部分 |
| 文档 | `docs/agent-capabilities.md`，`check:docs` 强制 | `docs/mcp.md` 手写表格，无校验 | 否 |

由此产生三个问题：

1. 新增功能要手工登记 5–10 处，漏一处就出现「CineBot 有、MCP 没有」；
2. 修改工具参数后，两套 schema 静默漂移，只有运行时才暴露；
3. MCP 的写工具依赖 `scope.selectedNodeIds`。用户使用 MCP 时通常不会去点画布节点，导致 `canvas_update_title`、`stage_*` 等工具实际不可用。

## 2. 结论

1. **命名统一**：MCP 工具名改为与 `AGENT_TOOLS` 一致，不保留旧名 alias；`docs/mcp.md` 给迁移表。
2. **声明投影**：MCP 不再手写同名工具，改为遍历 `AGENT_TOOLS` 自动注册；只保留少量 MCP 专属工具。
3. **独立 scope**：`AgentScope` 增加 `allowAnyNode`，MCP 调用时跳过「必须选中节点」的限制；写操作仍逐次确认，只读模式仍拦截。
4. **文档自动生成**：`docs/mcp.md` 的工具表由脚本从 catalog 生成，`check:docs` 校验一致。
5. **命令注册表（阶段 3）**：一次性把 70 个工具迁进按空间拆分的注册表，`AGENT_TOOLS` 和 MCP catalog 都由注册表投影；同步 CRUD 用命令，异步流程用 handler 白名单。
6. **覆盖率校验（阶段 4）**：`check:agent-coverage` 扫描命令类型、handler 白名单与 bridge 残留，未登记且未豁免的功能直接失败。

## 3. 现状数据

| 分类 | 数量 | 说明 |
|---|---:|---|
| CineBot 工具 | 70 | `src/main/agent/tools/*.ts` |
| MCP 工具 | 61 | 只读 17 + 写 44 |
| 同名可直接复用 | 45 | 只读 11 + 写 34 |
| 语义相同但改名/拆分 | 9 | `node_create` ↔ `canvas_add_node`、`node_update` 拆成标题/文本、`generation_start` ↔ `generation_propose`、`model_list` ↔ `generation_catalog` |
| MCP 专属 | 7 | `local_adapter_*`(3)、`project_*`(2)、`timeline_open`、`stage_open` |
| CineBot 专属 | 25 | 细粒度导演台写操作、节拍/去静音/选片段、改名项、生成提案、`stage_capabilities` |

## 4. 目标与非目标

### 目标

- 新增一个 CineBot 工具时，MCP 自动出现同名工具，不需要改 MCP 代码。
- 修改工具参数时，两边只保留一份 JSON Schema。
- MCP 在用户没有选中任何节点、没有打开剪辑室/导演台时，仍能操作画布、导演台和拉片。
- 工具清单、确认规则、只读标记在两个入口保持一致。
- 阶段 3 之后，新功能默认通过命令注册表登记，工具、MCP 清单和文档自动生成。
- 阶段 4 之后，新增功能漏登记会在 `check:agent-coverage` 暴露，而不是等用户发现。

### 非目标

- 不提供「免确认」模式。外部 Agent 无人值守修改项目的风险仍然过高。
- 不做运行时万能命令工具（`app_command({ command, args })`）。参数校验弱、安全边界模糊，与逐次确认的设计冲突。阶段 3 的命令注册表仍然是「一个命令一个工具」，只是工具由注册表生成。
- 不把纯 UI 功能自动变成工具。是否开放给 Agent 仍需人工判断；判断结果要写进注册表或豁免清单。
- 不改变 CineBot 的 70 个工具和 profile 过滤规则。
- 不承诺「从 UI 代码推导工具定义」。语义、权限、副作用无法自动推导，能做到的是「写一次定义」。 

## 5. 方案

### 5.1 命名统一

| 现 MCP 名 | 统一后 | 处理 |
|---|---|---|
| `node_create` | `canvas_add_node` | 改名 |
| `node_update` | `canvas_update_title` + `canvas_update_text` | 拆成两个 |
| `node_move` | `canvas_move_node` | 改名 |
| `node_delete` | `canvas_delete_node` | 改名 |
| `node_connect` | `canvas_connect` | 改名 |
| `node_disconnect` | `canvas_remove_edge` | 改名 |
| `node_list` | `canvas_get`（增加 `kind` 过滤） | 合并 |
| `model_list` | `generation_catalog` | 改名 |
| 其余 45 个同名工具 | 不变 | 自动投影 |
| `generation_start`、`timeline_open`、`stage_open`、`project_*`、`local_adapter_*` | 保留 | MCP 专属 |

不保留旧名 alias。MCP 仍处于早期，现在改名的兼容成本最低。

### 5.2 声明投影

阶段 1/2 先让 MCP 从 `AGENT_TOOLS` 投影，阶段 3 再把 `AGENT_TOOLS` 换成注册表投影。投影逻辑不变，只换数据源。

`src/shared/agent-tools.ts` 的 `AgentToolDefinition` 增加 MCP 元数据：

```ts
export interface AgentToolMcpMeta {
  /** false = 不暴露给 MCP；缺省 true */
  expose?: boolean
  /** 对外标题，中文，必填 */
  title: string
  /** 对外描述，缺省复用 description */
  description?: string
  category?: McpToolCategory
  /** 危险操作：删除、清空类 */
  destructive?: boolean
}

export interface AgentToolDefinition {
  // ...现有字段
  mcp?: AgentToolMcpMeta
}
```

`src/main/mcp/auto-tools.ts`（新建）遍历 `AGENT_TOOLS`，用低层 `Server` 一次性注册 `tools/list` 与 `tools/call`：

```ts
const tools = AGENT_TOOLS
  .filter((tool) => tool.mcp?.expose !== false)
  .map((tool) => ({
    name: tool.name,
    title: tool.mcp?.title,
    description: tool.mcp?.description ?? tool.description,
    inputSchema: tool.parameters,
    annotations: {
      readOnlyHint: tool.readOnly,
      destructiveHint: tool.mcp?.destructive === true
    }
  }))

server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = AGENT_TOOLS.find((item) => item.name === request.params.name)
  if (!tool) throw new McpError(ErrorCode.MethodNotFound, '未知工具')
  const parsed = validateJsonSchema(tool.parameters, request.params.arguments)
  if (!parsed.ok) return errorResult(parsed.error)
  if (tool.readOnly) return runRead(tool, parsed.value)
  return runWrite(tool, parsed.value)
})
```

不再使用 `McpServer.registerTool`。原因是 `registerTool` 要求 zod schema，而我们要原样输出 JSON Schema；混用两套 handler 会冲突。

参数校验用 `src/main/mcp/schema-validate.ts` 的轻量校验器，覆盖 `type` / `required` / `enum` / `array` / 数值范围 / `additionalProperties`。校验失败直接返回 `isError`，不弹确认框，也不发到渲染进程。

执行分流：

| 执行方式 | 来源 | 执行位置 |
|---|---|---|
| `toCommands` | 注册表（阶段 3）/ 现有 bridge 分支（阶段 1/2） | renderer，`applyCommands` |
| `handlerId` | 异步流程 | renderer，`commandHandlers.ts` |
| `executorId` | 主进程工具 | main，`main-handlers.ts` |

阶段 1/2 还没有注册表，写工具统一走 `commandBridge` → `executeAgentTool`；阶段 3 改为按注册表的三种执行方式分流。

确认摘要复用 `toolConfirmationReason(call)`；返回 `null` 时使用 `tool.mcp.title`。

`src/main/mcp/catalog.ts` 改为计算属性：

```ts
export const MCP_TOOL_CATALOG = [
  ...AGENT_TOOLS
    .filter((tool) => tool.mcp?.expose !== false)
    .map(toMcpMeta),
  ...MCP_EXCLUSIVE_TOOLS.map(toMcpMeta)
]
```

阶段 3 后，`MCP_EXCLUSIVE_TOOLS` 并入注册表，catalog 只读注册表。

`src/main/mcp/write-tools.ts` 从 48 个注册收敛到 8 个 MCP 专属工具；`src/main/mcp/app-tools.ts` 只保留项目与本地适配器类主进程工具。

### 5.3 独立 scope

`src/shared/agent.ts` 的 `AgentScope` 增加：

```ts
/** MCP 外部调用：不要求节点在画布选中范围内 */
allowAnyNode?: boolean
```

`src/main/agent/tools/scope.ts`：

```ts
export function assertSelectedNode(scope: AgentScope, nodeId: string): void {
  if (scope.allowAnyNode) return
  if (!scope.selectedNodeIds.includes(nodeId)) {
    throw new AgentToolError('scope_denied', '只能修改当前选中的节点')
  }
}
```

`src/renderer/src/mcp/commandBridge.ts` 构造 scope 时传 `allowAnyNode: true`。

执行层需要同步补齐：

| 文件 | 改动 |
|---|---|
| `src/renderer/src/agent/canvasBridge.ts` | `canvas_remove_edge` 的二次选中过滤改用 `allowAnyNode`；`canvas_delete_node` 补「节点不存在」校验；`canvas_connect` 补两端节点存在校验 |
| `src/renderer/src/agent/timelineBridge.ts` | `timeline_open({ nodeId })` 打开已有剪辑室节点，不再只支持新建 |
| `src/renderer/src/agent/stageBridge.ts` | 无需改。`readDoc` / `applyToStage` 已支持按 `nodeId` 直接读盘与存盘 |
| `src/renderer/src/agent/filmBridge.ts` | 无需改。已按 `studyId` 直接加载 |

`timeline_*` 仍要求先调用 `timeline_open({ nodeId })`，因为执行层需要 `timelineStore.doc` 已加载。这是数据加载问题，不是权限问题。

### 5.4 文档与校验

- `docs/mcp.md` 第 6 节工具表改为 AUTO 区，由 `scripts/gen-mcp-docs.mjs` 从 catalog 生成；
- `check:docs` 增加「MCP 工具表与 catalog 一致」校验；
- `src/main/mcp/__tests__/catalog.test.ts` 增加：
  - 每个 `AGENT_TOOLS` 条目必须有 `mcp.expose` 决策（`true` 或显式 `false` 并附注释）；
  - `mcp.expose !== false` 的工具必须有中文 `mcp.title`，缺失时失败；
  - `mcp.description` 缺省复用 `description`，只有少数工具允许覆盖；
  - 投影工具的名称、只读标记、危险标记与 catalog 一致；
  - 专属工具不重复注册。
- 新增 schema lint 测试：每个 `parameters` 必须是合法 JSON Schema，至少有 `type: 'object'`；不合法时失败。
- `docs/agent-capabilities.md` 不变，CineBot 仍是 70 个工具。

## 6. 自动化边界

这一节回答「以后新增或修改功能，工具数量会自动增加吗，两个 Agent 能直接调用吗」。
以下描述阶段 1 / 2 完成后的状态；阶段 3 / 4 会进一步收敛，见第 7、8 节。

### 6.1 会，但有前提

工具数量只由两处决定：

- `AGENT_TOOLS`：CineBot 可见、MCP 默认投影；
- `MCP_EXCLUSIVE_TOOLS`：只给 MCP。

在 `AGENT_TOOLS` 增加一条定义后，以下动作会自动发生：

| 动作 | 机制 |
|---|---|
| CineBot 在该空间出现新工具 | `pi/tools.ts` 遍历 `AGENT_TOOLS`，按 `profiles` / `modes` 过滤 |
| MCP `tools/list` 出现同名工具 | `auto-tools.ts` 遍历 `AGENT_TOOLS`，按 `mcp.expose` 过滤 |
| 设置页工具清单多一条 | 设置页读 `MCP_TOOL_CATALOG`，catalog 由投影计算 |
| `docs/mcp.md` 工具表多一行 | `gen-mcp-docs.mjs` 生成 |
| 参数修改两边同步 | 两边使用同一份 `tool.parameters` |

### 6.2 不会自动发生的部分

- **纯 UI 功能不会自动变成工具**。预设提示词、风格库、卡片布局这类改动没有 `AgentToolDefinition`，两个 Agent 都看不到。要开放必须人工新增工具。
- **新增定义仍需人工写**：`name`、`description`、`parameters`（JSON Schema）、`profiles`、`modes`、`readOnly`、`mcp` 元数据。
- **执行分支仍需人工写**：定义只让工具「出现」，调用时还要有 `main-tools` 或对应 bridge 的分支。只加定义不加执行分支，调用会返回「未知工具」。阶段 3 后，这一步变成「命令实现 + 注册表登记」，不再需要改 bridge。
- **MCP 专属能力仍需人工判断**：打开工作台、项目列表、适配器管理这类不在 CineBot 视野内的能力，要单独放进 `MCP_EXCLUSIVE_TOOLS`。

### 6.3 新功能类型与工具数

| 新功能类型 | 工具数 | CineBot | MCP | 要做的事 |
|---|---:|---|---|---|
| 新 UI 功能（预设提示词、风格库） | 0 | 不可用 | 不可用 | 如要开放，新增工具定义 + 执行分支 |
| 新原子操作（如复制节点） | +1 | 自动可用 | 自动可用 | `AGENT_TOOLS` 加定义 + bridge 加分支 |
| 修改现有工具参数 | 0 | 自动同步 | 自动同步 | 只改 `AGENT_TOOLS` |
| 新节点操作（裁剪、扩图…） | 0 | 自动可用 | 自动可用 | 在 `node-operation-specs.ts` 注册 |
| 新转场 / 光照 / 世界预设 | 0 | 自动可用 | 自动可用 | 在对应枚举或注册表加条目 |
| 新模型 / 参数 | 0 | 自动可用 | 自动可用 | 改 provider schema 或 `models.json` |
| 新流程知识 | 0 | 可读技能 | 可读技能 | 写 `SKILL.md` |
| 新工作台（全新领域） | +N | 自动可用 | 自动可用 | 定义 + bridge；需要打开界面的再加 MCP 专属 `*_open` |

结论：**工具数量不会因为改 UI 或业务代码自动增加；只有把能力登记进 `AGENT_TOOLS` 才会 +1，并同时向两个 Agent 开放。** 注册表类功能不增加工具数，但两个 Agent 通过现有通用工具自动获得。

### 6.4 「直接调用」的条件

| 入口 | 条件 |
|---|---|
| CineBot | `profiles` 包含当前空间；`modes` 包含当前权限模式；执行分支存在 |
| MCP | `mcp.expose !== false`；执行分支存在；写工具需用户确认；只读模式下写工具被拒绝 |

## 7. 命令注册表（阶段 3）

### 7.1 为什么需要

阶段 1、2 解决了「MCP 重复声明」和「MCP 依赖选中节点」，但新增工具仍要改两处：`AGENT_TOOLS` 的定义和 bridge 的执行分支。命令注册表把这两处合成一处，让工具由注册表生成。

三个空间已经有命令层：

| 空间 | 命令类型 | 应用器 |
|---|---|---|
| 画布 | `CanvasCommand`（`src/shared/canvas-commands.ts`） | `canvasStore.applyCommands` |
| 时间线 | `TimelineCommand`（`src/shared/timeline-*`） | `useTimelineStore.dispatchMany` |
| 导演台 | `StageCommand`（`src/shared/stage-schema.ts`） | `applyStageCommands` |
| 拉片 | 无统一命令类型 | `filmBridge` 直接调 `window.api.filmStudy` |

画布、时间线、导演台可以直接复用命令类型；拉片需要一个 `handlerId` 指向 renderer 的处理函数。

### 7.2 数据结构

```ts
// src/shared/commands/types.ts
export interface CommandContext {
  projectPath: string
  canvasId: string
  scope: AgentScope
}

export interface AppCommandDefinition {
  /** 稳定 ID，例如 canvas.duplicateNode */
  id: string
  /** 模型可见名，例如 canvas_duplicate_node */
  tool: string
  /** MCP 与设置页展示标题，中文必填 */
  title: string
  /** 模型可见描述 */
  description: string
  /** MCP 对外描述，缺省复用 description */
  mcpDescription?: string
  category: McpToolCategory
  /** 唯一一份参数定义 */
  params: Record<string, unknown>
  readOnly: boolean
  destructive?: boolean
  profiles: AgentProfileId[]
  modes: AgentPermissionMode[]
  /** renderer：参数转成已有命令；返回 null 表示参数不合法 */
  toCommands?: (args: Record<string, unknown>) => AppCommand[] | null
  /** renderer：没有命令类型时，指向 commandHandlers 的处理函数 */
  handlerId?: string
  /** main：指向 main-handlers 的主进程函数 */
  executorId?: string
  /** MCP 暴露；only = 只给 MCP，CineBot 不可见 */
  mcp?: { expose?: boolean; only?: boolean }
}
```

`toCommands`、`handlerId`、`executorId` 三选一，注册表测试校验互斥。`AppCommand` 是 `CanvasCommand | TimelineCommand | StageCommand` 的联合类型，放在 `src/shared/commands/types.ts`。

### 7.3 生成链路

```text
src/shared/commands/*.ts
  ├─→ AGENT_TOOLS            (toAgentTool：name/description/parameters/profiles/modes/readOnly)
  ├─→ MCP_TOOL_CATALOG       (toMcpMeta：title/category/readOnly/destructive/confirm)
  ├─→ docs/mcp.md 工具表      (gen-mcp-docs.mjs)
  └─→ 设置页工具清单
```

`AGENT_TOOLS` 仍是 CineBot 和 MCP 的唯一入口，只是它从「手写数组」变成「注册表投影」。`pi/tools.ts` 和 `auto-tools.ts` 不需要改。

注册表按空间拆分：

| 文件 | 内容 |
|---|---|
| `src/shared/commands/canvas.ts` | 画布 12 个工具 |
| `src/shared/commands/timeline.ts` | 时间线 17 个工具 |
| `src/shared/commands/stage.ts` | 导演台 23 个工具 |
| `src/shared/commands/film.ts` | 拉片 11 个工具 |
| `src/shared/commands/generation.ts` | 生成与资产 3 个工具 |
| `src/shared/commands/capability.ts` | 能力 2 个工具 |
| `src/shared/commands/skills.ts` | 技能 2 个工具 |
| `src/shared/commands/exclusive.ts` | MCP 专属 8 个工具 |
| `src/shared/commands/index.ts` | 合并导出 `APP_COMMANDS`、`AGENT_TOOLS`、`MCP_TOOL_CATALOG` |

### 7.4 renderer 分发

`src/renderer/src/agent/commandDispatcher.ts`（新建）：

```ts
export async function dispatchCommand(
  definition: AppCommandDefinition,
  args: Record<string, unknown>,
  turnId: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (definition.toCommands) {
    const commands = definition.toCommands(args)
    if (!commands) return { ok: false, error: '参数不合法' }
    return applyByCategory(definition.category, commands, turnId)
  }
  if (definition.handlerId) {
    const handler = commandHandlers[definition.handlerId]
    if (!handler) return { ok: false, error: `未知处理器：${definition.handlerId}` }
    return handler(args, turnId)
  }
  return { ok: false, error: '该工具应在主进程执行' }
}
```

`applyByCategory` 按 `category` 路由到画布 / 时间线 / 导演台的应用器。已迁移到注册表的工具不再需要 `canvasBridge` 里的独立分支。

主进程工具不走这里：MCP 的 `auto-tools` 先判断 `executorId`，有则调 `main-handlers.ts`；没有则通过 `commandBridge` 发给 renderer，由 `dispatchCommand` 执行。CineBot 的 `pi/tools.ts` 同理，`executor: 'main'` 改为 `executorId` 判断。

### 7.5 迁移策略

阶段 3 一次性把 70 个工具迁进注册表，同一个分支、3 个 commit、1 个 PR：

| commit | 内容 |
|---|---|
| 1 | 注册表框架 + 画布 12 个工具；`AGENT_TOOLS = [...LEGACY_AGENT_TOOLS, ...CANVAS_COMMANDS]` |
| 2 | 时间线 17 + 导演台 22；对应 bridge 分支迁到 `commandHandlers.ts` |
| 3 | 拉片 11 + 生成/能力/技能 + MCP 专属 8；删除 `LEGACY_AGENT_TOOLS` 和 bridge 工具分支 |

迁移规则：

- 同步 CRUD 用 `toCommands`；
- 异步流程用 `handlerId`，并在 `handler-allowlist.json` 登记理由；
- 主进程工具用 `executorId`；
- 迁移完成的标志：`LEGACY_AGENT_TOOLS` 为空，`AGENT_TOOLS` 完全由 `APP_COMMANDS` 投影，`canvasBridge` / `timelineBridge` / `stageBridge` 里不再有 `call.name === '...'` 分支。

### 7.6 新增功能示例

新增「复制节点」：

```ts
// src/shared/commands/canvas.ts
{
  id: 'canvas.duplicateNode',
  tool: 'canvas_duplicate_node',
  title: '复制节点',
  description: '复制一个节点及其参数，放在原节点右下方。',
  category: '画布',
  params: {
    type: 'object',
    properties: { nodeId: { type: 'string' } },
    required: ['nodeId'],
    additionalProperties: false
  },
  readOnly: false,
  profiles: ['canvas'],
  modes: ['current', 'full-access'],
  executor: 'renderer',
  toCommands: (args) => [{ type: 'duplicateNode', nodeId: String(args.nodeId) }]
}
```

同时要做：

1. 在 `CanvasCommand` 增加 `duplicateNode` 类型；
2. 在 `canvasStore.applyCommands` 实现该命令。

之后 CineBot 工具、MCP 工具、设置页清单、`docs/mcp.md` 表格全部自动出现，不需要改 MCP 或 Agent 层。

### 7.7 阶段 3 的边界

| 能做 | 不能做 |
|---|---|
| 工具声明与执行映射合并到一处 | 省略新命令本身的实现（`applyCommands` 的 case） |
| 参数 schema 只有一份 | 自动生成高质量的工具描述 |
| MCP / CineBot / 文档 / 设置页自动同步 | 自动判断新功能是否应该开放给 Agent |
| 一次性迁完 70 个旧工具，之后新增只进注册表 | 把异步长任务硬包成同步命令 |
| 同步 CRUD 用 `toCommands`，异步流程用 `handlerId` | 把所有 UI 函数直接变成工具 |

## 8. 覆盖率校验与开发规范（阶段 4）

### 8.1 `check:agent-coverage`

新建 `scripts/check-agent-coverage.mjs`，扫描：

- `src/shared/canvas-commands.ts` 的 `CanvasCommand` 联合类型；
- `src/shared/timeline-*` 的命令联合类型；
- `src/shared/stage-schema.ts` 的 `StageCommand` 联合类型；
- `src/shared/commands/*.ts` 的注册项；
- `src/renderer/src/agent/commandHandlers.ts` 的 `handlerId` 表；
- `src/renderer/src/agent/{canvas,timeline,stage,film}Bridge.ts` 的 `call.name === '...'` 分支。

校验规则：

| 规则 | 失败条件 |
|---|---|
| 命令覆盖率 | 存在命令类型，但注册表没有对应项，且豁免清单没有理由 |
| 工具唯一 | `tool` 名重复 |
| 暴露决策 | 注册项没有 `mcp.expose` 决策（true 或显式 false） |
| 执行方式互斥 | 同一项同时有 `toCommands` / `handlerId` / `executorId` 中多于一个 |
| handler 白名单 | `handlerId` 不在 `handler-allowlist.json`，或白名单项没有理由 |
| 新 CRUD 禁止 handler | 注册项 `handlerId` 且不在白名单，同时没有 `toCommands` 实现 |
| bridge 残留 | bridge 里出现 `call.name === '...'` 的工具分支 |
| 豁免有效期 | 豁免项 `expiresAt` 已过期 |

### 8.2 豁免与白名单

`agent-coverage-exempt.json` 用于「命令存在但不开放给 Agent」：

```json
{
  "exempt": [
    {
      "command": "canvas.updatePrompt",
      "reason": "由 PromptBar 本地交互直接调用，副作用依赖输入框状态，不开放给 Agent",
      "expiresAt": "2027-06-30"
    }
  ]
}
```

`handler-allowlist.json` 用于「异步流程必须保留 handler」：

```json
{
  "handlers": [
    {
      "handlerId": "timeline.autoSubtitles",
      "reason": "长任务，依赖字幕模型与进度事件，无法用同步命令表达"
    },
    {
      "handlerId": "timeline.export",
      "reason": "长任务，需要渲染进度与取消"
    }
  ]
}
```

每条必须有 `reason`；`agent-coverage-exempt.json` 的 `expiresAt` 过期后校验失败，强制重新评估。

### 8.3 开发规范

在 `AGENTS.md` 增加一条硬性约定：

> 新增功能时必须回答「是否开放给 Agent」。开放则在 `src/shared/commands/` 登记；不开放则在 `agent-coverage-exempt.json` 写明理由。同步 CRUD 必须用 `toCommands`，异步流程才能用 `handlerId` 并登记到 `handler-allowlist.json`。`check:agent-coverage` 会拦截未登记的命令和 bridge 残留分支。

PR 模板增加两个检查项：

- [ ] 新功能已评估 Agent 能力（注册或豁免）
- [ ] 涉及工具时已运行 `corepack pnpm check:agent-coverage`

### 8.4 校验命令

```bash
corepack pnpm check:agent-coverage
```

建议加入发版前检查列表，与 `check:docs`、`check:ui`、`typecheck` 并列。是否并入 `check:docs` 由实施时决定：覆盖率校验依赖命令类型解析，单独脚本更清晰。

## 9. 改动清单

### 9.1 阶段 1 / 2（本次实现）

| 文件 | 改动 |
|---|---|
| `src/shared/agent.ts` | `AgentScope` 增加 `allowAnyNode` |
| `src/shared/agent-tools.ts` | `AgentToolDefinition` 增加 `mcp` 元数据，`title` 必填 |
| `src/main/agent/tools/scope.ts` | `assertSelectedNode` 支持 `allowAnyNode` |
| `src/main/agent/tools/canvas.ts` | `canvas_get` 增加 `kind` 过滤；各工具补 `mcp` 元数据 |
| `src/main/agent/tools/generation.ts` | 补 `mcp` 元数据 |
| `src/main/agent/tools/stage.ts` | 补 `mcp` 元数据 |
| `src/main/agent/tools/timeline.ts` | 补 `mcp` 元数据 |
| `src/main/agent/tools/film.ts` | 补 `mcp` 元数据 |
| `src/main/agent/tools/capability.ts` | 补 `mcp` 元数据 |
| `src/main/agent/tools/skills.ts` | 补 `mcp` 元数据 |
| `src/main/mcp/auto-tools.ts` | 新建：低层 `Server` 注册 `tools/list` / `tools/call`，JSON Schema 直出 |
| `src/main/mcp/schema-validate.ts` | 新建：轻量 JSON Schema 校验器 |
| `src/main/mcp/exclusive-tools.ts` | 新建：MCP 专属工具声明，阶段 3 并入注册表 |
| `src/main/mcp/catalog.ts` | 改为计算属性 |
| `src/main/mcp/write-tools.ts` | 收敛到 8 个专属工具，写工具统一走 `runWrite` |
| `src/main/mcp/app-tools.ts` | 保留项目与适配器类主进程工具 |
| `src/main/mcp/server.ts` | 创建 session 时调用低层注册，不再 `registerTool` |
| `src/main/mcp/__tests__/catalog.test.ts` | 暴露决策、`title` 必填、schema lint、投影一致性 |
| `src/renderer/src/mcp/commandBridge.ts` | scope 传 `allowAnyNode`；`timeline_open` / `stage_open` 支持已有节点 |
| `src/renderer/src/agent/canvasBridge.ts` | 选中过滤改用 `allowAnyNode`；补节点存在性校验 |
| `src/renderer/src/agent/timelineBridge.ts` | `timeline_open` 支持打开已有节点 |
| `scripts/gen-mcp-docs.mjs` | 新建：生成 `docs/mcp.md` 工具表 |
| `scripts/check-docs.mjs` | 增加 MCP 工具表校验 |
| `docs/mcp.md` | 工具表改为 AUTO 区，补迁移表与描述/标题策略 |
| `docs/README.md` | 登记本文档 |
| `docs/code-map/06-agent.md` | 更新 MCP 工具与 scope 说明 |
| `docs/code-map/08-capabilities.md` | 更新能力状态 |

### 9.2 阶段 3 / 4（后续）

| 文件 | 改动 |
|---|---|
| `src/shared/commands/types.ts` | 新建：`AppCommandDefinition`、`AppCommand`、`CommandContext` |
| `src/shared/commands/canvas.ts` | 新建：画布 12 个工具 |
| `src/shared/commands/timeline.ts` | 新建：时间线 17 个工具 |
| `src/shared/commands/stage.ts` | 新建：导演台 23 个工具 |
| `src/shared/commands/film.ts` | 新建：拉片 11 个工具 |
| `src/shared/commands/generation.ts` | 新建：生成与资产 3 个工具 |
| `src/shared/commands/capability.ts` | 新建：能力 2 个工具 |
| `src/shared/commands/skills.ts` | 新建：技能 2 个工具 |
| `src/shared/commands/exclusive.ts` | 新建：MCP 专属 8 个工具 |
| `src/shared/commands/index.ts` | 新建：合并导出 `APP_COMMANDS`、`AGENT_TOOLS`、`MCP_TOOL_CATALOG` |
| `src/shared/__tests__/commands.test.ts` | 新建：工具名唯一、执行方式互斥、参数 schema、标题必填 |
| `src/renderer/src/agent/commandDispatcher.ts` | 新建：renderer 通用分发，按 category 路由到现有应用器 |
| `src/renderer/src/agent/commandHandlers.ts` | 新建：异步流程 handler 表（拉片、字幕、导出等） |
| `src/renderer/src/agent/{canvas,timeline,stage}Bridge.ts` | 删除 `call.name === '...'` 工具分支，只保留通用入口 |
| `src/main/agent/main-handlers.ts` | 新建：主进程 `executorId` 表 |
| `src/main/agent/tools/index.ts` | `AGENT_TOOLS` 改为 `APP_COMMANDS.map(toAgentTool)` |
| `src/main/agent/pi/tools.ts` | `executor` 判断改为 `executorId` |
| `handler-allowlist.json` | 新建：异步流程白名单，每项必须有理由 |
| `scripts/check-agent-coverage.mjs` | 新建：命令覆盖率、bridge 残留、handler 白名单校验 |
| `agent-coverage-exempt.json` | 新建：豁免清单，每项必须有理由 |
| `package.json` | 新增 `check:agent-coverage` |
| `AGENTS.md` | 新增 Agent 能力登记约定 |
| `.github/pull_request_template.md` | 新增两项 Agent 能力检查 |
| `docs/code-map/09-dev-workflow.md` | 新增功能时评估 Agent 能力 |

## 10. 影响模块

- **01 画布**：`canvas_get` 增加 `kind`；删除节点与连线补存在性校验；阶段 3 迁移 `CanvasCommand`；
- **03 剪辑室**：`timeline_open` 支持打开已有节点；阶段 3 迁移时间线命令；
- **04 导演台**：执行层已支持按节点读写，只需验证；阶段 3 迁移 `StageCommand`；
- **05 拉片**：阶段 3 通过 `handlerId` 接入注册表，不需要统一命令类型；
- **06 Agent**：`AgentToolDefinition`、`AgentScope`、`assertSelectedNode`、4 个 bridge；
- **07 存储 / IPC**：无新 IPC；
- **10 UI**：设置页工具清单自动更新，无需改代码；
- **开发流程**：阶段 4 增加覆盖率校验、豁免清单、PR 检查项；
- **外部客户端**：工具名变化，需要按迁移表更新。

## 11. 验收

### 11.1 阶段 1 / 2

1. `corepack pnpm typecheck`、`check:ui`、`check:docs`、`test` 通过。`test` 仍有 3 个历史环境失败（asset protocol、esbuild、ffmpeg 编码），与本改动无关。
2. MCP `tools/list` 返回 77 个工具（69 个投影 + 8 个专属），名称与新清单一致。
3. 关键验收：临时在 `AGENT_TOOLS` 加一个工具，不改 MCP 代码，`tools/list` 自动出现；删除后自动消失。
4. 隔离实例中不选中任何节点：
   - `canvas_update_title` 成功；
   - `stage_add_object` 成功，导演台未打开也能写盘；
   - `timeline_open({ nodeId })` 打开已有剪辑室，再执行 `timeline_add_marker` 成功；
   - `film_study_get({ nodeId })` 成功。
5. 只读模式：所有写工具返回「MCP 当前为只读模式」。
6. 确认框：写工具逐次弹出；删除类使用警告图标。
7. `docs/mcp.md` 工具表与 catalog 一致。

### 11.2 阶段 3

1. 新增一个命令注册项后，不改 MCP、不改 `AGENT_TOOLS`、不改 bridge：
   - CineBot 在该 profile 出现工具；
   - MCP `tools/list` 出现工具；
   - 设置页工具清单与 `docs/mcp.md` 自动更新。
2. 修改注册项的 `params` 后，CineBot 与 MCP 的参数 schema 同时变化。
3. **全量迁移完成**：70 个 CineBot 工具 + 8 个 MCP 专属全部来自 `APP_COMMANDS`（共 78 项）；`LEGACY_AGENT_TOOLS` 为空；CineBot 可见 70 个，MCP 可见 77 个，工具名唯一。
4. **bridge 无残留**：`rg "call\\.name ===" src/renderer/src/agent` 不再返回工具名分支；`canvasBridge` / `timelineBridge` / `stageBridge` 只保留通用入口，`filmBridge` 只保留加载与 handler 表。
5. **执行方式互斥**：每个注册项只有 `toCommands` / `handlerId` / `executorId` 之一；`handlerId` 均在 `handler-allowlist.json` 中且有理由。
6. **77 硬指标**：MCP `tools/list` 返回 77 个工具；每个工具的 `title` 是中文；`inputSchema` 都是合法 JSON Schema。
7. 阶段 3 合入后新增的工具只出现在注册表，bridge 不再增加分支。

### 11.3 阶段 4

1. `corepack pnpm check:agent-coverage` 通过。
2. 人为在 `CanvasCommand` 加一个类型但不登记、不豁免，命令返回非零并指出缺失项。
3. 人为写一条没有 `reason` 的豁免，命令返回非零。
4. 豁免项 `expiresAt` 过期后，命令返回非零。
5. 人为在 `canvasBridge` 加一个 `call.name === '...'` 分支，命令返回非零。
6. 人为给同步 CRUD 工具写 `handlerId` 且不在白名单，命令返回非零。
7. `AGENTS.md` 与 PR 模板包含 Agent 能力检查项。

## 12. 风险

| 风险 | 处理 |
|---|---|
| 改名破坏现有客户端 | 当前只有本地测试客户端；文档给迁移表，不保留 alias |
| 低层 `Server` 手写 `tools/call` 与 SDK 升级不兼容 | 加一个 MCP 集成测试：启动 server、列出工具、调用一个只读和一个写工具；SDK 升级时先跑该测试 |
| 低层方案丢失 SDK 的自动参数校验 | `schema-validate.ts` 预校验 + 渲染进程 `assertToolAllowed` 双重校验；校验失败不弹确认框 |
| 只读工具从读磁盘改为读内存，窗口未加载时不可用 | `project_*` / `local_adapter_*` 仍主进程执行；画布类只读工具改走渲染进程 |
| 放开选中限制后越权 | 写操作仍有确认框；只读模式仍拦截；补节点存在性校验 |
| 工具数量从 61 增加到 77 | 新增的 16 个是此前未开放的 CineBot 能力，不是重复工具；设置页按类别展示 |
| 全量迁移一次性改动大 | 一个分支 3 个 commit，按空间 review；每个 commit 后跑 `typecheck` 与相关测试，出问题按 commit revert |
| `handlerId` 滥用，回到改 bridge 的老路 | `handler-allowlist.json` 白名单 + `check:agent-coverage` 拦截未登记项；新增 CRUD 工具写 `handlerId` 直接失败 |
| 命令注册表抽象过度，简单工具也要绕一层 | 只迁有命令类型的空间；拉片等用 `handlerId` 直通，不强行统一 |
| 覆盖率校验误报（内部命令不适合开放） | 豁免清单强制写理由与有效期，按季度复核 |
| 覆盖率校验漏报（新命令类型没被扫描） | 扫描基于 `CanvasCommand` / `TimelineCommand` / `StageCommand` 联合类型；新增命令类型时校验脚本会因未知类型失败，提示更新 |

## 13. 实施顺序

### 13.0 实施状态

- 2026-11-24：阶段 1/2 提交 1 已实施（`21df943`）：MCP 从 `AGENT_TOOLS` 投影 77 个工具，低层 `Server` 直出 JSON Schema，旧工具名移除。
- 2026-11-24：阶段 1/2 提交 2 已实施：`allowAnyNode` 生效，`timeline_open({ nodeId })` / `stage_open({ nodeId })` 打开已有节点。
- 2026-11-24：阶段 3 第一步已实施：70 个工具的 MCP 元数据并入 `AgentToolDefinition.mcp`，删除 `exposure.ts`，MCP 投影直接读工具定义。
- 2026-11-24：阶段 3 第二步已实施：画布 / 时间线 / 导演台 / 拉片 4 个 bridge 的 `if (call.name === ...)` 分支改为 handler 表；`rg "call\.name ===" src/renderer/src/agent` 已清零。独立 `commandHandlers.ts` 与 `toCommands` 尚未抽出。
- 阶段 4 待实施。

### 13.1 阶段 1 / 2（同一分支，两个提交）

1. **提交 1**：命名统一 + 自动投影 + catalog 计算化 + 文档生成。不改 scope。
2. **提交 2**：`allowAnyNode` + `timeline_open` 打开已有节点 + 执行层校验补齐。

### 13.2 阶段 3（一个分支、3 个 commit、1 个 PR）

1. **commit 1**：新建 `src/shared/commands/` 框架与 `types.ts`，迁移画布 12 个工具；`AGENT_TOOLS = [...LEGACY_AGENT_TOOLS, ...CANVAS_COMMANDS]`。
2. **commit 2**：迁移时间线 17 个、导演台 23 个；对应 bridge 分支搬到 `commandHandlers.ts`。
3. **commit 3**：迁移拉片 11 个、生成/能力/技能 7 个、MCP 专属 8 个；删除 `LEGACY_AGENT_TOOLS` 和 bridge 工具分支。
4. 每个 commit 后跑 `typecheck`、相关测试、`check:docs`；合入前在隔离实例验证每个空间一个代表性工具。

### 13.3 阶段 4（最后）

1. 新建 `scripts/check-agent-coverage.mjs`、`agent-coverage-exempt.json`、`handler-allowlist.json`。
2. 增加命令覆盖率、执行方式互斥、handler 白名单、bridge 残留、豁免有效期五类校验。
3. 补充 `AGENTS.md` 约定与 PR 模板检查项。
4. 对现有未开放命令逐条填写豁免理由，把阶段 3 的异步 handler 填入白名单，作为第一次基线。
5. 把 `check:agent-coverage` 加入发版前检查列表。

## 14. 迁移表

| 旧名 | 新名 |
|---|---|
| `node_create` | `canvas_add_node` |
| `node_update`（标题） | `canvas_update_title` |
| `node_update`（正文） | `canvas_update_text` |
| `node_move` | `canvas_move_node` |
| `node_delete` | `canvas_delete_node` |
| `node_connect` | `canvas_connect` |
| `node_disconnect` | `canvas_remove_edge` |
| `node_list` | `canvas_get`（传 `kind` 过滤） |
| `model_list` | `generation_catalog` |
| 其余同名工具 | 不变 |
