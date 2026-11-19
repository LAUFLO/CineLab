# CineLab Agent 运行时 v3 方案

日期：2026-11-19
状态：M1 进行中（M0 已通过，2026-11-19）
适用版本：v0.3.1 → v0.4.0
最后核对：2026-11-19
关联：`docs/agent-architecture-plan.md`、`docs/agent-capabilities.md`、`docs/code-map/06-agent.md`、`docs/code-map/08-capabilities.md`

## 0. 结论

采用 **D3 整包路线**：用 `@earendil-works/pi-coding-agent@1.5.2` 重建 CineBot 的运行时、会话和文本模型接入，保留 CineLab 已有的工具、渲染桥、生成提案、确认、回合撤销和 UI 契约。

一次换完内核，不做 D1→D2 的渐进迁移；交付按 M0–M5 里程碑推进，每个里程碑必须可验证。

已确定的关键边界：

1. 本期只做单 Agent，不引入子 Agent、Agent Team、MCP；
2. 技能、系统提示词、权限规则、确认文案仍由 CineLab 拥有；
3. 文本对话切 pi-ai `ModelRuntime`，请求层写自定义 `streamSimple`，保留 `httpFetch` 代理；
4. 新会话只写 v2，旧 v1 会话不迁移、不展示、不读取，文件原地冷备；
5. 接受 pi 依赖带来的包体增大，不裁剪、不因包体回退 D2；安装包实测值仅记录。

前置条件（缺一不可）：

1. M0 功能 spike 已通过（动态 import、customTools、streamSimple、finishTurn、Type.Unsafe、v2 目录）；安装包体积仅记录，不作为门禁；
2. 接受为中文 compaction / 队列行为维护 `pnpm patch`，并锁定 pi 版本；
3. 回归前准备一个支持稳定 function calling 的文本模型，不能只用 `agnes-3.0-flash`。

工期预估：**16–19 人日**（含 M0 spike、工具迁移、回归和打包）。

## 1. 背景

### 1.1 触发问题

2026-11-19 的会话 `main-mwmzpwd4-8add` 暴露了三类问题：

| 问题 | 证据 |
|---|---|
| 模型只输出一句话就停 | turn 94/97/100/109 的 `toolCalls: []`，`output` 仅 11–92 tokens，状态 `completed` |
| 8 步硬停 | turn 22/59 状态 `error`，错误为「本轮工具调用次数过多，已停止」 |
| 上下文失忆 | turn 34 声称场景已搭好，但实际没有工具调用；用户随后反馈「没有看到」 |
| 限速无退避 | turn 31/66/68 为 HTTP 429，直接 `error` |
| 截断无提示 | `readSse` 不读取 `finish_reason`，`length` 也被当作正常完成 |

### 1.2 根本原因

- `runtime.ts` 是 756 行的精简循环：固定 `MAX_STEPS = 8`、字符数截断历史、工具结果不进历史、无重试、无自动续跑；
- 历史重建只保留 user/assistant 文本，`tool_calls` 和 `tool_result` 丢失；
- 模型能力不足是独立变量：`agnes-3.0-flash` 在长系统提示下经常不发 tool call，换运行时不能根治。

### 1.3 为什么不是 D1/D2

D1（只换 loop）能解决 8 步和自动续跑，但会话仍然只存文本，跨轮依旧失忆；D2 需要自己维护 session/compaction，和 pi 的 `SessionManager` 重复。既然目标是「一步到位」，直接采用 pi 的完整会话和资源体系，避免二次迁移。

### 1.4 ToonFlow 调研结论

`HBAI-Ltd/Toonflow-app` 的 AI 助手直接使用 `@earendil-works/pi-coding-agent@0.85.1` 和 `@earendil-works/pi-ai@0.85.1`：

- `apps/server/src/agent/runtime/index.ts`：`createAgentSession` + `SessionManager` + `DefaultResourceLoader` + 自定义工具；
- `apps/server/src/agent/runtime/model.ts`：`ModelRuntime.registerProvider` 注册自研 provider；
- `apps/server/src/agent/runtime/requests.ts`：自定义请求层，处理重试、413、字节预算、计费；
- `patches/piAgentCore.patch`、`patches/piCodingAgent.patch`：队列可编辑、abort 语义、CJK token 估算；
- 节点级 AI 用 `runAgentLoop` + 自定义 SSE（`packages/nodeScaffold/src/nodeAi.ts`）。

权限方面，ToonFlow 没有使用 pi 的权限系统，因为 pi 不自带：

| 层 | ToonFlow 的做法 | 证据 |
|---|---|---|
| 工具集 | 按启用的插件/节点工具动态生成 `customTools` | `apps/server/src/agent/tools/index.ts` |
| 节点工具权限 | `agentNodeTools` 设置 + `isNodeToolAllowed`，禁用就抛错 | `packages/tools/canvas/src/runtime.ts` |
| 高危操作审批 | `QuestionContext.ask` 发 `{ type: 'question' }`，前端渲染审批卡 | `apps/server/src/agent/bridge/question.ts` |
| 本机确认 | `requiresLocalApproval`，非本机请求返回 403 | 同上 |
| pi 本体 | 只有 `tool_call` 的 `block` 钩子和工具名 allow/exclude | pi `docs/security.md` |

### 1.5 事实核查结论

