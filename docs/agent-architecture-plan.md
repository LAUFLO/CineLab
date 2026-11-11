# CineLab Agent 架构方案（设计 + 实施状态）

日期：2026-11-08
状态：**已实施 Phase 1–4**（2026-11-11，`main` @ `b76a064`）
适用版本：`main` @ `b76a064`
范围：Agent 运行时、工具协议、权限、确认、回合事务、会话、上下文、技能、IPC
关联文档：`docs/agent-capabilities.md`（当前工具清单）、`docs/agent-capability-plan.md`（分阶段记录）、`docs/agent-full-scope.md`、`docs/agent-plan.md`、`docs/director-stage-plan.md`

> 本文件前半部分保留 2026-11-08 的架构设计；实际落地以第 0 节「实施状态」和 `docs/agent-capabilities.md` 为准。

## 0. 实施状态（2026-11-11）

### 已落地

- **运行时**：`src/main/agent/runtime.ts`，自研循环、SSE 流式、工具调用、取消、超时、会话历史。
- **工具注册**：`src/main/agent/tools.ts`，当前注册 56 个工具；`src/main/agent/capabilities/` 提供能力投影和关键词搜索。
- **Profile**：`canvas` / `clip` / `film` / `stage`。当前主入口使用 `canvas` 和 `clip`；拉片和导演台能力挂在对应 scope。
- **工具桥**：`src/renderer/src/agent/canvasBridge.ts`、`timelineBridge.ts`、`stageBridge.ts`、`filmBridge.ts`。
- **节点操作桥**：`node-operation-runner.ts`，UI 和 Agent 共用；17 个操作可直接执行，8 个模型类操作通过 `generation_propose`，3 个蒙版操作保留 UI。
- **确认**：`toolConfirmationReason` + `agent:confirm`，删除、覆盖、切分、导出、长任务按要求确认。
- **回合撤销**：画布 / 时间线 / 场景使用 `turnId` 合并历史；拉片使用 study 快照；`AgentTurnChange` 记录 `timelineUpdated / stageUpdated / filmUpdated`。
- **会话**：项目内 JSONL；支持历史、压缩、模型切换、技能 pin。
- **技能**：内置 / 全局 / 项目三级目录，支持 SKILL.md、references、assets、导入导出。
- **生成提案**：`generation_propose` 两段式，支持 `operationId` / `itemId` / `mask`，确认后提交。

### 当前限制

- 蒙版类节点操作（重绘 / 擦除 / 元素编辑）仍需 UI 涂抹。
- 真实 tokenizer、动态工具暴露和上下文预算仍是简化实现。
- 拉片分析包导入仍走界面文件对话框。
- 导演台对象动作轨和独立灯光实体未开放给 Agent。
- Agnes 视频队列 503 的真实视频补测仍待完成。

### 验证记录

- `docs/agent-capabilities.md`
- `.opencode/handover/evidence/AGENT-CAPABILITY-PHASE1.md`
- `.opencode/handover/evidence/AGENT-NODE-OPERATIONS-PHASE2.md`
- `.opencode/handover/evidence/AGENT-PHASE3.md`
- `.opencode/handover/evidence/AGENT-REAL-MODEL-SMOKE-1.md`
- `.opencode/handover/evidence/AGENT-GENERATION-OPS-1.md`

## 0A. 原始结论（2026-11-08）

> 以下是设计阶段的决策记录，保留作为架构来源；实际实现以第 0 节为准。

本方案先定 8 个决策，5 个待验证点留给 spike。

### 0.1 已定决策

1. **自研 AgentRuntime**，不引入 `@earendil-works/pi-coding-agent` 整包。
2. **文本模型复用现有 provider 层**，补 `chatWithTools`；`pi-ai` 只作为备选。
3. **会话用 JSONL**，带 `id/parentId`、`turn`、`compaction`、`context_edit`，不引入 SQLite。
4. **工具注册表统一声明** `id / readOnly / scope / params / modes / replay`。
5. **权限 scope 由主进程构造**，渲染进程只传 `profileId`，不能自定义系统提示或工具白名单。
6. **回合事务**：一轮 Agent 操作打包成一条撤销记录，带变更摘要。
7. **生成提案两段式**：`propose` 只登记不扣费，`submit` 用户确认后执行。
8. **技能三级目录**：内置 / 全局 / 项目，`SKILL.md` + 按需读取 + 版本 pin + 安全校验。

### 0.2 待 spike 验证

