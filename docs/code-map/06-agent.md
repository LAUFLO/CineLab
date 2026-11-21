# 06 CineBot 与 Agent

日期：2026-11-19
状态：现行
适用版本：v0.3.0
最后核对：2026-11-19

## 这个模块负责什么

CineBot 会话、工具注册与执行、生成提案、技能、能力审计。

## 不负责什么

- 不做具体生成逻辑（见 02）。
- 不做画布/导演台/时间线的具体命令实现（见 01/03/04），只调用它们的工具。

## 角色与权限

| 类型 | 取值 |
|---|---|
| `AgentProfileId` | `canvas`、`clip`、`film`、`stage` |
| `AgentPermissionMode` | `read-only`、`current`、`full-access` |
| `AgentScope` | 项目路径、画布 id、选中节点、生成模型、时间线 id、剪辑节点 id、选中片段、播放头 |

工具按 profile 与 mode 过滤：`filterAgentTools(AGENTS_TOOLS, profile, mode)` → `toModelTools`。

## MCP server

外部 Agent 通过 `src/main/mcp/` 连接 CineLab：内置 Streamable HTTP server（`127.0.0.1` + Bearer token），以及 stdio 桥接进程。当前暴露 `local_adapter_*`、项目/画布/节点/模型只读工具、节点写工具、生成提交、剪辑室时间线操作，以及导演台对象/机位/镜头/自动分镜/预演导出。写操作执行前需要应用内确认；配置与安全说明见 `docs/mcp.md`。

## 工具分组

`src/main/agent/tools/index.ts` 聚合 7 组：

| 组 | 文件 | 负责 |
|---|---|---|
| 画布 | `canvas.ts` | 节点、连线、文本、分组、节点操作、拉片 |
| 生成 | `generation.ts` | 生成目录、生成提案、模型选择 |
| 导演台 | `stage.ts` | 对象、机位、镜头、语义镜头、世界、场景图、预演导出 |
| 时间线 | `timeline.ts` | 片段、轨道、字幕、导出、节拍 |
| 拉片 | `film.ts` | 拉片读取、自动拉片、导出 |
| 能力 | `capability.ts` | 能力目录、模型能力查询 |
| 技能 | `skills.ts` | 技能列表、读取、执行 |

工具确认由 `toolConfirmationReason` 统一判断，例如删除片段、删除静音、导出成片、删除节点/连线、覆盖文本、节点操作、删除导演台对象等。完整清单见 [_generated.md](_generated.md) 与 `docs/agent-capabilities.md`。

## 运行时

`src/main/agent/runtime.ts`：

- 单轮最多 `MAX_STEPS = 8` 次工具调用；
- 默认工具超时 `TOOL_TIMEOUT_MS = 30_000`；
- 历史消息上限 `MAX_HISTORY_CHARS = 12_000`；
- 长任务单独放宽：字幕/静音/分镜/节拍 5–15 分钟，导出/自动拉片/节点操作 30 分钟；
- 模型调用走 `chatWithTools`；工具结果回填后继续下一轮，直到模型不再调用工具。

执行路径有两条：

1. **主进程工具**：`main-tools.ts` 直接查目录、发请求、读项目文件；
2. **渲染进程操作**：通过 `AgentApi.toolResult` 与四个 bridge（`canvasBridge`、`filmBridge`、`stageBridge`、`timelineBridge`）把工具调用落到对应 store/UI。

### v3 运行时（M1，分支 spike/agent-runtime-v3）

- 主进程通过 `pi/loader.ts` 动态 import ESM-only 的 pi-coding-agent；
- `pi/runtime.ts` 用 `createAgentSession` 替换旧循环，保留 `startTurn/cancelTurn/resolve*` API；
- `pi/model-runtime.ts` 自定义 `streamSimple`，复用 `httpFetch`；
- `pi/session.ts` 只读写 `.cinelab/agent/sessions/v2`，`pi/session-lock.ts` 提供单写者锁；
- `pi/tools.ts` 用 `Type.Unsafe` 把 63 个工具注册为 `customTools`；
- 权限和确认规则仍由 CineLab 拥有，extension `tool_call` 内联在 `pi/runtime.ts`；
- 旧 `runtime.ts` / `session.ts` 仍在，作为回退，M5 删除。