| 事实 | 影响 |
|---|---|
| `ProviderConfigInput` **没有 `fetch` 字段**，只有 `streamSimple` | 文本请求层改为自定义 `streamSimple`，不再写“注入 fetch” |
| `AgentSession` 构造时会覆盖 `agent.finishTurn` | 取出原钩子再包一层，不能直接赋值 |
| `SessionManager` 默认目录是 `<agentDir>/sessions/--<cwd编码>--/`，未发现文件锁 | 显式传自定义 v2 目录；CineLab 自己加锁 |
| `parameters` 是 TypeBox schema；`Type.Unsafe` 类型成立 | 直接复用现有 JSON Schema；M0 已实测可执行 |
| `ToolDefinition.executionMode` 存在 | 确认类工具可直接标 `sequential` |
| `require('pi-coding-agent')` 失败，CJS 内 `await import()` 成功 | 主进程保持 CJS，用动态 import；ESM 化降为最后手段 |
| `AgentSession.compact()` 存在 | 手动压缩按钮可直接接 pi 的压缩 API |
| pi 不自带权限系统 | 权限规则留在 CineLab，pi 只做 `tool_call` 拦截（B1） |
| CineLab 文本模型只有 OpenAI-compatible | v3 模型层只需 `openai-completions` |
| CineLab 文本模型不支持图片输入 | 本期不做 vision，附件仍是画布节点 |

## 2. 目标与非目标

### 2.1 目标

1. 用 pi 的 `AgentSession` 替换 `runtime.ts` 的循环、历史、压缩和事件流；
2. 保留 63 个工具的行为、权限、确认、提案和撤销语义；
3. 会话支持完整 tool call / tool result，跨轮不失忆；
4. 支持自动续跑、429 重试、`length` 截断检测；
5. UI 的 `AgentEvent` 契约保持向后兼容；
6. 新会话直接使用 v2 格式，旧 v1 会话不迁移、不展示；
7. 补齐 `stage` / `film` 两个 profile 的提示词和工具过滤，但不改 UI 入口；
8. 接受 pi 依赖带来的包体增量；启动时间不退化。

### 2.2 非目标

- 不重写画布、时间线、导演台、拉片的业务命令；
- 不替换图片/视频/音频生成 provider；
- 不引入子 Agent、Agent Team、MCP；
- 不改变生成提案的两段式流程；
- 不引入 ToonFlow 式的 per-tool / per-node 权限设置，保持只读/当前空间两档；
- 不迁移旧 v1 会话；旧文件原地保留为冷备，不提供 UI 入口；
- 不做多用户/远程会话、不做 vision 输入。

### 2.3 成功指标

同一任务「菜市场 10 秒预演」+ 四空间各一个任务：

| 指标 | 目标 |
|---|---|
| 人工「继续」次数 | ≤ 1（现状 5+） |
| 工具调用成功率 | ≥ 现网 |
| 任务完成率 | ≥ 现网 |
| `pnpm test` / `typecheck` / `check:ui` | 全绿 |
| 安装包增量 | 接受 pi 依赖带来的增量；实测值仅记录，不设阈值 |
| 冷启动 | 无明显退化（≤ +500ms） |

## 3. 现状盘点

### 3.1 文件与规模

| 文件 | 行数 | 角色 |
|---|---|---|
| `src/main/agent/runtime.ts` | 756 | 回合循环、事件、工具调度、确认、取消 |
| `src/main/agent/model.ts` | 375 | 文本模型解析、SSE 解析、`chatWithTools` |
| `src/main/agent/session.ts` | 407 | JSONL 会话、标题、加载 |
| `src/main/agent/compact.ts` | 93 | 上下文摘要压缩 |
| `src/main/agent/proposals.ts` | 499 | 生成提案生命周期 |
| `src/main/agent/tools/*.ts` | 7 个文件 | 63 个工具定义与参数校验 |
| `src/renderer/src/agent/agentStore.ts` | 999 | 前端消息、回合、提案状态 |
| `src/renderer/src/agent/AgentPanel.tsx` | 1214 | 对话、确认、提案 UI |
| 四个 bridge | 1116 + 872 + 1078 + 443 | 渲染进程工具执行 |

### 3.2 工具

当前 `AGENT_TOOLS` 共 63 个：

| 域 | 数量 | 主进程执行 | 需确认 |
|---|---:|---:|---:|
| 画布 | 12 | 0 | 3 |
| 生成与资产 | 3 | 2 | 0 |
| 导演台 | 22 | 1（capabilities） | 5 |
| 剪辑室 | 17 | 0 | 5 |
| 拉片 | 5 | 0 | 3 |
| 能力与技能 | 4 | 3 | 0 |

> executor/confirm 以 `src/main/agent/tools/*.ts` 的 `AGENT_TOOLS` 为准；上表由源码扫描得出，迁移时逐项复核。

### 3.3 事件契约

当前 `AgentEvent` 类型：

`turn_start`、`text`、`text_delta`、`tool_start`、`tool_end`、`confirm_request`、`turn_end`、`proposal`、`error`。

新增事件必须是可选的，旧 `agentStore` 遇到未知事件应忽略，不能抛错。

### 3.4 会话格式

`.cinelab/agent/sessions/<id>.jsonl`，行类型：

- `session`：版本与会话 id；
- `meta`：标题；
- `message`：`role`、`content`、`turnId`、`toolName`、`toolStatus`；
- `turn`：完整 `AgentTurn`，含 usage、change、status。

缺陷：没有 tool call 的 arguments、没有 tool result 的结构化内容，无法重建 pi transcript。本期不迁移旧会话，v1 文件原地保留为冷备。

### 3.5 依赖与运行时

- Electron 45.3.1，主进程 Node 24.22.2，CJS 输出；
- `electron-vite` 的 `externalizeDepsPlugin` 把 dependencies 外部化；
- 现有 dependencies 没有 ESM-only 的 agent 框架；
- pi-coding-agent 1.5.2 是 ESM-only，依赖 `pi-agent-core`、`pi-ai`、`pi-codemode`、`pi-mcp`、`pi-tui`、`photon-node`、`quickjs-wasi`、`undici` 等。

## 4. 方案选型

