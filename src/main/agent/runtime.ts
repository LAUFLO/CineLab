import { randomUUID } from 'node:crypto'
import type {
  AgentAttachment,
  AgentChatRequest,
  AgentConfirmInput,
  AgentEvent,
  AgentGenerationModels,
  AgentProfileId,
  AgentReference,
  AgentScope,
  AgentToolCall,
  AgentToolCallRequest,
  AgentToolResultInput,
  AgentTurn,
  AgentTurnChange
} from '@shared/agent'
import { chatWithTools, resolveTextModel, type AgentChatMessage } from './model'
import {
  appendMessage,
  appendTurn,
  ensureSession,
  ensureSessionTitle,
  loadSession,
  requireProjectRoot
} from './session'
import {
  AgentToolError,
  assertToolAllowed,
  getTool,
  isTimelineWriteTool,
  toolConfirmationReason,
  toolDefinitionsForModel
} from './tools'
import { executeMainTool } from './main-tools'
import { expireSessionProposals } from './proposals'
import { skillCatalogPrompt } from './skills'

const MAX_STEPS = 8
const TOOL_TIMEOUT_MS = 30_000
const MAX_HISTORY_CHARS = 12_000
const LONG_TOOL_TIMEOUTS: Record<string, number> = {
  timeline_auto_subtitles: 15 * 60_000,
  timeline_remove_silence: 10 * 60_000,
  timeline_split_by_shots: 5 * 60_000,
  timeline_beat_markers: 5 * 60_000,
  timeline_beat_split: 5 * 60_000,
  timeline_export: 30 * 60_000,
  stage_export_preview: 30 * 60_000,
  film_study_auto: 30 * 60_000,
  film_study_export: 10 * 60_000
}

function toolTimeoutMs(name: string): number {
  return LONG_TOOL_TIMEOUTS[name] ?? TOOL_TIMEOUT_MS
}

const CANVAS_SYSTEM_PROMPT = `你是 CineBot，CineLab 的画布助手。你可以读取画布、创建文本/图片/视频/音频节点、修改标题和文本正文、移动节点、连接或删除连线、删除节点、分组和解散分组，也可以登记生成提案和执行逐帧拉片。

规则：
- 只操作当前画布。
- 创建节点不需要选中；修改、移动、连接、删除、拉片只操作选中节点或本轮新建的节点。
- 操作前先用 canvas_get 确认现有节点和连线；它会返回节点 ID、标题、类型、坐标和 edgeId，可按标题寻找素材。
- 不要编造节点 ID、坐标或连线。
- 修改文本正文用 canvas_update_text；不要用它改图片/视频节点。
- 删除连线可以传 edgeId，或传 sourceNodeId + targetNodeId；删除后下游对上游的引用会被清理。
- 需要逐帧拉片时，对一个选中视频节点调用 film_study_auto；会创建拉片节点、分镜组和分镜表。先用 film_study_get 读取已有拉片结果。
- 需要生成图片、视频、音频或文本时，先调用 generation_catalog 确认模型和参数，再调用 generation_propose 登记提案。
- 目标生成节点用 canvas_add_node 创建；建议传 nearNodeId，把新节点放在参考素材右侧。
- 引用画布素材用 generation_propose.refNodeIds；引用资产库素材先用 library_search 搜索，再用 generation_propose.libraryRefs。
- 用户用 @ 引用的素材会附在系统提示中：画布节点用 refNodeIds，资产库路径用 libraryRefs。
- 用户选择的生图/生视频/音频模型会附在系统提示中；生成时优先使用对应能力的已选模型。
- 用户附件已经创建为画布节点，系统提示会给出 nodeId；引用附件时直接放进 refNodeIds。
- generation_propose 会自动把参考素材连到目标节点，并把提示词写回目标节点的提示词输入框；不需要额外调用 canvas_connect。
- generation_propose 不会立即生成，也不会扣费；必须告诉用户「已生成提案，请在面板中确认」，不要声称已经开始生成。
- 用户确认后由界面提交生成；你不能自行提交提案。
- 新消息会让旧提案失效，需要时重新登记。
- 用中文回复，简洁说明你做了什么。
- 工具返回错误或用户取消时，如实说明没有完成，不要声称已经完成。
- 需要用户先选中节点时，明确提示。`