## 生成提案

`AgentProposal`：`id`、`sessionId`、`turnId`、`status`、`request: GenerateRequest`、`outputTarget`（`version` / `new-node`）、`nodeTitle`、`modelName`、`capability`、`count`、`createdAt/expiresAt`、`submittedAt`、`runId`、`error`。

- 存储：`.cinelab/agent/proposals`；
- 生命周期：`pending` → `submitting` → 提交到 `generationQueue`；过期由 `isProposalExpired` 判断；
- `new-node` 提案会在画布上创建占位节点并连线，结果写回新节点；`version` 提案写回当前节点版本栈；
- 提案把「模型/能力/参数」在主进程补全，渲染进程只提交草稿（`AgentProposalDraft`）。

## 会话与压缩

- 目录：`.cinelab/agent/sessions/<id>.jsonl`，索引 `.index.json`；
- `session.ts` 负责创建、加载、追加消息、标题、快照；
- `compact.ts` 负责上下文压缩（长会话裁剪）；
- 会话 id 形如 `main-<base36>-<uuid4>`，有长度与字符校验。

## 技能

- 来源：内置 `resources/skills`、全局 `userData/skills`、项目 `.cinelab/skills`；
- `skills.ts` 负责列表、读取、路径校验、大小限制；
- `skills-admin.ts` / `skills-config.ts` 负责安装、覆盖、导入导出；
- 技能可被 Agent 以 `skill` 工具调用，正文与引用文件分开读取。

## 能力审计

- `src/main/agent/capabilities/registry.ts` 从 `AGENT_TOOLS` 投影出 `AGENT_CAPABILITIES`，不重复维护执行逻辑；
- `src/main/__tests__/capability-audit.test.ts` 校验工具与能力注册的一致性；
- `docs/agent-capabilities.md` 与 `_generated.md` 的工具清单由 `check:docs` 对齐。

## 渲染进程

| 文件 | 作用 |
|---|---|
| `AgentPanel.tsx` | 对话、工具状态、提案卡片 |
| `agentStore.ts` | 消息、会话、提案、工具调用的前端状态 |
| `canvasBridge.ts` | 画布工具落到 canvas store |
| `filmBridge.ts` | 拉片工具落到 film-study store |
| `stageBridge.ts` | 导演台工具落到 stage store |
| `timelineBridge.ts` | 时间线工具落到 timeline store |

## 数据流

```
AgentPanel
  → window.api.agent.chat
  → runtime（主进程）
  → 文本模型（chatWithTools）
  → tool call
      ├─ main-tools（主进程直接执行）
      └─ 渲染进程 bridge（经 AgentApi.toolResult 回传）
  → tool result
  → 下一轮 / 最终回复
  → session JSONL
```

## 当前状态

| 能力 | 状态 | 证据 |
|---|---|---|
| 工具注册、过滤、确认 | 已实现 | `tools/index.ts`、`tools.test.ts` |
| 会话读写、标题、压缩 | 已实现 | `session.ts`、`compact.ts`、`session.test.ts` |
| 生成提案 | 已实现 | `proposals.ts`、`proposals.test.ts` |
| 技能 | 已实现 | `skills.ts`、`skills-admin.ts`、`skills.test.ts` |
| 能力审计 | 已实现 | `capabilities/registry.ts`、`capability-audit.test.ts` |
| 四个 bridge | 已实现 | `src/renderer/src/agent/*Bridge.ts` |
| v3 运行时（pi） | 部分实现 | `src/main/agent/pi/*`；M1–M3 已接入；M4 四空间回归通过（canvas/stage 真模型，timeline/film 桥接），正式 asar 待复测 |