| 方案 | 范围 | 优点 | 缺点 | 决策 |
|---|---|---|---|---|
| D1 | 只换 `runtime.ts` 循环为 `pi-agent-core` | 改动小，5–8 天 | 会话仍是文本，跨轮失忆；需二次迁移 | 否 |
| D2 | D1 + 自研 session/compaction | 可控 | 和 pi 重复造轮子 | 否 |
| **D3** | `pi-coding-agent` 整包 + 适配层 | 一次到位：session、compaction、skills、retry、queue 全拿 | 工具/模型/UI 适配量大；ESM/体积风险 | **采纳** |

选 D3 的核心理由：

1. 目标不是「修 8 步」，而是让 CineBot 具备长期会话、压缩、自动续跑和可恢复能力；
2. 这些能力在 pi 的 `AgentSession` 里已经产品化，自己实现会重复 ToonFlow 踩过的坑；
3. CineLab 的差异化在工具、提案、确认、撤销，不在 loop，替换内核不丢资产。

## 5. 目标架构

### 5.1 分层

```
AgentPanel / agentStore（渲染进程，保持 AgentEvent 契约）
        │ IPC：chat / cancel / tool-result / confirm / session-*
        ▼
src/main/agent/pi/runtime.ts（createAgentSession 封装）
        ├─ model-runtime.ts   ModelRuntime + 自定义 streamSimple
        ├─ resources.ts       DefaultResourceLoader + prompt/skills
        ├─ session.ts         SessionManager + v2 目录
        ├─ session-lock.ts    同会话单写者锁
        ├─ tools/             63 个 ToolDefinition（customTools）
        ├─ permissions.ts     profile/mode/scope + 确认规则（B1）
        ├─ events.ts          pi event → AgentEvent
        ├─ confirm.ts         extension tool_call 拦截
        ├─ change.ts          回合变更合并 / 撤销
        ├─ proposals.ts       工具内调 proposals.ts
        └─ continue.ts        包装 finishTurn 的自动续跑
        ▼
现有业务层：canvasBridge / timelineBridge / stageBridge / filmBridge
            proposals.ts / generationQueue / 项目存储
```

### 5.2 目录

```
src/main/agent/
  runtime.ts                     # 对外 startTurn/cancelTurn/resolve* 保留，内部转 pi
  pi/
    runtime.ts                   # createAgentSession、activeTurns、prompt/abort
    model-runtime.ts             # ModelRuntime、provider 注册、自定义 streamSimple
    resources.ts                 # DefaultResourceLoader、system prompt、skills
    session.ts                   # SessionManager、v2 路径
    session-lock.ts              # 同会话单写者锁
    tools/
      index.ts                   # customTools 数组
      adapter.ts                 # AgentToolDefinition → pi ToolDefinition
      canvas.ts / stage.ts / ...
    permissions.ts               # assertToolAllowed / toolConfirmationReason（B1 规则源）
    events.ts                    # pi event → AgentEvent
    confirm.ts                   # tool_call 拦截与确认
    change.ts                    # change 合并、turnId 映射
    proposals.ts                 # getActiveTurnInfo、提案工具
    continue.ts                  # finishTurn 包装、自动续跑
  legacy/                        # 旧实现，合并前删除
  __tests__/
    pi-runtime.test.ts
    pi-tools.test.ts
    pi-events.test.ts
    pi-permissions.test.ts
    pi-lock.test.ts
    pi-continue.test.ts
```

### 5.3 依赖

```json
{
  "@earendil-works/pi-coding-agent": "1.5.2",
  "@earendil-works/pi-ai": "1.5.2",
  "typebox": "1.3.27",
  "proper-lockfile": "4.1.2"
}
```

`pi-agent-core` 由 `pi-coding-agent` 传递依赖，不单独声明。`zod` 保留，用于现有业务校验；pi 工具参数用 TypeBox（`Type.Unsafe` 复用现有 JSON Schema）。

### 5.4 数据流

```
AgentPanel → agent:chat
  → pi/runtime.startTurn
  → createAgentSession({
      agentDir, cwd, modelRuntime, model, sessionManager, resourceLoader,
      settingsManager, tools: [], customTools: piTools
    })
  → session.prompt(text)
      → pi loop：模型请求（自定义 streamSimple → httpFetch）
      → tool_call → extension 拦截（权限 + 确认）
      → 工具 execute：main 直执行 / renderer bridge
      → tool result 回填 transcript
      → finishTurn 包装：判断是否自动续跑
  → session.subscribe 事件 → AgentEvent → agentStore
  → agent_settled → turn_end → JSONL 落盘
```

## 6. 关键设计

### 6.1 运行时与会话生命周期

对外 API 保持不变：

```ts
export function startTurn(request: AgentChatRequest, callbacks: AgentTurnCallbacks): { turnId: string }
export function cancelTurn(turnId: string): void
export function resolveToolResult(input: AgentToolResultInput): void
export function resolveConfirmation(input: AgentConfirmInput): void
export function getActiveTurnInfo(turnId: string): { sessionId: string; scope: AgentScope } | null
```

内部改为：

```ts
const { session } = await createAgentSession({
  cwd: root,
  agentDir: join(root, '.cinelab', 'agent'),
  modelRuntime,
  model: runtimeModel,
  thinkingLevel: 'off',
  sessionManager: history,
  resourceLoader,
  settingsManager,
  tools: [],
  customTools: piTools
})
```

约束：

- 同一会话同一时间只允许一个回合；不同会话/窗口可并发；
- `ActiveTurn` 增加 `windowId`，`cancel` / `tool-result` / `confirm` 三个入口都校验 `windowId`；
- `startTurn` 获取会话锁，`agent_settled` 或 `cancel` 后释放；
- `cancelTurn` 调 `session.abort()`；
- `resolveToolResult` / `resolveConfirmation` 继续从 map 解析 Promise；
- `session.dispose()` 在 `agent_settled` 后调用，避免泄漏。