function attachmentContext(attachments?: AgentAttachment[]): string {
  if (!attachments || attachments.length === 0) return ''
  const kindLabel: Record<AgentAttachment['kind'], string> = {
    image: '图片',
    video: '视频',
    audio: '音频'
  }
  return `\n\n用户本轮附件（已创建为画布节点）：\n${attachments
    .map(
      (item) =>
        `- ${kindLabel[item.kind]}「${item.name}」nodeId=${item.nodeId} path=${item.path} scope=${item.scope}`
    )
    .join(
      '\n'
    )}\n引用这些附件时，把 nodeId 放进 generation_propose.refNodeIds；工具会自动建立附件到目标节点的连线，并把提示词写回目标节点。`
}

function referenceContext(references?: AgentReference[]): string {
  if (!references || references.length === 0) return ''
  const kindLabel: Record<AgentReference['kind'], string> = {
    image: '图片',
    video: '视频',
    audio: '音频'
  }
  return `\n\n用户用 @ 引用的素材：\n${references
    .map(
      (item) =>
        `- ${kindLabel[item.kind]}「${item.name}」${
          item.nodeId ? `nodeId=${item.nodeId} ` : ''
        }path=${item.path} scope=${item.scope}`
    )
    .join(
      '\n'
    )}\n引用画布节点时放进 refNodeIds；引用资产库路径时放进 libraryRefs。`
}

function generationModelsContext(models?: AgentGenerationModels): string {
  if (!models) return ''
  const parts: string[] = []
  if (models.image) parts.push(`生图=${models.image}`)
  if (models.video) parts.push(`生视频=${models.video}`)
  if (models.audio) parts.push(`音频=${models.audio}`)
  if (parts.length === 0) return ''
  return `\n\n用户选择的生成模型：${parts.join(
    '；'
  )}。生成时优先使用对应能力的已选模型；generation_catalog 会标记这些模型。`
}

const CLIP_SYSTEM_PROMPT = `你是 CineBot，CineLab 的剪辑助手。你只操作当前打开的剪辑室时间线。

规则：
- 修改前先用 timeline_get 读取视频设置、轨道、片段、选中片段和播放头。
- 不要编造 clipId、trackId 或时间码。
- 片段 ID 必须来自 timeline_get；未指定片段时，默认使用当前选中片段。
- 时间单位统一为毫秒；移动、裁剪、切分、删除会改变成片时长，操作前先说明影响。
- 改画幅、分辨率、帧率或背景用 timeline_set_video；画幅宽高必须成对且为偶数。
- 按镜头切分用 timeline_split_by_shots，需要先指定一个视频片段。
- 节拍标记用 timeline_beat_markers，节拍切分用 timeline_beat_split；节拍源必须是音频或视频片段。
- 删除片段、批量移动等破坏性操作，如果用户没有明确要求，先提出方案再执行。
- 轨道锁定、不可见或静音状态会影响操作，先检查再修改。
- 自动字幕用 timeline_auto_subtitles；需要本地字幕运行时和 Whisper Base 模型，未安装时提示用户去设置安装。
- 删静音用 timeline_remove_silence，会缩短成片时长，必须等用户确认后再执行。
- 转场用 timeline_set_transition，音频片段不支持转场。
- 导出成片用 timeline_export，耗时较长，必须等用户确认后再执行。
- 删除静音、按镜头切分、节拍切分和导出成片工具自带确认卡；用户已明确要求时直接调用工具，由界面确认，不要先在文本里反复询问。
- 生成图片/视频仍走 canvas 的生成提案工具；剪辑阶段不直接发起付费生成。
- 所有修改都进入时间线撤销历史，同一轮操作只产生一条撤销记录。
- 用中文回复，简洁说明你改了什么。
- 工具返回错误或用户取消时，如实说明没有完成，不要声称已经完成。`