## 已知限制

- 工具列表随代码变化，新增工具必须同步 `docs/agent-capabilities.md`，否则 `check:docs` 失败。
- 渲染进程 bridge 依赖对应界面/store 可用；自动化测试覆盖有限。
- 长任务有独立超时，导出/拉片可能等待数分钟。
- 提案结果写回依赖节点仍存在；删除源节点会使提案失效。
- v3 运行时的 thinking/compaction/retry/queue 事件已发送，但前端展示在 M3 接入。
- v1 会话只保留冷备，不在界面展示，也不读取。

## 常见改动入口

| 想改什么 | 先看 |
|---|---|
| 新增工具 | `src/main/agent/tools/*.ts` + `docs/agent-capabilities.md` |
| 工具确认规则 | `src/main/agent/tools/index.ts` 的 `toolConfirmationReason` |
| 运行时/超时 | `src/main/agent/runtime.ts`（旧）、`src/main/agent/pi/runtime.ts`（v3） |
| 提案 | `src/main/agent/proposals.ts`、`src/shared/agent-proposal.ts` |
| 会话/压缩 | `src/main/agent/session.ts`、`compact.ts` |
| 技能 | `src/main/agent/skills.ts`、`skills-admin.ts` |
| 前端 | `src/renderer/src/agent/AgentPanel.tsx`、`agentStore.ts` |
| 能力审计 | `src/main/agent/capabilities/`、`src/main/__tests__/capability-audit.test.ts` |

## 文件与导出（自动生成）

<!-- AUTO:files:start -->
| 文件 | 行数 |
|---|---|
| `src/main/agent/capabilities/registry.ts` | 25 |
| `src/main/agent/capabilities/types.ts` | 91 |
| `src/main/agent/compact.ts` | 93 |
| `src/main/agent/main-tools.ts` | 228 |
| `src/main/agent/model.ts` | 375 |
| `src/main/agent/pi/events.ts` | 127 |
| `src/main/agent/pi/loader.ts` | 34 |
| `src/main/agent/pi/model-runtime.ts` | 724 |
| `src/main/agent/pi/permissions.ts` | 28 |
| `src/main/agent/pi/prompt.ts` | 149 |
| `src/main/agent/pi/resources.ts` | 41 |
| `src/main/agent/pi/runtime.ts` | 586 |
| `src/main/agent/pi/session-lock.ts` | 55 |
| `src/main/agent/pi/session.ts` | 244 |
| `src/main/agent/pi/timeouts.ts` | 19 |
| `src/main/agent/pi/tools.ts` | 120 |
| `src/main/agent/proposals.ts` | 499 |
| `src/main/agent/runtime.ts` | 758 |
| `src/main/agent/session.ts` | 407 |
| `src/main/agent/skills-admin.ts` | 592 |
| `src/main/agent/skills-config.ts` | 110 |
| `src/main/agent/skills.ts` | 216 |
| `src/main/agent/tools/canvas.ts` | 545 |
| `src/main/agent/tools/capability.ts` | 129 |
| `src/main/agent/tools/errors.ts` | 11 |
| `src/main/agent/tools/film.ts` | 651 |
| `src/main/agent/tools/generation.ts` | 365 |
| `src/main/agent/tools/index.ts` | 162 |
| `src/main/agent/tools/scope.ts` | 9 |
| `src/main/agent/tools/skills.ts` | 90 |
| `src/main/agent/tools/stage.ts` | 1122 |
| `src/main/agent/tools/timeline.ts` | 930 |
| `src/main/mcp/app-tools.ts` | 221 |
| `src/main/mcp/config.ts` | 54 |
| `src/main/mcp/server.ts` | 190 |
| `src/main/mcp/stdio-bridge.ts` | 104 |
| `src/main/mcp/tools.ts` | 75 |
| `src/main/mcp/write-tools.ts` | 754 |
| `src/renderer/src/agent/AgentPanel.tsx` | 1248 |
| `src/renderer/src/agent/agentStore.ts` | 1100 |
| `src/renderer/src/agent/canvasBridge.ts` | 1125 |
| `src/renderer/src/agent/filmBridge.ts` | 747 |
| `src/renderer/src/agent/panel/ContextRing.tsx` | 55 |
| `src/renderer/src/agent/panel/MessageActions.tsx` | 31 |
| `src/renderer/src/agent/panel/MessageBubble.tsx` | 38 |
| `src/renderer/src/agent/panel/ProposalCard.tsx` | 162 |
| `src/renderer/src/agent/panel/ThoughtGroup.tsx` | 77 |
| `src/renderer/src/agent/panel/utils.tsx` | 146 |
| `src/renderer/src/agent/stageBridge.ts` | 872 |
| `src/renderer/src/agent/timelineBridge.ts` | 1080 |
| `src/renderer/src/mcp/commandBridge.ts` | 146 |
| `src/shared/agent-proposal.ts` | 140 |
| `src/shared/agent-tools.ts` | 59 |
| `src/shared/agent.ts` | 264 |
| `src/shared/capabilities.ts` | 321 |
| `src/shared/mcp-command.ts` | 14 |
| `src/shared/skills.ts` | 168 |
<!-- AUTO:files:end -->