### 6.2 模型层

只替换文本对话；图片/视频/音频继续走现有 provider。

`ProviderConfigInput` 没有 `fetch`，因此自定义请求层必须通过 `streamSimple` 实现：

```ts
const runtime = await ModelRuntime.create({
  credentials: new InMemoryCredentialStore(),
  modelsPath: null,
  refreshOnCreate: false
})

runtime.registerProvider(providerId, {
  name: providerName,
  api: 'openai-completions',
  baseUrl,
  headers,
  streamSimple: async (model, context, options) => {
    // 用现有 httpFetch 发请求，解析 SSE，产出 AssistantMessageEventStream
  },
  models: [{ id, name, contextWindow, maxTokens, input: ['text'], ... }]
})
await runtime.setRuntimeApiKey(providerId, apiKey)
```

- `models.json` 增加可选 `protocol`；没有时默认 `openai-completions`，旧配置不迁移；
- `streamSimple` 复用 `httpFetch`（Electron `net.fetch`），保留代理、证书、超时；
- 429：优先用 pi 的 retry 设置；不满足时在 `streamSimple` 内做指数退避，尊重 `Retry-After`；
- 截断：`stopReason: 'length'` 转成 `AgentEvent.error` 和 `turn.error`；
- 文本模型 fallback：`resolveTextModel` 继续可用，返回 `{ providerId, modelId }` 供 `ModelRuntime.getModel` 使用；
- thinking level 本期固定 `off`，不暴露 UI。

M0 必须验证：

1. `streamSimple` 的签名和 `AssistantMessageEventStream` 事件顺序；
2. `openai-completions` 的 SSE 在 `agnes-ai` 上能正确产出 tool call；
3. 429/超时/取消在自定义 `streamSimple` 下的行为；
4. `ModelRuntime.registerProvider` 的 `models` 字段是否接受 CineLab 的 contextWindow/maxTokens。

### 6.3 工具层

63 个工具全部走 `customTools`，extension 只挂 `tool_call` / `tool_result` 钩子。

```ts
function toPiTool(def: AgentToolDefinition, ctx: ToolContext): ToolDefinition {
  return {
    name: def.name,
    label: def.id,
    description: def.description,
    parameters: Type.Unsafe(def.parameters),
    executionMode: def.requiresConfirm ? 'sequential' : 'parallel',
    execute: async (callId, args, signal) => {
      const call = { callId, name: def.name, args }
      const result = def.executor === 'main'
        ? await executeMainTool(call, ctx.scope)
        : await runRendererTool(call, ctx)
      return result.ok
        ? { content: [{ type: 'text', text: JSON.stringify(result.result ?? { ok: true }) }], details: { ok: true, change: result.change } }
        : { content: [{ type: 'text', text: result.error ?? '工具执行失败' }], details: { ok: false, change: result.change }, isError: true }
    }
  }
}
```

- `runRendererTool` 复用现有 `waitForToolResult`，超时表 `LONG_TOOL_TIMEOUTS` 原样保留；
- 工具错误返回 `isError: true` + structured details，只有不可恢复异常才抛；
- `Type.Unsafe` 是 M0 验证项；被拒的 schema 再单独转 TypeBox；
- 工具清单一致性测试：`AGENT_TOOLS.length === piTools.length`，名称集合完全相等；
- `docs/agent-capabilities.md` 和 `_generated.md` 由 `check:docs` 校验，迁移后同步。

### 6.4 权限、确认、提案、撤销

**权限（B1）**

pi 不自带权限系统，规则仍在 CineLab：

- `profile × permissionMode` 过滤：`filterAgentTools`；
- read-only 模式：写工具不可用；
- scope 校验：项目根、画布节点归属、跨项目路径；
- 业务参数校验：现有 `validate*ToolArgs`；
- 入口统一挂在 extension 的 `tool_call` 钩子上，pi 只负责 `{ block: true, reason }`。

**确认**

```ts
pi.on('tool_call', async (event) => {
  const call = { callId: event.toolCallId, name: event.toolName, args: event.args }
  try {
    assertToolAllowed(call, scope, permissionMode)
  } catch (error) {
    return { block: true, reason: error instanceof Error ? error.message : '工具不可用' }
  }
  const reason = toolConfirmationReason(call)
  if (!reason) return
  const approved = await requestConfirmation(turnId, event.toolCallId, reason)
  if (!approved) return { block: true, reason: '用户取消该操作' }
})
```

- `turnId` / `windowId` 通过 extension closure 注入；
- 需要确认的工具标 `executionMode: 'sequential'`，保持 `pendingConfirm` 单对象；
- 超时 60 秒，超时视为拒绝；
- 确认 UI 保持现有二元卡（允许一次/取消），不引入表单审批。

**提案**

`generation_propose` 的 `execute` 内直接调用现有 `createProposal`：

```ts
const info = getActiveTurnInfo(turnId)
const proposal = await createProposal(root, info.sessionId, draft)
return { content: [{ type: 'text', text: JSON.stringify({ proposalId: proposal.id }) }], details: {} }
```

`getActiveTurnInfo` 从新的 `activeTurns` map 读取，IPC 与前端不变。

**撤销**

- `startTurn` 生成 `turnId`，在 prompt 前 `history.appendCustomEntry('cinelabTurn', { turnId })`；
- 工具返回的 `details.change` 在 `tool_execution_end` 里合并到 `activeTurn.change`；
- `agent_settled` 时构造 `AgentTurn`，发 `turn_end`；
- `agentStore.undoLastTurn` 继续按 `lastTurn.change` 调各 store 的 `undo`，无需改动。

### 6.5 事件映射