function systemPromptFor(profile: AgentProfileId): string {
  return profile === 'clip' ? CLIP_SYSTEM_PROMPT : CANVAS_SYSTEM_PROMPT
}

export interface AgentTurnCallbacks {
  sendEvent(event: AgentEvent): void
  sendToolCall(call: AgentToolCallRequest): void
}

interface ActiveTurn {
  controller: AbortController
  turn: AgentTurn
  scope: AgentScope
  pending: Map<
    string,
    {
      resolve(result: AgentToolResultInput): void
      reject(error: Error): void
    }
  >
  confirmations: Map<
    string,
    {
      resolve(approved: boolean): void
      reject(error: Error): void
    }
  >
}

const activeTurns = new Map<string, ActiveTurn>()

function addUsage(
  current: AgentTurn['usage'],
  next: NonNullable<AgentTurn['usage']>
): AgentTurn['usage'] {
  if (!current) return next
  return {
    input: current.input + next.input,
    output: current.output + next.output,
    total: current.total + next.total
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('已取消', 'AbortError'))
  }

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      reject(new DOMException('已取消', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

function mergeChange(target: AgentTurnChange, next?: AgentTurnChange): void {
  if (!next) return
  for (const id of next.createdNodeIds) {
    if (!target.createdNodeIds.includes(id)) target.createdNodeIds.push(id)
  }
  for (const id of next.updatedNodeIds) {
    if (!target.updatedNodeIds.includes(id)) target.updatedNodeIds.push(id)
  }
  for (const id of next.deletedNodeIds) {
    if (!target.deletedNodeIds.includes(id)) target.deletedNodeIds.push(id)
  }
  for (const id of next.createdEdgeIds) {
    if (!target.createdEdgeIds.includes(id)) target.createdEdgeIds.push(id)
  }
  for (const id of next.deletedEdgeIds) {
    if (!target.deletedEdgeIds.includes(id)) target.deletedEdgeIds.push(id)
  }
  for (const [id, title] of Object.entries(next.previousTitles)) {
    if (!(id in target.previousTitles)) target.previousTitles[id] = title
  }
  for (const [id, position] of Object.entries(next.previousPositions)) {
    if (!(id in target.previousPositions)) {
      target.previousPositions[id] = position
    }
  }
  if (next.timelineUpdated) target.timelineUpdated = true
  if (next.stageUpdated) target.stageUpdated = true
}

function createTurn(sessionId: string, userText: string): AgentTurn {
  return {
    id: randomUUID(),
    sessionId,
    status: 'running',
    userText,
    assistantText: '',
    toolCalls: [],
    proposalIds: [],
    change: {
      createdNodeIds: [],
      updatedNodeIds: [],
      deletedNodeIds: [],
      createdEdgeIds: [],
      deletedEdgeIds: [],
      previousTitles: {},
      previousPositions: {}
    },
    startedAt: new Date().toISOString()
  }
}

export function startTurn(
  request: AgentChatRequest,
  callbacks: AgentTurnCallbacks
): { turnId: string } {
  const root = requireProjectRoot()
  const sessionId = request.sessionId?.trim() || 'main'
  const scope: AgentScope = {
    projectPath: root,
    canvasId: request.canvasId,
    selectedNodeIds: [
      ...new Set([
        ...request.selectedNodeIds,
        ...(request.attachments?.map((item) => item.nodeId) ?? [])
      ])
    ],
    ...(request.generationModels
      ? { generationModels: request.generationModels }
      : {}),
    ...(request.timelineId ? { timelineId: request.timelineId } : {}),
    ...(request.studioNodeId ? { studioNodeId: request.studioNodeId } : {}),
    selectedClipIds: [...new Set(request.selectedClipIds ?? [])],
    playheadMs: Math.max(0, request.playheadMs ?? 0)
  }
  const permissionMode =
    request.permissionMode === 'read-only' ? 'read-only' : 'current'
  const turn = createTurn(sessionId, request.message)
  const active: ActiveTurn = {
    controller: new AbortController(),
    turn,
    scope,
    pending: new Map(),
    confirmations: new Map()
  }
  activeTurns.set(turn.id, active)

  void runTurn({
    root,
    request,
    scope,
    permissionMode,
    turn,
    active,
    callbacks
  })

  return { turnId: turn.id }
}

async function buildHistoryMessages(
  root: string,
  sessionId: string,
  currentTurnId: string
): Promise<AgentChatMessage[]> {
  const snapshot = await loadSession(root, sessionId)
  const dialogue = snapshot.messages.filter(
    (message) =>
      (message.role === 'user' || message.role === 'assistant') &&
      message.turnId !== currentTurnId &&
      message.content.trim()
  )
  const remaining = dialogue.slice(snapshot.summary?.coveredMessages ?? 0)
  const picked: AgentChatMessage[] = []
  let totalChars = 0

  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    const message = remaining[index]
    if (
      picked.length > 0 &&
      totalChars + message.content.length > MAX_HISTORY_CHARS
    ) {
      break
    }
    picked.unshift({ role: message.role, content: message.content })
    totalChars += message.content.length
  }

  return [
    ...(snapshot.summary
      ? [
          {
            role: 'system' as const,
            content: `[之前对话摘要]\n${snapshot.summary.content}`
          }
        ]
      : []),
    ...picked
  ]
}

async function runTurn(input: {
  root: string
  request: AgentChatRequest
  scope: AgentScope
  permissionMode: 'read-only' | 'current'
  turn: AgentTurn
  active: ActiveTurn
  callbacks: AgentTurnCallbacks
}): Promise<void> {
  const { root, request, scope, permissionMode, turn, active, callbacks } =
    input

  try {
    await ensureSession(root, turn.sessionId)
    await expireSessionProposals(root, turn.sessionId)
    callbacks.sendEvent({ type: 'turn_start', turn })
    await appendMessage(root, turn.sessionId, {
      id: randomUUID(),
      role: 'user',
      content: request.message,
      turnId: turn.id
    })
    await ensureSessionTitle(root, turn.sessionId, request.message)

    const runtime = await resolveTextModel(request.modelKey)
    if (!runtime) {
      throw new Error('还没有配置文本模型，请先在设置中配置 text.chat 模型')
    }

    const catalog = await skillCatalogPrompt(root)
    const systemPrompt = `${systemPromptFor(request.profileId)}${attachmentContext(
      request.attachments
    )}${referenceContext(request.references)}${generationModelsContext(
      request.generationModels
    )}`
    const history = await buildHistoryMessages(
      root,
      turn.sessionId,
      turn.id
    )
    const messages: AgentChatMessage[] = [
      {
        role: 'system',
        content: catalog ? `${systemPrompt}\n\n${catalog}` : systemPrompt
      },
      ...history,
      { role: 'user', content: request.message }
    ]

    const requestConfirmation = (
      call: AgentToolCall,
      reason: string
    ): Promise<boolean> => {
      const signal = active.controller.signal
      if (signal.aborted) {
        return Promise.reject(new DOMException('已取消', 'AbortError'))
      }

      return new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => {
          active.confirmations.delete(call.callId)
          cleanup()
          resolve(false)
        }, 60_000)

        const cleanup = (): void => {
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
        }

        const onAbort = (): void => {
          active.confirmations.delete(call.callId)
          cleanup()
          reject(new DOMException('已取消', 'AbortError'))
        }

        signal.addEventListener('abort', onAbort, { once: true })
        active.confirmations.set(call.callId, {
          resolve: (approved) => {
            cleanup()
            resolve(approved)
          },
          reject: (error) => {
            cleanup()
            reject(error)
          }
        })

        callbacks.sendEvent({
          type: 'confirm_request',
          turnId: turn.id,
          call,
          reason
        })
      })
    }

    let steps = 0
    while (steps < MAX_STEPS) {
      steps += 1
      active.controller.signal.throwIfAborted()

      const beforeTextLength = turn.assistantText.length
      const result = await abortable(
        chatWithTools({
          runtime,
          messages,
          tools: toolDefinitionsForModel(request.profileId, permissionMode),
          signal: active.controller.signal,
          onTextDelta: (text) => {
            turn.assistantText += text
            callbacks.sendEvent({
              type: 'text_delta',
              turnId: turn.id,
              text
            })
          }
        }),
        active.controller.signal
      )

      if (result.usage) {
        turn.usage = addUsage(turn.usage, result.usage)
      }

      if (
        turn.assistantText.length === beforeTextLength &&
        result.content.trim()
      ) {
        turn.assistantText += result.content
        callbacks.sendEvent({
          type: 'text_delta',
          turnId: turn.id,
          text: result.content
        })
      }

      if (result.toolCalls.length === 0) break

      messages.push(result.assistantMessage)

      for (const call of result.toolCalls) {
        const toolCall: AgentToolCall = {
          callId: call.callId,
          name: call.name,
          args: call.args
        }
        turn.toolCalls.push(toolCall)
        callbacks.sendEvent({
          type: 'tool_start',
          turnId: turn.id,
          call: toolCall
        })
        await appendMessage(root, turn.sessionId, {
          id: randomUUID(),
          role: 'tool',
          content: JSON.stringify({ name: call.name, args: call.args }),
          turnId: turn.id,
          callId: call.callId,
          toolName: call.name,
          toolStatus: 'running'
        })

        let toolResult: AgentToolResultInput
        try {
          assertToolAllowed(toolCall, scope, permissionMode)
          const confirmation = toolConfirmationReason(toolCall)
          const approved = confirmation
            ? await requestConfirmation(toolCall, confirmation)
            : true

          if (!approved) {
            toolResult = {
              turnId: turn.id,
              callId: call.callId,
              ok: false,
              error: '用户取消了该操作'
            }
          } else {
            const tool = getTool(toolCall.name)
            if (tool?.executor === 'main') {
              const mainResult = await executeMainTool(toolCall, scope)
              toolResult = {
                turnId: turn.id,
                callId: call.callId,
                ok: mainResult.ok,
                ...(mainResult.result !== undefined
                  ? { result: mainResult.result }
                  : {}),
                ...(mainResult.error ? { error: mainResult.error } : {})
              }
            } else {
              callbacks.sendToolCall({
                ...toolCall,
                turnId: turn.id,
                permissionMode,
                scope
              })
              toolResult = await waitForToolResult(
                turn.id,
                call.callId,
                active.controller.signal,
                toolTimeoutMs(call.name)
              )
            }
          }
          mergeChange(turn.change, toolResult.change)
          if (toolResult.ok && isTimelineWriteTool(call.name)) {
            turn.change.timelineUpdated = true
          }
          for (const id of toolResult.change?.createdNodeIds ?? []) {
            if (!scope.selectedNodeIds.includes(id)) {
              scope.selectedNodeIds.push(id)
            }
          }
          const proposalId =
            toolResult.ok &&
            toolResult.result &&
            typeof toolResult.result === 'object'
              ? (toolResult.result as { proposalId?: unknown }).proposalId
              : undefined
          if (typeof proposalId === 'string' && proposalId) {
            turn.proposalIds.push(proposalId)
          }
        } catch (error) {
          const message =
            error instanceof AgentToolError || error instanceof Error
              ? error.message
              : '工具执行失败'
          toolResult = {
            turnId: turn.id,
            callId: call.callId,
            ok: false,
            error: message
          }
        }

        callbacks.sendEvent({
          type: 'tool_end',
          turnId: turn.id,
          result: toolResult
        })
        await appendMessage(root, turn.sessionId, {
          id: randomUUID(),
          role: 'tool',
          content: toolResult.ok
            ? JSON.stringify(toolResult.result ?? { ok: true })
            : toolResult.error ?? '工具执行失败',
          turnId: turn.id,
          callId: call.callId,
          toolName: call.name,
          toolStatus: toolResult.ok ? 'ok' : 'error'
        })

        messages.push({
          role: 'tool',
          tool_call_id: call.callId,
          content: JSON.stringify(
            toolResult.ok
              ? toolResult.result ?? { ok: true }
              : { error: toolResult.error ?? '工具执行失败' }
          )
        })
      }
    }

    if (steps >= MAX_STEPS) {
      throw new Error('本轮工具调用次数过多，已停止')
    }

    if (active.controller.signal.aborted) {
      throw new DOMException('已取消', 'AbortError')
    }

    turn.status = 'completed'
    turn.endedAt = new Date().toISOString()
    await finishTurn(root, turn, callbacks)
  } catch (error) {
    if (
      active.controller.signal.aborted ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      turn.status = 'cancelled'
      turn.error = '已取消'
    } else {
      turn.status = 'error'
      turn.error = error instanceof Error ? error.message : '本轮执行失败'
      callbacks.sendEvent({
        type: 'error',
        turnId: turn.id,
        message: turn.error
      })
    }
    turn.endedAt = new Date().toISOString()
    await finishTurn(root, turn, callbacks).catch(() => undefined)
  } finally {
    activeTurns.delete(turn.id)
  }
}