| 编号 | 待验证 | 影响 | 结果 |
|---|---|---|---|
| S1 | Electron 45 主进程的 Node 版本 / ESM 兼容 | 决定运行时形态 | 通过 |
| S2 | 模型请求能否走 Electron `net.fetch`，代理是否生效 | 决定模型请求层 | 通过：本地真实代理收到 `CONNECT api.agnes-ai.cn:443` |
| S3 | 原生 function calling 稳定性 | 决定是否需要 JSON 兜底 | 通过：mock + Agnes 3.0 Flash |
| S4 | 打包后体积 / asar / 原生依赖 | 决定是否引入 `pi-agent-core` | 通过：主进程产物约 357KB |
| S5 | `pi-agent-core` / `pi-ai` 的实际集成成本 | 决定自研循环还是薄封装 | 不采用，暂不评估 |

## 1. 技术选型

### 1.1 候选对比

| 方案 | 内容 | 优点 | 风险 |
|---|---|---|---|
| A. 自研 AgentRuntime | 自写循环、流式、工具、会话、上下文 | 完全可控、统一模型栈、包体小 | 要自己处理协议差异、压缩、恢复 |
| B. `pi-agent-core` + `pi-ai` | 用 pi 的循环/状态/模型协议，外层自研 | 少写基础设施、压缩和会话可借鉴 | 双模型栈、代理注入、API 演进 |
| C. `pi-coding-agent` 整包 | 直接用完整 coding agent | 功能全、生态成熟 | 24MB、抽象错位、大量无用能力 |

### 1.2 决策

采用 **A，B 作为备选**。

- 默认自研 AgentRuntime。
- 如果 spike 证明自研循环成本过高，再引入 `pi-agent-core` + `pi-ai`，封装在 `AgentLoop` / `ModelAdapter` 后面。
- `pi-coding-agent` 不进入依赖。

### 1.3 理由

1. CineLab 的工具是画布、时间线、导演台、生成，不是文件编辑和 shell。
2. 现有 provider 层已经覆盖 OpenAI 兼容、可灵、火山、MiniMax、Vidu、http-template；引入 pi 会形成两套模型栈。
3. 权限、确认、撤销、生成提案是业务核心，pi 不提供，必须自研。
4. 24MB 的 coding agent 包体和 Electron 打包风险不划算。
5. 项目现有风格是自研核心能力（ffmpeg、timeline、provider、导出），Agent 运行时保持一致。

### 1.4 参考 PI 的部分

只借鉴设计，不复制整包：

- 上下文压缩的切点算法和摘要格式。
- 工具结果截断（`truncate.ts` 纯函数可复制，保留 MIT 声明）。
- 会话 JSONL 树结构、`compaction`、`context_edit`、`usage`。
- token 估算和上下文用量计算。
- 流式事件和工具结果回填的设计。

### 1.5 不采用的部分

- coding agent 的 read/bash/edit/write 工具。
- TUI、MCP 宿主、codemode、photon。
- 文件系统工作区抽象。
- pi 的权限模型（它本身不自带权限系统）。

## 2. 运行时架构

### 2.1 进程与职责

```
渲染进程
  ├─ 助手 UI（对话、工具卡、提问卡、方案卡、计划、变更摘要）
  ├─ 上下文摘要构建（画布/时间线/导演台/拉片）
  ├─ 工具结果展示
  └─ 用户确认交互

主进程
  ├─ AgentRuntime（循环、流式、工具调用、取消、重试）
  ├─ ModelAdapter（现有 provider / 可选 pi-ai）
  ├─ ToolRegistry（注册、过滤、校验、执行）
  ├─ PermissionScope（会话/回合级）
  ├─ TurnTransaction（回合记录、变更摘要、撤销）
  ├─ SessionStore（JSONL）
  ├─ ContextBudget（预算、裁剪、压缩）
  ├─ SkillService（三级目录、读取、导入、版本）
  └─ ProposalService（生成提案、提交、幂等）

共享层
  ├─ src/shared/agent.ts
  ├─ src/shared/agent-tools.ts
  ├─ src/shared/agent-session.ts
  └─ src/shared/skills.ts
```

原则：

- 渲染进程不直接访问文件系统或外部 API。
- 模型请求、工具执行、会话存储、权限判断都在主进程。
- 渲染进程只负责 UI 和业务摘要；摘要由主进程校验后使用。
- 工具执行结果由主进程投影后再返回模型。

### 2.2 一轮对话的生命周期