| pi 事件 | CineLab 事件 | 说明 |
|---|---|---|
| `message_update` + `text_delta` | `text_delta` | 追加到当前 assistant 消息 |
| `message_update` + `thinking_delta` | `thinking_delta`（新增） | 可选展示，默认折叠 |
| `tool_execution_start` | `tool_start` | 带 callId、name、args |
| `tool_execution_end` | `tool_end` | 带 ok、result/error、change |
| `compaction_start/end` | `compaction`（新增） | UI 显示压缩状态 |
| `queue_update` | `queue`（新增） | 展示 steering/followUp |
| `auto_retry_start` | `retry`（新增） | 展示重试原因 |
| `agent_settled` | `turn_end` | 整轮结束，发完整 `AgentTurn` |
| `message_end` + `stopReason: 'error'` | `error` | 保留错误文本和 partial 输出 |
| `message_end` + `stopReason: 'length'` | `error` + `turn.error` | 明确提示截断 |

约束：

- `turn_start` 仍在 `startTurn` 时发；
- `turn_end` 只在 `agent_settled` 发一次，不能把 pi 的每个 `turn_end` 都映射成 CineLab 回合结束；
- `text_delta` 只来自流式增量，`message_end` 不重复追加全文；
- 新事件在 `agentStore.applyEvent` 里加 `case`，未知事件走 `default` 忽略；
- 错误/取消时保留已输出的 partial 文本，标记为中断。

### 6.6 会话存储

新会话直接写 `.cinelab/agent/sessions/v2/<id>.jsonl`：

```ts
const history = SessionManager.create(cwd, join(root, '.cinelab', 'agent', 'sessions', 'v2'))
```

- `sessionList` 只扫描 v2；
- `sessionLoad` 只读 v2；
- v1 文件原地保留，不删除、不展示、不读取，作为冷备；
- 首次启动不执行迁移扫描，避免大项目启动变慢；
- 不提供 v1 会话的 UI 入口；需要找回时只能手动打开原 JSONL；
- 同会话写入加锁：`session-lock.ts` 用 `proper-lockfile` 锁 `<root>/.cinelab/agent/sessions/v2/<id>.lock`；
- UI 层禁止同一会话在多窗口同时打开（打开时提示“该会话已在另一窗口使用”）。

### 6.7 上下文压缩与统计

- 启用 pi 的 `compaction`：`SettingsManager.inMemory({ compaction: { enabled: true } })`；
- 中文 token 估算：M0 用真实中文会话验证；如果仍按 chars/4 估算导致压缩过晚，使用 `pnpm patch` 修正 `estimateTextChars`（参考 ToonFlow 的 `piCodingAgent.patch`）；
- 压缩触发时发 `compaction` 事件，UI 显示「正在压缩上下文」；
- 压缩失败不阻塞本轮，记录 `turn.error`，会话保留原文；
- 上下文环改用 pi 的真实 `usage` / `contextUsage`，缺失时回退 chars/3 估算；
- 手动压缩按钮调用 pi 的压缩 API；M0 确认 `AgentSession` 是否暴露 `compact()`，没有则保留现有 `compact.ts` 作为手动压缩路径。

### 6.8 自动续跑、重试、截断

**自动续跑**

`AgentSession` 构造时会覆盖 `agent.finishTurn`，因此不能直接赋值；先取出原钩子再包一层：

```ts
const innerFinishTurn = session.agent.finishTurn
session.agent.finishTurn = async (turn, signal) => {
  const decision = await innerFinishTurn?.(turn, signal)
  if (decision) return decision
  const message = turn.message
  if (message.stopReason !== 'stop') return
  if (hasToolCall(message) || turn.toolResults.length > 0) return
  if (!looksLikePreamble(textOf(message))) return
  if (++continueCount > 2) return
  return { action: 'continue' }
}
```

- `looksLikePreamble`：文本以「我先/现在/接下来/让我/需要先」开头，或以「：」结尾，且长度 < 120 字；
- 最多连续 2 次；连续两次无 tool call 且文本高度相似则停止，避免死循环；
- 默认开启，设置中可关闭；
- M0 验证包装后 pi 内部的 `turn_end` 边界派发仍然执行；失败则改用 extension `turn_end` + `session.followUp`。

**重试**

`SettingsManager.inMemory({ retry: { enabled: true, maxRetries: 3 } })`；如果 pi 的 retry 不覆盖 429，在自定义 `streamSimple` 内补退避（尊重 `Retry-After`）。

**截断**

`message_end` 的 `stopReason === 'length'`：

- 发 `error` 事件，文本「模型回复因长度限制被截断」；
- `turn.error` 写入；
- 可选自动续写一次，必须标记为续写，避免无限循环。

### 6.9 子 Agent（预留，不在本期）

pi 的 `createAgentSession` 支持子会话和 `SessionManager` 分支。CineLab 后续可加：

- 长片场景拆分为多个 Agent；
- 画布节点级 AI（参考 ToonFlow `nodeAi.ts`）；
- 但本期不做，避免范围膨胀。

## 7. 工具迁移清单

按域分批迁移，每批完成后跑 `tools.test.ts` 和手工 smoke。

### 7.1 画布（12）

`canvas_get`、`canvas_update_title`、`canvas_update_text`、`canvas_move_node`、`canvas_add_node`、`canvas_connect`、`canvas_remove_edge`、`canvas_delete_node`、`canvas_group`、`canvas_ungroup`、`canvas_node_operations`、`canvas_node_operation`

- 全部 renderer 执行；
- 确认：`canvas_remove_edge`、`canvas_update_text`、`canvas_delete_node`；
- `canvas_node_operations` 只读；`canvas_node_operation` 按 operation 决定是否确认。

### 7.2 生成与资产（3）