async function finishTurn(
  root: string,
  turn: AgentTurn,
  callbacks: AgentTurnCallbacks
): Promise<void> {
  if (turn.assistantText.trim()) {
    await appendMessage(root, turn.sessionId, {
      id: randomUUID(),
      role: 'assistant',
      content: turn.assistantText,
      turnId: turn.id
    })
  }
  await appendTurn(root, turn.sessionId, turn)
  callbacks.sendEvent({ type: 'turn_end', turn })
}

function waitForToolResult(
  turnId: string,
  callId: string,
  signal: AbortSignal,
  timeoutMs = TOOL_TIMEOUT_MS
): Promise<AgentToolResultInput> {
  const active = activeTurns.get(turnId)
  if (!active) return Promise.reject(new Error('当前回合已结束'))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      active.pending.delete(callId)
      signal.removeEventListener('abort', onAbort)
      reject(new Error('工具执行超时'))
    }, timeoutMs)

    const onAbort = (): void => {
      clearTimeout(timer)
      active.pending.delete(callId)
      reject(new DOMException('已取消', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })

    active.pending.set(callId, {
      resolve: (result) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        resolve(result)
      },
      reject: (error) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    })
  })
}

export function resolveToolResult(input: AgentToolResultInput): void {
  const active = activeTurns.get(input.turnId)
  const pending = active?.pending.get(input.callId)
  if (!pending) return
  active?.pending.delete(input.callId)
  pending.resolve(input)
}

export function resolveConfirmation(input: AgentConfirmInput): void {
  const active = activeTurns.get(input.turnId)
  const pending = active?.confirmations.get(input.callId)
  if (!pending) return
  active?.confirmations.delete(input.callId)
  pending.resolve(input.approved)
}

export function cancelTurn(turnId: string): void {
  const active = activeTurns.get(turnId)
  if (!active) return
  active.controller.abort(new DOMException('已取消', 'AbortError'))
  for (const [callId, pending] of active.confirmations) {
    active.confirmations.delete(callId)
    pending.reject(new DOMException('已取消', 'AbortError'))
  }
}

/** 供提案登记校验回合是否仍然活跃，并取得真实 sessionId */
export function getActiveTurnInfo(
  turnId: string
): { sessionId: string; scope: AgentScope } | null {
  const active = activeTurns.get(turnId)
  if (!active) return null
  return { sessionId: active.turn.sessionId, scope: active.scope }
}