```text
用户发消息
  → 渲染进程构建业务摘要（画布/时间线/导演台/拉片）
  → 主进程创建 turn，构造 scope
  → AgentRuntime 组装系统提示 + 工具 schema + 上下文
  → 调用模型（流式）
  → 模型返回 tool calls
  → ToolRegistry 校验参数、权限、scope、幂等
  → 执行工具，记录变更和审计
  → 工具结果投影后回填模型
  → 继续循环，直到最终回复 / 预算耗尽 / 用户取消
  → 写 turn 记录、变更摘要、usage
  → 推送 turn_end
  → 用户确认生成提案后 submit
```

### 2.3 事件类型

```ts
type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  | { type: 'tool_start'; callId: string; name: string; args: unknown }
  | { type: 'tool_end'; callId: string; status: 'ok' | 'error'; result?: unknown; error?: string }
  | { type: 'question'; callId: string; question: AgentQuestion }
  | { type: 'proposal'; proposal: AgentProposal }
  | { type: 'plan'; plan: AgentPlan }
  | { type: 'turn'; turn: AgentTurn }
  | { type: 'error'; message: string; retryable: boolean }
  | { type: 'done' }
```

要求：

- 流式输出，前端可增量渲染。
- 停止后立即中止请求，丢弃未完成工具计划。
- 断线重连能恢复当前 turn 的已收到内容。
- 工具事件包含 `callId`，便于前端合并。

### 2.4 预算

| 预算 | 默认值 | 说明 |
|---|---|---|
| `maxRequestsPerTurn` | 20 | 单轮模型请求数 |
| `maxToolStepsPerTurn` | 20 | 单轮工具步数 |
| `maxContextTokens` | 24k | 单轮输入上限 |
| `maxToolResultBytes` | 4k | 单次工具结果 |
| `maxTurnDurationMs` | 300s | 单轮超时 |
| `maxGenerationsPerTurn` | 0 | 生成必须走提案，不直接执行 |

超预算时：

- 先分页/裁剪工具结果。
- 再压缩历史。
- 仍超限则拒绝并提示，不静默截断。

### 2.5 错误与恢复

| 错误 | 处理 |
|---|---|
| 模型请求失败 | 可重试，指数退避；不重复发送已完成工具调用 |
| 工具参数错误 | 返回明确错误，模型可修正 |
| 权限拒绝 | 返回 `scope_denied`，不执行 |
| revision 冲突 | 重读最新状态，拒绝旧写入 |
| 用户取消 | 中止请求，不落库写操作 |
| 超时 | 中止，标记 turn `timeout` |
| 生成任务完成 | 通过事件唤醒新 turn，检查结果 |

## 3. 工具协议

### 3.1 ToolDefinition

```ts
interface AgentTool {
  id: string
  label: string
  profiles: AgentProfileId[]
  readOnly: boolean
  scope: AgentToolScope
  modes: PermissionMode[]
  parameters: Record<string, unknown> // JSON Schema
  replay: 'safe' | 'unsafe'
  requiresConfirm?: boolean
  execute(ctx: AgentToolContext, args: unknown): Promise<AgentToolResult>
  resultView?: (result: AgentToolResult) => unknown
}

type AgentProfileId = 'canvas' | 'clip' | 'film' | 'stage'
type AgentToolScope = 'canvas' | 'timeline' | 'stage' | 'film' | 'project' | 'generation' | 'skill'
type PermissionMode = 'read-only' | 'current' | 'full-access'
```

### 3.2 注册表

- 工具启动时注册，按 `profiles` 和 `modes` 过滤。
- 系统提示里的工具列表只包含当前 profile 可见工具。
- 参数用 zod 校验，失败返回 `invalid_params`。
- 写工具必须带 `operationId`，用于幂等。
- 写工具必须带 `expectedRevision`（画布/时间线/导演台）。
- 结果经过 `resultView` 投影，不返回完整文档。

### 3.3 工具结果

```ts
interface AgentToolResult {
  ok: boolean
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>
  summary?: string
  revision?: number
  changed?: {
    createdNodeIds?: string[]
    updatedNodeIds?: string[]
    deletedNodeIds?: string[]
    createdEdgeIds?: string[]
    deletedEdgeIds?: string[]
    timelineUpdated?: boolean
    stageUpdated?: boolean
  }
  warnings?: string[]
  error?: { code: AgentErrorCode; message: string; retryable?: boolean }
}
```

### 3.4 错误码

```ts
type AgentErrorCode =
  | 'invalid_params'
  | 'scope_denied'
  | 'not_found'
  | 'stale_revision'
  | 'conflict'
  | 'budget_exceeded'
  | 'requires_confirm'
  | 'unsupported'
  | 'cancelled'
  | 'internal'
```