`generation_catalog`、`library_search`、`generation_propose`

- `generation_catalog` / `library_search` 主进程；
- `generation_propose` 走主进程提案服务；
- 迁移时保留 `refNodeIds`、`libraryRefs`、`operationId`、`itemId`、`mask`。

### 7.3 导演台（22）

`stage_get`、`stage_capabilities`、`stage_add_object`、`stage_transform_object`、`stage_add_camera`、`stage_transform_camera`、`stage_add_shot`、`stage_update_shot`、`stage_remove_shot`、`stage_set_camera_track`、`stage_set_background`、`stage_update_object`、`stage_export_preview`、`stage_set_active_camera`、`stage_remove_object`、`stage_set_shot_intent`、`stage_clear_shot_intent`、`stage_auto_coverage`、`stage_dialogue_coverage`、`stage_set_world`、`stage_randomize_world`、`stage_from_scene_image`

- 除 `stage_capabilities` 外均 renderer；
- 确认：`stage_remove_shot`、`stage_set_camera_track`、`stage_export_preview`、`stage_remove_object`（以及 `stage_from_scene_image` 的模型调用，按现有规则复核）。

### 7.4 剪辑室（17）

`timeline_get`、`timeline_select_clips`、`timeline_set_video`、`timeline_move_clips`、`timeline_trim_clip`、`timeline_split_clips`、`timeline_split_by_shots`、`timeline_beat_markers`、`timeline_beat_split`、`timeline_remove_clips`、`timeline_update_clip`、`timeline_set_track`、`timeline_add_marker`、`timeline_auto_subtitles`、`timeline_remove_silence`、`timeline_set_transition`、`timeline_export`

- 全部 renderer；
- 确认：`timeline_split_by_shots`、`timeline_beat_split`、`timeline_remove_clips`、`timeline_remove_silence`、`timeline_export`；
- 长任务超时沿用 `LONG_TOOL_TIMEOUTS`。

### 7.5 拉片（5）

`film_study_get`、`film_study_auto`、`film_study_update_segment`、`film_study_extract_subtitles`、`film_study_export`

- 全部 renderer；
- 确认：`film_study_auto`、`film_study_extract_subtitles`；导出走原生保存对话框。

### 7.6 能力与技能（4）

`capability_catalog`、`capability_search`、`skill_list`、`skill_read`

- `capability_catalog` renderer；其余主进程；
- 只读，无确认。

## 8. 影响模块

| 模块 | 影响 |
|---|---|
| 主进程 Agent | `runtime.ts` 重写；新增 `agent/pi/*`；`legacy/` 保留到回归通过 |
| 主进程模型 | `model.ts` 保留模型解析；新增 `pi/model-runtime.ts`；文本请求切自定义 `streamSimple` |
| 主进程会话 | `session.ts` 改为 v2 读写，不读取 v1；新增 `session-lock.ts`；`compact.ts` 由 pi compaction 替代 |
| 主进程工具 | 63 个工具定义改为 TypeBox；`main-tools.ts` 保留 |
| 主进程权限 | 新增 `pi/permissions.ts`，规则仍在 CineLab |
| 渲染进程 | `agentStore.applyEvent` 增加新事件；`AgentPanel` 增量展示 thinking/compaction/retry |
| IPC | 接口不变；新增可选事件不破坏旧前端 |
| 打包 | `electron.vite.config.ts`、`electron-builder` files；可能需要主进程 ESM 化 |
| 文档 | `06-agent.md`、`08-capabilities.md`、`11-feature-index.md`、`agent-capabilities.md` |

## 9. 实施计划

| 阶段 | 任务 | 产出 | 预估 |
|---|---|---|---|
| **M0** | 安装依赖；Electron `require`/ESM spike；`createAgentSession` 最小闭环；`streamSimple` 注册；`Type.Unsafe` 验证；`finishTurn` 包装验证；打包体积实测 | `docs/agent-runtime-v3-spike.md` + 未合并 demo | 3 天 |
| **M1** | `pi/runtime.ts`、`session.ts`、`session-lock.ts`、`events.ts`、`permissions.ts`、`confirm.ts`、`change.ts`、`proposals.ts` 骨架 | 单轮文本 + 工具 + 确认 + 提案可跑 | 4 天 |
| **M2** | 63 个工具迁移；清单一致性测试；长任务超时 | `pi/tools/*` 全量 | 5–7 天 |
| **M3** | `agentStore` 新事件；`AgentPanel` thinking/compaction/retry；旧会话入口下线 | UI 适配 | 1–2 天 |
| **M4** | 四空间回归；`finishTurn` 自动续跑；429/length | 回归报告 | 3 天 |
| **M5** | 打包、启动时间、文档回写、删除 `legacy/` | 可合并分支 | 1–2 天 |

**总计 16–19 天**。M0 功能不通过时，不回退代码，先拿结论找用户确认下一步（改方案 / 回退 D2）；包体不作为回退条件。

### M0 验证清单

详见 `docs/agent-runtime-v3-spike.md`。

- [x] CJS `require` 失败已确认；CJS 内 `await import()` 成功
- [x] `createAgentSession` + `SessionManager.inMemory()` + `customTools` 跑通「文本 → 工具 → 文本」
- [x] 自定义 `ModelRuntime.registerProvider` + `streamSimple` 跑通
- [x] `Type.Unsafe(JSON Schema)` 被 pi 工具接受并执行
- [x] 取出原 `session.agent.finishTurn` 再包装后，原钩子仍被调用
- [x] `SessionManager.create(cwd, '<root>/.cinelab/agent/sessions/v2')` 生效
- [x] `AgentSession.compact()` 存在
- [x] `pnpm build` 通过
- [ ] `dist:win` 体积实测（仅记录，不阻断；当前机器 EXDEV，待 CI/另一台机器复测）
- [ ] 中文 compaction 的 token 估算验证