<!-- AUTO:exports:start -->
| 文件 | 导出 |
|---|---|
| `src/main/agent/capabilities/registry.ts` | `AGENT_CAPABILITIES`、`findCapability` |
| `src/main/agent/capabilities/types.ts` | `CapabilityConfirmation`、`AgentCapability`、`toAgentCapability`、`listAgentCapabilities`、`capabilitiesForProfile`、`capabilitySummary` |
| `src/main/agent/compact.ts` | `compactSession` |
| `src/main/agent/main-tools.ts` | `MainToolResult`、`executeMainTool` |
| `src/main/agent/model.ts` | `AgentRuntimeModel`、`AgentChatMessage`、`AgentChatResult`、`listAgentModels`、`listTextModels`、`resolveTextModel`、`chatWithTools` |
| `src/main/agent/pi/events.ts` | `createAgentTurn`、`mergeChange`、`textOfContent`、`usageOf`、`assistantTextOf`、`looksLikePreamble`、`toolCallOf` |
| `src/main/agent/pi/loader.ts` | `loadPiCodingAgent`、`loadPiAi` |
| `src/main/agent/pi/model-runtime.ts` | `PiModelHandle`、`createPiModelRuntime` |
| `src/main/agent/pi/permissions.ts` | `piPermissionBlock`、`piConfirmationReason` |
| `src/main/agent/pi/prompt.ts` | `systemPromptFor`、`stageContext`、`attachmentContext`、`referenceContext`、`generationModelsContext` |
| `src/main/agent/pi/resources.ts` | `PiResourceInput`、`createPiResourceLoader` |
| `src/main/agent/pi/runtime.ts` | `AgentTurnCallbacks`、`startTurn`、`cancelTurn`、`resolveToolResult`、`resolveConfirmation`、`getActiveTurnInfo` |
| `src/main/agent/pi/session-lock.ts` | `acquirePiSessionLock`、`isPiSessionLocked` |
| `src/main/agent/pi/session.ts` | `piSessionDirectory`、`createPiSessionId`、`findPiSessionPath`、`listPiSessions`、`createPiSession`、`openPiSessionManager`、`loadPiSession`、`renamePiSession`、`deletePiSession`、`compactPiSession` |
| `src/main/agent/pi/timeouts.ts` | `TOOL_TIMEOUT_MS`、`LONG_TOOL_TIMEOUTS`、`toolTimeoutMs` |
| `src/main/agent/pi/tools.ts` | `PiToolRuntime`、`createPiTools` |
| `src/main/agent/proposals.ts` | `setProposalChangeListener`、`proposalDirectory`、`createProposal`、`activeProposal`、`expireSessionProposals`、`submitProposal`、`cancelProposal`、`deleteSessionProposals`、`updateProposalFromRun` |
| `src/main/agent/runtime.ts` | `AgentTurnCallbacks`、`startTurn`、`resolveToolResult`、`resolveConfirmation`、`cancelTurn`、`getActiveTurnInfo` |
| `src/main/agent/session.ts` | `sessionDirectory`、`sessionFile`、`createSessionId`、`ensureSession`、`appendSessionEntry`、`appendMessage`、`appendTurn`、`loadSession`、`listSessions`、`createSession`、`deleteSession`、`renameSession`、`ensureSessionTitle`、`appendSessionSummary`、`requireProjectRoot` |
| `src/main/agent/skills-admin.ts` | `skillScopeDirectory`、`listSkillAdmin`、`createSkill`、`saveSkill`、`deleteSkill`、`readSkillFile`、`listSkillFiles`、`importSkillFiles`、`removeSkillFile`、`cloneSkill`、`setSkillOverride`、`skillDirectoryFor`、`skillFileFor`、`ensureScopeDirectory`、`projectSkillDirectory` |
| `src/main/agent/skills-config.ts` | `SkillOverride`、`SkillOverrides`、`skillOverrideKey`、`loadSkillOverrides`、`saveSkillOverride`、`removeSkillOverride` |
| `src/main/agent/skills.ts` | `SkillLocation`、`isWithin`、`builtinSkillsDirectory`、`globalSkillsDirectory`、`projectSkillsDirectory`、`skillLocations`、`readSkillManifest`、`listSkills`、`readSkill`、`skillCatalogPrompt` |
| `src/main/agent/tools/canvas.ts` | `CANVAS_TOOLS`、`validateCanvasToolArgs` |
| `src/main/agent/tools/capability.ts` | `CAPABILITY_TOOLS`、`validateCapabilityToolArgs` |
| `src/main/agent/tools/errors.ts` | `AgentToolError` |
| `src/main/agent/tools/film.ts` | `FILM_TOOLS`、`validateFilmToolArgs` |
| `src/main/agent/tools/generation.ts` | `GENERATION_TOOLS`、`validateGenerationToolArgs` |
| `src/main/agent/tools/index.ts` | `AGENT_TOOLS`、`toolDefinitionsForModel`、`getTool`、`toolConfirmationReason`、`assertToolAllowed` |
| `src/main/agent/tools/scope.ts` | `assertSelectedNode` |
| `src/main/agent/tools/skills.ts` | `SKILL_TOOLS`、`validateSkillToolArgs` |
| `src/main/agent/tools/stage.ts` | `STAGE_TOOLS`、`validateStageToolArgs` |
| `src/main/agent/tools/timeline.ts` | `TIMELINE_TOOLS`、`isTimelineWriteTool`、`validateTimelineToolArgs` |
| `src/main/mcp/app-tools.ts` | `registerCineLabAppTools` |
| `src/main/mcp/config.ts` | `McpStdioConfig`、`McpServerConfig`、`mcpConfigPath`、`createMcpToken`、`readMcpConfig`、`writeMcpConfig`、`removeMcpConfigSync` |
| `src/main/mcp/server.ts` | `startMcpServer`、`stopMcpServer`、`mcpStatus` |
| `src/main/mcp/tools.ts` | `registerCineLabTools` |
| `src/main/mcp/write-tools.ts` | `registerMcpCommandIpc`、`registerCineLabWriteTools` |
| `src/renderer/src/agent/AgentPanel.tsx` | `AgentPanel` |
| `src/renderer/src/agent/agentStore.ts` | `AgentMessage`、`AgentActivity`、`agentTurnChangeCount`、`AGENT_CONTEXT_BUDGET_TOKENS`、`AGENT_KEEP_RECENT_MESSAGES`、`AgentContextStats`、`agentContextStats`、`useAgentStore` |
| `src/renderer/src/agent/canvasBridge.ts` | `executeAgentTool`、`initAgentCanvasBridge` |
| `src/renderer/src/agent/filmBridge.ts` | `FilmToolResult`、`executeFilmTool` |
| `src/renderer/src/agent/panel/ContextRing.tsx` | `ContextRing` |
| `src/renderer/src/agent/panel/MessageActions.tsx` | `MessageActions` |
| `src/renderer/src/agent/panel/MessageBubble.tsx` | `MessageBubble` |
| `src/renderer/src/agent/panel/ProposalCard.tsx` | `ProposalCard` |
| `src/renderer/src/agent/panel/ThoughtGroup.tsx` | `ThoughtGroup` |
| `src/renderer/src/agent/panel/utils.tsx` | `toolLabel`、`relativeTime`、`modelNameOf`、`MentionItem`、`renderInline`、`RenderItem`、`buildRenderItems` |
| `src/renderer/src/agent/stageBridge.ts` | `StageToolResult`、`executeStageTool` |
| `src/renderer/src/agent/timelineBridge.ts` | `TimelineToolResult`、`executeTimelineTool` |
| `src/renderer/src/mcp/commandBridge.ts` | `initMcpCommandBridge` |
| `src/shared/agent-proposal.ts` | `PROPOSAL_TTL_MS`、`proposalExpiresAt`、`isProposalExpired`、`NormalizedParams`、`normalizeGenerationParams`、`proposalCount`、`proposalStatusLabel` |
| `src/shared/agent-tools.ts` | `AgentToolScope`、`AgentToolDefinition`、`filterAgentTools`、`toModelTools` |
| `src/shared/agent.ts` | `AgentProfileId`、`AgentPermissionMode`、`AgentScope`、`AgentAttachment`、`AgentReference`、`AgentChatRequest`、`AgentModelInfo`、`AgentGenerationModels`、`AgentSessionInfo`、`AgentUsage`、`AgentProposalStatus`、`AgentProposal`、`AgentProposalDraft`、`AgentToolCall`、`AgentToolResult`、`AgentTurnChange`、`AgentTurnStatus`、`AgentTurn`、`AgentEvent`、`AgentSessionMessage`、`AgentSessionSnapshot`、`AgentToolCallRequest`、`AgentToolResultInput`、`AgentConfirmInput` …（共 26 个） |
| `src/shared/capabilities.ts` | `ModelInputFeature`、`ModelOutputFeature`、`AdapterCapability`、`CapabilityGapKind`、`CapabilityGap`、`EffectiveCapabilities`、`ADAPTER_CAPABILITIES`、`resolveAdapter`、`contractFor`、`normalizeFeatureSets`、`effectiveCapabilities` |
| `src/shared/mcp-command.ts` | `McpWriteCommand`、`McpWriteResult` |
| `src/shared/skills.ts` | `SkillScope`、`SkillFrontmatter`、`SkillSummary`、`SkillAdminEntry`、`SkillFileEntry`、`SkillFileContent`、`SkillWriteInput`、`SkillOverrideInput`、`SkillUploadFolder`、`SkillUploadResult`、`SkillCloneInput`、`SkillReadResult`、`SKILL_NAME_PATTERN`、`MAX_SKILL_DESCRIPTION_LENGTH`、`MAX_SKILL_BODY_BYTES`、`MAX_SKILL_REFERENCE_BYTES`、`MAX_SKILL_PATH_LENGTH`、`MAX_SKILL_UPLOAD_FILES`、`MAX_SKILL_UPLOAD_BYTES`、`parseSkillMarkdown`、`normalizeSkillPath` |
<!-- AUTO:exports:end -->