### 3.5 工具分组

| 前缀 | 域 | 示例 |
|---|---|---|
| `canvas.` | 画布 | `canvas.get`、`canvas.addNode`、`canvas.connect`、`canvas.updateNode` |
| `timeline.` | 剪辑 | `timeline.get`、`timeline.moveClips`、`timeline.autoSubtitles`、`timeline.removeSilence`、`timeline.setTransition`、`timeline.export` |
| `stage.` | 导演台 | `stage.get`、`stage.addObject`、`stage.renderPreview` |
| `film.` | 拉片 | `film.get`、`film.readFrames`、`film.exportAnalysis` |
| `project.` | 项目 | `project.get`、`project.searchAssets`、`project.export` |
| `generation.` | 生成 | `generation.catalog`、`generation.propose`、`generation.submit` |
| `library.` | 资产库 | `library.search` |
| `skill.` | 技能 | `skill.list`、`skill.read`、`skill.install` |

具体工具清单见 `docs/agent-full-scope.md` C 域，不在这里重复。

## 4. 权限与确认

### 4.1 Profile

| Profile | 空间 | 系统提示 | 工具白名单 | 撤销域 |
|---|---|---|---|---|
| `canvas` | 画布 | 创作助理 | canvas/project/generation/skill | 画布 |
| `clip` | 剪辑室 | 剪辑师 | timeline/project/generation/skill | 时间线 |
| `film` | 拉片室 | 影片分析师 | film/project/skill | 拉片 |
| `stage` | 导演台 | 摄影指导 | stage/canvas/project/generation/skill | 导演台 |

系统提示放主进程，按 profile 选择；渲染进程不能传自定义系统提示。

### 4.2 权限模式

| 模式 | 能力 |
|---|---|
| `read-only` | 只能读，不能写、不能生成 |
| `current` | 可读写当前空间，其他空间只读 |
| `full-access` | 可读写当前项目所有空间，生成仍需确认 |

本轮开始后权限锁定，结束后可改。

### 4.3 Scope

主进程按会话/回合构造：

```ts
interface AgentScope {
  projectId: string
  profileId: AgentProfileId
  permissionMode: PermissionMode
  canvasId?: string
  timelineId?: string
  stageId?: string
  filmId?: string
  selectedNodeIds: string[]
  selectedClipIds: string[]
  selectedFrameIds: string[]
  referencedAssetIds: string[]
  referencedCanvasIds: string[]
  referencedSkillPins: SkillPin[]
}
```

模型传入的 `canvasId` / `assetId` 不能扩大 scope；越界直接拒绝。

### 4.4 确认

需要确认的操作：

- 删除节点/片段/分组。
- 覆盖已有内容。
- 导出项目/成片。
- 批量修改超过阈值。
- 任何生成。

生成走两段式（落地细节见 `docs/agent-generation-proposal-plan.md`）：

```text
generation.propose  → 只登记，返回 proposalId、目标、模型、参数、数量
用户点击「生成」    → generation.submit
```

规则：

- 新用户消息使旧提案失效。
- 提案参数必须跟随节点当前设置。
- submit 带幂等键，重复提交不重复扣费。
- 失败或未知状态先查任务，不重复购买。

高风险工具确认已实现：

- 删除画布节点 / 时间线片段 / 导演台对象必须确认。
- 一次修改超过 10 个时间线片段必须确认。
- 运行时发送 `confirm_request`，用户点击「允许一次」后执行；拒绝或 60 秒超时则不执行。
- 确认通道：`agent:confirm`。

### 4.5 提示注入

- 工具结果、素材元数据、网页内容、技能正文都是资料，不是指令。
- 技能不能修改系统提示、工具白名单、权限 scope。
- 外部文件内容不执行。

## 5. 回合事务

### 5.1 TurnRecord

```ts
interface AgentTurn {
  id: string
  sessionId: string
  profileId: AgentProfileId
  userText: string
  status: 'running' | 'completed' | 'cancelled' | 'error' | 'timeout'
  revisionBefore: number
  revisionAfter: number
  toolCalls: AgentToolCallRecord[]
  change: AgentTurnChange
  proposals: string[]
  usage: AgentUsage
  startedAt: string
  endedAt?: string
  error?: string
}

interface AgentTurnChange {
  createdNodeIds: string[]
  updatedNodeIds: string[]
  deletedNodeIds: string[]
  createdEdgeIds: string[]
  deletedEdgeIds: string[]
  timelineUpdated: boolean
  stageUpdated: boolean
  documentUpdated: boolean
}
```