### M1 进度（2026-11-19）

已完成：

- `pi/loader.ts` 动态 import ESM-only 的 pi；
- `pi/model-runtime.ts` 自定义 `streamSimple`，复用 `httpFetch`；
- `pi/runtime.ts` 替换 IPC 入口，保留 `startTurn/cancelTurn/resolve*`；
- `pi/session.ts` v2 会话、`pi/session-lock.ts` 单写者锁；
- `pi/tools.ts` 63 工具通过 `Type.Unsafe` 注册为 `customTools`；
- `pi/permissions.ts` + extension `tool_call` 确认；
- `thinking/compaction/retry/queue` 事件已发送，前端展示留 M3。

已验证：

- mock OpenAI 服务下 `canvas_get` 读取、`canvas_delete_node` 确认→执行→撤销、自动续跑、v2 会话落盘均通过；
- `pnpm typecheck`、`pnpm build`、`pnpm check:docs` 通过。

待完成：

- M2：63 个工具逐项复核、长任务超时、能力审计；
- M3：前端新事件展示、旧会话入口下线；
- M4：真实文本模型（非 mock）回归；当前环境 safeStorage 跨实例解密失败，需在正式 userData 或 CI 跑。

### M2 进度（2026-11-19）

- 63 个工具通过 `pi/tools.ts` 的通用适配器注册，不再逐个重写；
- 一致性测试覆盖 4 个 profile × 3 个 permissionMode，工具名称集合与 `AGENT_TOOLS` 完全一致；
- 6 个主进程工具与 `executeMainTool` 对齐：`generation_catalog`、`library_search`、`capability_search`、`skill_list`、`skill_read`、`stage_capabilities`；
- 确认工具集合、renderer 失败映射 `isError`、长任务超时表均有测试；
- 当前所有工具统一 `sequential`，避免单个 `pendingConfirm` 被并行工具覆盖；并行化留到 M4 回归后再评估。

### M3 进度（2026-11-19）

- `agentStore` 新增 `activity`：thinking、compaction、retry、steering/followUp 计数；
- `AgentPanel` 在输入框上方显示压缩、重试、排队和可折叠的思考过程；
- `tool_start` / `tool_end` 按 `turnId + callId` 匹配，避免跨回合误更新；
- `ThoughtGroup` 的 key 加入 `turnId`，修复跨回合重复 `callId` 导致的 React key 警告；
- 会话列表和加载只走 v2，旧 v1 入口不再出现；
- `pnpm typecheck`、`pnpm check:ui` 通过；待 E2E 复测。

### M4 进度（2026-11-19）

- 真实 Agnes 模型：
  - 开发实例 `canvas_get` 通过，正确返回节点数；
  - 开发实例 `stage_add_object` 通过，`stageUpdated=true`；
- 打包冒烟（`asar: false` + `electron.exe resources/app`）：真实模型 `canvas_get` 通过，pi 动态 import 与 v2 会话在打包后可用；
- 安装包体积：asar 构建的 exe 171.3MB、zip 220.1MB、app.asar 128.3MB；
- 阻塞：
  - 本机透明加密导致 `asar: true` 时 app 文件在 app.asar 内偏移错乱，生成的安装包不可用；需要在 CI 或加密白名单环境重建；
  - `CineLab.exe` 直接构建仍遇 `EXDEV`；用预解压 `electronDist` 可绕过并产出安装包；
- 四空间回归：
  - canvas：真实模型 `canvas_get` 通过；
  - stage：真实模型 `stage_add_object` 通过；
  - timeline：合成 5 秒视频片段，`timeline_get` / `timeline_set_video` 桥接测试通过；
  - film：合成 `FilmStudy`，`film_study_get` 桥接测试通过；
- 前端 activity 事件 dispatch 已验证，待真实 UI 截图复测。

## 10. 测试与验收

### 10.1 单元测试

- `pi-runtime.test.ts`：startTurn、cancel、工具确认、超时、错误、windowId 校验
- `pi-tools.test.ts`：63 个工具名称/参数/确认规则与 `AGENT_TOOLS` 一致
- `pi-events.test.ts`：pi 事件 → `AgentEvent` 的顺序与字段
- `pi-permissions.test.ts`：profile/mode/scope/参数校验、确认文案
- `pi-lock.test.ts`：同会话单写者、跨会话并发
- `pi-continue.test.ts`：preamble 检测、最多 2 次、无进展停止
- 现有 `tools.test.ts`、`proposals.test.ts` 保留

### 10.2 集成测试

用 mock `streamSimple`（不请求真实模型）跑：

1. 纯文本回合；
2. 单工具 + 结果；
3. 并行工具；
4. 工具报错；
5. 用户取消确认；
6. abort；
7. `length` 截断；
8. 自动续跑一次后成功；
9. 同会话并发第二个请求被拒绝。

### 10.3 回归矩阵

| 空间 | 任务 | 通过标准 |
|---|---|---|
| 画布 | 整理选中节点、创建文本节点并连线 | 节点/连线/撤销正确 |
| 时间线 | 移动片段、设置画幅 | 时长/撤销正确 |
| 导演台 | 菜市场 10 秒预演 | 世界/人物/机位/镜头/导出 |
| 拉片 | 读取已有拉片、更新段落 | 快照/撤销正确 |
| 提案 | 生成一张图 | 提案卡、确认、提交、写回 |
| 会话 | 新建 v2 会话、列出、重命名、删除 | 只列 v2，不出现 v1 |

### 10.4 性能与打包

- 冷启动 ≤ +500ms；
- 首 token 延迟不高于现网 1.2 倍；
- `dist:win` 体积增量仅记录，不设阈值；
- 不裁剪 pi 依赖，接受完整依赖树。

