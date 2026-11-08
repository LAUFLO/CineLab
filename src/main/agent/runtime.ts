import { randomUUID } from 'node:crypto'
import type {
  AgentChatRequest,
  AgentEvent,
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
  requireProjectRoot
} from './session'
import {
  AgentToolError,
  assertToolAllowed,
  getTool,
  toolDefinitionsForModel
} from './tools'
import { executeMainTool } from './main-tools'
import { skillCatalogPrompt } from './skills'

const MAX_STEPS = 8
const TOOL_TIMEOUT_MS = 30_000

const SYSTEM_PROMPT = `你是 CineLab 的画布助手。你可以调用工具读取当前画布、修改选中节点的标题。

规则：
- 只操作当前画布。
- 修改节点前先用 canvas_get 确认节点。
- 只能修改 canvas_get 返回的 selectedNodes 中的节点。
- 不要编造节点 ID。
- 用中文回复，简洁说明你做了什么。
- 如果用户没有选中节点，提示他先选中。`

export interface AgentTurnCallbacks {
  sendEvent(event: AgentEvent): void
  sendToolCall(call: AgentToolCallRequest): void
}

interface ActiveTurn {
  controller: AbortController
  pending: Map<
    string,
    {
      resolve(result: AgentToolResultInput): void
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
}

function createTurn(sessionId: string, userText: string): AgentTurn {
  return {
    id: randomUUID(),
    sessionId,
    status: 'running',
    userText,
    assistantText: '',
    toolCalls: [],
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
    selectedNodeIds: [...new Set(request.selectedNodeIds)]
  }
  const permissionMode =
    request.permissionMode === 'read-only' ? 'read-only' : 'current'
  const turn = createTurn(sessionId, request.message)
  const active: ActiveTurn = {
    controller: new AbortController(),
    pending: new Map()
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
    callbacks.sendEvent({ type: 'turn_start', turn })
    await appendMessage(root, turn.sessionId, {
      id: randomUUID(),
      role: 'user',
      content: request.message,
      turnId: turn.id
    })

    const runtime = await resolveTextModel()
    if (!runtime) {
      throw new Error('还没有配置文本模型，请先在设置中配置 text.chat 模型')
    }

    const catalog = await skillCatalogPrompt(root)
    const messages: AgentChatMessage[] = [
      {
        role: 'system',
        content: catalog ? `${SYSTEM_PROMPT}\n\n${catalog}` : SYSTEM_PROMPT
      },
      { role: 'user', content: request.message }
    ]

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
          mergeChange(turn.change, toolResult.change)
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

export function cancelTurn(turnId: string): void {
  const active = activeTurns.get(turnId)
  if (!active) return
  active.controller.abort(new DOMException('已取消', 'AbortError'))
}