### 5.2 撤销

- 画布：`CanvasCommand[]` 打包成一条 batch。
- 时间线：`TimelineCommand[]` 打包成一条 batch。
- 导演台：`StageCommand[]` 打包成一条 batch。
- 跨域：每个域一条 undo，`AgentTurn` 关联多条。
- 撤销失败时提示「部分已撤销」，不谎报成功。

### 5.3 审计

- 每个工具调用记录：`callId`、工具名、参数、结果摘要、耗时、错误、是否重放。
- 写入会话 JSONL 的 `turn` 条目。
- 诊断包可导出，敏感信息脱敏。

## 6. 会话与恢复

### 6.1 存储

```
<project>/.cinelab/agent/sessions/<sessionId>.jsonl
<project>/.cinelab/agent/proposals/<proposalId>.json
<userData>/skills/                    # 全局技能
<project>/.cinelab/skills/           # 项目技能
<project>/.cinelab/stages/<id>.json  # 导演台场景
<project>/.cinelab/timelines/<id>.json
```

会话按项目存储，随项目导出；全局技能不随项目导出。

### 6.2 Entry 类型

| 类型 | 作用 |
|---|---|
| `session` | 文件头：版本、id、cwd、项目路径 |
| `message` | 用户/助手消息 |
| `tool` | 工具调用与结果 |
| `turn` | 回合记录 |
| `compaction` | 压缩摘要与 `firstKeptEntryId` |
| `context_edit` | 只改未来上下文，不改原始历史 |
| `usage` | token/费用记账 |
| `model_change` | 模型切换 |
| `skill_pin` | 技能版本 pin |
| `plan` | 计划状态 |
| `proposal` | 生成提案状态 |
| `custom` | 扩展状态，不进模型上下文 |

### 6.3 分支

- 每条 entry 带 `id` / `parentId`。
- 支持从任意用户消息分支。
- 分支不复制项目数据，只复制会话。

### 6.4 压缩

参考 PI：

- 触发：`contextTokens > contextWindow - reserveTokens`，默认 reserve 16k。
- 保留最近约 20k token 原文。
- 切点只在 user/assistant/custom 消息，不在 tool result。
- 摘要格式改成创作版：

```md
## 创作目标
## 已确认设定
## 已完成素材
## 进行中
## 关键决策
## 下一步
## 需要保留的上下文
## 技能
```

- `compaction` 条目存 `summary`、`firstKeptEntryId`、`tokensBefore`、`usage`。
- 重复压缩从上次 `firstKeptEntryId` 开始。
- 摘要失败（空摘要、length 截断）不落盘。
- 技能正文在压缩后补回。

### 6.5 恢复

| 场景 | 处理 |
|---|---|
| 应用重启 | 恢复会话历史；未完成 turn 标记 `interrupted` |
| 生成任务完成 | 通过事件唤醒，检查结果；不重复提交 |
| 工具执行中崩溃 | 标记 `unknown`，提示核对，不自动重放写操作 |
| 会话文件损坏 | 拒绝加载，提示导出/修复；不跳过损坏行 |

## 7. 上下文预算

### 7.1 分层

| 层 | 内容 | 预算 |
|---|---|---|
| L0 | 系统提示 + 工具 schema + 技能目录 | 4–8k |
| L1 | 项目/画布/时间线/导演台/拉片摘要 | 1–3k |
| L2 | 选中节点/片段/帧/素材 | 0.5–2k |
| L3 | 最近对话 | 2–6k |
| L4 | 工具结果 | 0.5–4k/次 |
| L5 | 压缩摘要 | 2–4k |
| 技能正文 | 按需读取 | 2–8k |

单轮输入上限默认 24k，可按模型覆盖。

### 7.2 业务摘要

每个空间一个 digest：

- 画布：节点统计、分组、选中、视口、最近变更。
- 时间线：轨道、片段数、总时长、播放头、选中、字幕数。
- 导演台：对象、机位、镜头、运镜、当前视角。
- 拉片：片长、帧数、段落、结构树、情绪曲线。

digest 只给摘要，详情按需分页读取。

### 7.3 裁剪

- 工具结果按行/字节截断，默认 2000 行 / 50KB 上限，单次工具结果更严（4k）。
- 大图、大文本、旧工具结果替换成引用。
- 历史对话只保留最近 N 轮，旧内容进压缩摘要。
- 技能正文按需读取，不整包注入。

### 7.4 压缩

当前已落地 v1：