## 11. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| Electron CJS 无法 `require` ESM | 已确认 | 中 | M0 已验证 CJS 内 `await import()` 可用；ESM 化降为最后手段 |
| pi 依赖树导致包体变大 | 高 | 低 | 接受增量，不裁剪、不因包体回退 D2；安装包实测值仅记录 |
| electron-builder `EXDEV` 导致安装包失败 | 中 | 中 | 当前机器复现；待 CI/另一台 Windows 复测 |
| 1.5.2 API 与 ToonFlow 0.85.1 不同 | 中 | 中 | 以 1.5.2 的 `dist/index.d.ts` 为准；M0 锁定签名 |
| 63 个工具迁移遗漏 | 中 | 高 | 名称集合测试 + 能力审计测试 |
| 确认与并行工具冲突 | 中 | 中 | 确认类工具 `executionMode: 'sequential'` |
| `finishTurn` 包装破坏内部边界 | 中 | 中 | M0 验证 inner 钩子；失败退 extension `turn_end` + `followUp` |
| 同会话多窗口写冲突 | 中 | 高 | `proper-lockfile` + UI 禁止同会话多开 |
| turnId 与 pi run 边界不一致 | 中 | 中 | 外层 `activeTurns` 维护；工具 change 按 turnId 合并 |
| 中文 compaction 偏差 | 中 | 中 | M0 验证；必要时 patch |
| 模型仍不发 tool call | 高 | 高 | 换模型 + `finishTurn` 自动催跑；重构不承诺根治 |
| 用户找不到旧会话 | 中 | 低 | 发布说明明确「旧会话不再展示，文件保留在原目录」 |

## 12. 回滚方案

- 开发期：`feat/agent-runtime-v3` 分支，`legacy/` 保留；通过 `CINELAB_AGENT_RUNTIME=legacy` 切回旧实现（仅开发/测试用）。
- 合并前：删除 `legacy/` 和环境变量，避免双轨。
- 发布后：若出现严重问题，回滚到 v0.3.1 的 tag；v2 文件保留，v1 冷备文件不动。回滚只保证应用可用，不保证 v2 会话在旧版可读。

## 13. 决策记录

### 13.1 范围与资产

| 主题 | 决策 |
|---|---|
| 子 Agent / Agent Team / MCP | 本期不做，v3.1 再评估 |
| 技能 | 保留 CineLab 三级目录和技能管理，读成 pi `Skill` 后通过 `skillsOverride` 注入 |
| 系统提示词 | 保留 CineLab 的 canvas/clip 提示词，用 `systemPromptOverride` 注入；不引入 AGENTS.md 运行时上下文 |
| Profile | 补齐 `stage` / `film` 的提示词和工具过滤，不改 UI 入口 |
| 权限设置 | 保持只读/当前空间两档，不引入 per-tool 设置 |
| 确认 UI | 保持二元卡（允许一次/取消），不引入表单审批 |

### 13.2 运行时与工具

| 主题 | 决策 |
|---|---|
| 工具注册 | 63 个工具走 `customTools`；extension 只挂 `tool_call` / `tool_result` |
| 工具参数 | `Type.Unsafe(JSON Schema)` + 现有 `validate*ToolArgs`；被拒的 schema 再单独转 TypeBox |
| 工具错误 | 返回 `isError: true` + structured details；只有不可恢复异常才抛 |
| 确认并发 | 需确认工具 `executionMode: 'sequential'`，`pendingConfirm` 保持单对象 |
| 自动续跑 | 包装原 `finishTurn`；默认开启，最多 2 次，设置可关 |
| 并发 | 同会话单回合 + 会话锁；跨会话/窗口并发；`ActiveTurn` 加 `windowId` 校验 |

### 13.3 模型、会话、发布

| 主题 | 决策 |
|---|---|
| 文本请求层 | 自定义 `streamSimple`，复用 `httpFetch`；不注入 fetch |
| 模型协议 | 只支持 `openai-completions`；`models.json` 新增可选 `protocol`，默认该值 |
| 上下文环 | 用 pi 真实 `usage` / `contextUsage`，缺失时回退估算 |
| 会话目录 | `SessionManager.create(cwd, '<root>/.cinelab/agent/sessions/v2')` |
| 旧会话 | 不迁移、不展示、不读取；v1 文件原地冷备 |
| 包体 | 接受 pi 依赖带来的增大；不裁剪、不因包体回退 D2 |
| 分支 | `feat/agent-runtime-v3` 长分支，M4 通过后合并 main |
| Feature flag | 只在开发/测试期使用，合并前删除 |
| M0 交付物 | `docs/agent-runtime-v3-spike.md` + 未合并 demo |
| 回滚 | 接受回滚后 v2 会话在旧版不可读 |

## 14. 参考

- pi SDK：`https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md`
- pi Agent loop：`https://github.com/earendil-works/pi/blob/main/packages/agent/README.md`
- pi 会话格式：`https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md`
- pi 安全模型：`https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md`
- ToonFlow 主助手：`apps/server/src/agent/runtime/index.ts`、`model.ts`、`resources.ts`、`requests.ts`
- ToonFlow 权限与审批：`apps/server/src/agent/tools/index.ts`、`apps/server/src/agent/bridge/question.ts`、`packages/tools/canvas/src/runtime.ts`
- ToonFlow 节点级 Agent：`packages/nodeScaffold/src/nodeAi.ts`
- ToonFlow 补丁：`patches/piAgentCore.patch`、`patches/piCodingAgent.patch`
- CineLab 现状：`src/main/agent/runtime.ts`、`session.ts`、`compact.ts`、`tools/`
- CineLab 工具清单：`docs/agent-capabilities.md`、`docs/code-map/_generated.md`
