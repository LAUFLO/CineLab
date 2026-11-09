import { randomUUID } from 'node:crypto'
import type {
  AgentChatRequest,
  AgentConfirmInput,
  AgentEvent,
  AgentProfileId,
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
  requireProjectRoot
} from './session'
import {
  AgentToolError,
  assertToolAllowed,
  getTool,
  toolConfirmationReason,
  toolDefinitionsForModel
} from './tools'
import { executeMainTool } from './main-tools'
import { expireSessionProposals } from './proposals'
import { skillCatalogPrompt } from './skills'

const MAX_STEPS = 8
const TOOL_TIMEOUT_MS = 30_000

const CANVAS_SYSTEM_PROMPT = `你是 CineLab 的画布助手。你可以读取画布、创建文本/图片/视频/音频节点、修改标题、移动节点、连接节点、删除节点、分组和解散分组，也可以登记生成提案。

规则：
- 只操作当前画布。
- 创建节点不需要选中；修改、移动、连接、删除只操作选中节点或本轮新建的节点。
- 操作前先用 canvas_get 确认现有节点。
- 不要编造节点 ID、坐标或连线。
- 需要生成图片、视频、音频或文本时，先调用 generation_catalog 确认模型和参数，再调用 generation_propose 登记提案。
- generation_propose 不会立即生成，也不会扣费；必须告诉用户「已生成提案，请在面板中确认」，不要声称已经开始生成。
- 用户确认后由界面提交生成；你不能自行提交提案。
- 新消息会让旧提案失效，需要时重新登记。
- 用中文回复，简洁说明你做了什么。
- 需要用户先选中节点时，明确提示。`

const CLIP_SYSTEM_PROMPT = `你是 CineLab 的剪辑助手。你只操作当前打开的剪辑室时间线。

规则：
- 修改前先用 timeline_get 读取轨道、片段、选中片段和播放头。
- 不要编造 clipId、trackId 或时间码。
- 片段 ID 必须来自 timeline_get；未指定片段时，默认使用当前选中片段。
- 时间单位统一为毫秒；移动、裁剪、切分、删除会改变成片时长，操作前先说明影响。
- 删除片段、批量移动等破坏性操作，如果用户没有明确要求，先提出方案再执行。
- 轨道锁定、不可见或静音状态会影响操作，先检查再修改。
- 生成图片/视频仍走 canvas 的生成提案工具；剪辑阶段不直接发起付费生成。
- 所有修改都进入时间线撤销历史，同一轮操作只产生一条撤销记录。
- 用中文回复，简洁说明你改了什么。`

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
    selectedNodeIds: [...new Set(request.selectedNodeIds)],
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
    const systemPrompt = systemPromptFor(request.profileId)
    const messages: AgentChatMessage[] = [
      {
        role: 'system',
        content: catalog ? `${systemPrompt}\n\n${catalog}` : systemPrompt
      },
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
                active.controller.signal
              )
            }
          }
          mergeChange(turn.change, toolResult.change)
          if (toolResult.ok && call.name.startsWith('timeline_')) {
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
  signal: AbortSignal
): Promise<AgentToolResultInput> {
  const active = activeTurns.get(turnId)
  if (!active) return Promise.reject(new Error('当前回合已结束'))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      active.pending.delete(callId)
      signal.removeEventListener('abort', onAbort)
      reject(new Error('工具执行超时'))
    }, TOOL_TIMEOUT_MS)

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