- 手动触发：CineBot 输入框右侧圆环展示估算上下文用量，点击圆环确认后压缩。
- 预算固定 32k tokens，按 3 字符 ≈ 1 token 粗略估算；后续可按模型 contextWindow 覆盖。
- 保留最近 6 条 user/assistant 消息；更早的消息交给当前文本模型生成摘要。
- 摘要写入 session JSONL 的 `summary` 条目：`content` + `coveredMessages`；原始消息仍保留在会话记录中。
- 运行时构建历史时跳过 `coveredMessages` 之前的对话，并把摘要作为系统消息注入。
- 摘要失败（空内容、请求失败、超时）不落盘。
- 暂未实现 `firstKeptEntryId`、工具结果裁剪、技能 pin 和 prompt cache 控制；这些留到后续版本。

规划中的完整版本：

- 参考 PI 的切点算法和摘要格式。
- 压缩摘要由模型生成，失败不落盘。
- 压缩后保留：创作目标、已确认设定、已完成素材、关键决策、下一步、技能 pin。
- 摘要请求禁用 prompt cache 写入。

### 7.5 Prompt cache

- L0 保持稳定：系统提示、工具 schema、技能目录顺序固定。
- 业务摘要和选中上下文放尾部，避免破坏前缀缓存。
- 同一轮内重复读取走缓存。

### 7.6 预算守卫

超预算时按顺序：

1. 工具结果分页/截断。
2. 历史裁剪。
3. 压缩。
4. 拒绝并提示。

不静默截断关键内容；截断必须带标记。

## 8. 技能子系统

### 8.1 三级目录

```
<app>/resources/skills/           # 内置，只读
<userData>/skills/                # 全局，跨项目
<project>/.cinelab/skills/        # 项目，随项目走
```

优先级：项目 > 全局 > 内置。

### 8.2 SKILL.md 格式

```md
---
name: my-director
description: 我的短剧导演方法，适用于多人对话和复杂站位
version: 1.0.0
disableModelInvocation: false
---

# 正文
...
```

可选目录：

```
references/    # 按需读取
assets/        # 模板、示例
scripts/       # 后续支持，需确认
```

### 8.3 发现与注入

- 启动/打开项目时扫描三级目录。
- 解析 frontmatter，生成技能目录。
- 系统提示只注入 `name + description + scope`。
- 技能正文按需读取。

### 8.4 选择与保持

- 用户显式选择：技能菜单、`/skill:name`、项目默认技能。
- 模型主动读取：根据 description 匹配；`disableModelInvocation: true` 除外。
- 会话记录 `activeSkills`，每轮注入。
- 压缩后补回技能正文。
- 最多同时激活 4 个技能。

### 8.5 导入与安全

- 文件夹/ZIP 导入，预览 frontmatter 和文件列表。
- 路径校验：拒绝 `..`、绝对路径、符号链接逃逸。
- 大小限制：单文件、总大小、读取分页。
- 同名覆盖提示。
- 技能不能注册工具、不能扩大权限、不能修改系统提示。

### 8.6 脚本（后续）

- 首期不执行脚本。
- 后续支持时：用户确认、受限工作目录、超时、输出限制、审计。
- 脚本不能访问项目外路径，网络访问需显式声明。

## 9. 工具域

### 9.1 画布

`canvas.get`、`canvas.findNodes`、`canvas.getNodes`、`canvas.getEdges`、`canvas.addNode`、`canvas.deleteNodes`、`canvas.updateNode`、`canvas.moveNodes`、`canvas.connect`、`canvas.deleteEdges`、`canvas.group`、`canvas.ungroup`、`canvas.storyboard`、`canvas.arrange`、`canvas.fit`、`canvas.bindAsset`、`canvas.version`。

### 9.2 剪辑

`timeline.get`、`timeline.applyPlan`、`timeline.analyze`、`timeline.transcribe`、`timeline.subtitle`、`timeline.render`、`timeline.export`。

规则：

- 工具只产出 `TimelinePlan`（`TimelineCommand[]`），不直接改文档。
- 用户确认后作为一条 `batch` 提交。
- 所有命令走现有 `timeline-commands`。

### 9.3 导演台

`stage.get`、`stage.capabilities`、`stage.addObject`、`stage.transformObject`、`stage.setPose`、`stage.addCamera`、`stage.updateCamera`、`stage.addShot`、`stage.setCameraTrack`、`stage.captureFrame`、`stage.renderPreview`。

规则：

- 手动与 Agent 共用 `StageCommand`。
- 白模预演是本地 three.js 渲染 + ffmpeg，不调用视频模型。
- 相对指令由工具换算坐标。

### 9.4 拉片

`film.get`、`film.readFrames`、`film.readSegments`、`film.updateNote`、`film.exportAnalysis`、`film.importAnalysis`。

### 9.5 生成

`generation.catalog`、`generation.propose`、`generation.submit`、`generation.status`、`generation.cancel`。

### 9.6 项目/资产

`project.get`、`project.searchAssets`、`project.bindAsset`、`project.export`。

### 9.7 技能

`skill.list`、`skill.read`、`skill.install`、`skill.enable`、`skill.disable`、`skill.pin`。

## 10. IPC 与数据结构

### 10.1 IPC

| 通道 | 方向 | 作用 |
|---|---|---|
| `agent:chat` | 渲染 → 主 | 发送消息，创建 turn |
| `agent:cancel` | 渲染 → 主 | 取消当前 turn |
| `agent:confirm` | 渲染 → 主 | 确认提问/提案/高风险操作 |
| `agent:session-load` | 渲染 → 主 | 加载会话 |
| `agent:session-list` | 渲染 → 主 | 列出会话 |
| `agent:session-branch` | 渲染 → 主 | 创建分支 |
| `agent:session-delete` | 渲染 → 主 | 删除会话 |
| `agent:event` | 主 → 渲染 | 流式事件 |
| `agent:skill-list` | 渲染 → 主 | 技能列表 |
| `agent:skill-read` | 渲染 → 主 | 读取技能 |
| `agent:skill-install` | 渲染 → 主 | 导入技能 |
| `agent:proposal-get` | 渲染 → 主 | 读取提案 |
| `agent:proposal-submit` | 渲染 → 主 | 提交提案 |
| `agent:turn-undo` | 渲染 → 主 | 撤销回合 |

### 10.2 共享类型

```
src/shared/agent.ts           # profile、事件、turn、proposal、scope
src/shared/agent-tools.ts     # 工具定义与结果
src/shared/agent-session.ts   # 会话 entry 类型
src/shared/skills.ts          # 技能 frontmatter、目录、pin
src/shared/stage-schema.ts    # 导演台场景（后续）
```

### 10.3 存储

| 数据 | 路径 |
|---|---|
| 会话 | `<project>/.cinelab/agent/sessions/<id>.jsonl` |
| 提案 | `<project>/.cinelab/agent/proposals/<id>.json` |
| 项目技能 | `<project>/.cinelab/skills/` |
| 全局技能 | `<userData>/skills/` |
| 导演台场景 | `<project>/.cinelab/stages/<id>.json` |
| 时间线 | `<project>/.cinelab/timelines/<id>.json` |

### 10.4 安全

- 所有路径经 `resolveInside` / `resolveMediaPath` 校验。
- 读写文件必须限制在项目/全局库允许范围。
- API Key 只存加密 settings，不写会话/日志/模型上下文。
- 会话和诊断包导出前脱敏。

## 11. 评测与观测

### 11.1 Fake eval

- 本地 SSE 模型桩，零付费。
- 跑真实主进程、工具注册表、画布操作、会话、撤销。
- CI 中稳定运行。

### 11.2 场景

| 场景 | 验收 |
|---|---|
| 只读问答 | 不调用写工具 |
| 改名 | 正确调用 `canvas.updateNode`，一次撤销 |
| 建节点 + 连线 | 结构正确，自动连线 |
| 生成提案 | 未确认不产生任务，确认后提交 |
| 越权 | 伪造 canvasId/assetId 被拒绝 |
| 取消 | 不落库，不修改文档 |
| 恢复 | 重启后会话和未完成 turn 可见 |
| 技能 | 跨轮保持，压缩后补回，禁用技能不可用 |
| 导演台 | 搭景、机位、白模预演、取消无残留 |

### 11.3 指标

- 结构断言通过率。
- 未确认生成数（必须为 0）。
- 工具步数、模型请求数、token、耗时。
- 回合撤销成功率。
- revision 冲突恢复率。
- 技能保持率。

### 11.4 观测

- 每轮工具调用、参数、结果摘要、耗时、错误。
- token/费用统计。
- 诊断包导出。
- 日志走 electron-log，敏感信息脱敏。

## 12. Spike 清单

### 12.1 目标

验证最小闭环：

```text
一句话 → 模型工具调用 → 改画布 → 一条撤销 → 重启还在
```

### 12.2 最小工具

- `canvas.get`：只读，返回画布摘要和选中节点。
- `canvas.updateTitle`：写，改节点标题，验证权限、revision、撤销。

### 12.3 必验项

| 编号 | 验证 | 通过标准 | 结果 |
|---|---|---|---|
| S1 | Electron 45 主进程加载运行时 | 无 ESM/Node 版本错误 | 通过 |
| S2 | 模型请求走 `net.fetch` | 代理设置生效，请求成功 | 通过：本地真实代理 7899 收到 `CONNECT api.agnes-ai.cn:443` |
| S3 | 原生 function calling | 模型正确返回工具调用，结果回填 | 通过：mock + Agnes 3.0 Flash |
| S4 | 工具注册表 + 权限 | 只读模式拒绝写工具，scope 生效 | 通过 |
| S5 | 回合事务 + 撤销 | 一轮改名，一条 Ctrl+Z 恢复 | 通过 |
| S6 | 会话 JSONL | 重启后历史还在，未完成 turn 标记 interrupted | 通过 |
| S7 | 打包 | `electron-vite build` 后功能不退化，体积可接受 | 通过 |
| S8 | 图片真实生成 | Agnes Image 2.5 Flash 出图成功 | 通过：1024×1024 |
| S9 | SSE 流式 | 文本增量到达前端，工具调用仍正常 | 通过：34 个 `text_delta` |
| S10 | 视频真实生成 | Agnes Video 2.5 Flash 出片 | 阻塞：503 `video_queue_full` |

### 12.4 产出

1. Spike 报告：通过/不通过/卡点。
2. 架构决策回填：自研循环还是 pi-agent-core，文本模型走 provider 还是 pi-ai。
3. 更新本文档的「待验证」状态。

### 12.5 真实测试模型

真实测试使用 Agnes 中国站 `https://api.agnes-ai.cn/v1`：

| 用途 | 模型 |
|---|---|
| 文本 / 多模态 / 工具调用 | `agnes-3.0-flash` |
| 图片 / 图生图 | `agnes-image-2.5-flash` |
| 视频 | `agnes-video-2.5-flash` |

Key、`models.json` 和启动说明存放在仓库外的本地测试目录，不写入仓库、会话、日志或截图。Agnes 3.0 Flash 已验证工具调用与只读拒绝；Image 2.5 Flash 已真实出图；SSE 流式已通过；Video 2.5 Flash 因免费队列 503 `video_queue_full` 待重试。

## 13. 里程碑

| 批次 | 内容 |
|---|---|
| 批次 1 | 工具注册表、画布操作层、`StageCommand` 骨架、技能目录骨架、回合事务、模型运行时、会话、权限、生成提案 |
| 批次 2 | 画布助手 |
| 批次 3 | 剪辑助手 |
| 批次 4 | 编排：计划、自动继续、断点续做、分镜组成片 |
| 批次 5 | 导演台预演 |
| 批次 6 | 技能与记忆 |
| 批次 7 | 拉片 |
| 批次 8 | 多 Agent 与生态 |

导演台 P0/P1 与批次 1-3 并行，因为它和 Agent 工具层共用命令与协议。

## 14. 风险与待定

| 风险 | 影响 | 应对 |
|---|---|---|
| 中转站 function calling 不稳定 | 工具调用失败 | 原生 tools 优先，JSON 兜底，失败重试 |
| Electron 代理不生效 | 模型请求失败 | spike 验证 `net.fetch`，不行就注入自定义 fetch |
| 打包体积/ESM | 构建失败 | 不引入 pi-coding-agent；pi-agent-core 备选 |
| 上下文膨胀 | 成本高、模型抓不住重点 | digest + 分页 + 裁剪 + 压缩 + 预算 |
| revision 冲突 | 覆盖用户改动 | expectedRevision + 冲突重读 + 回合撤销 |
| 技能安全 | 恶意内容/脚本 | 路径校验、大小限制、确认、审计 |
| 生成误操作 | 用户损失 | 提案 + 预算 + 幂等 |
| 许可证 | 法律风险 | pi MIT 保留声明；不复制 BeefTV 代码 |

## 15. 下一步

1. 2026-11-08 已完成 Spike：S1–S9 通过，S10 因 Agnes 视频队列 503 阻塞。
2. Agnes Video 2.5 Flash 队列恢复后重试；有外网代理服务时补一次真实代理复测。
3. 拆 `docs/skills-plan.md`：技能子系统详细设计。
4. 拆 `docs/agent-rollout-plan.md`：批次 1-8 任务分解。
5. 进入批次 1 实现。
