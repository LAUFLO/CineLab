import { join } from 'node:path'
import type {
  AgentChatRequest,
  AgentConfirmInput,
  AgentEvent,
  AgentScope,
  AgentToolCall,
  AgentToolCallRequest,
  AgentToolResultInput,
  AgentTurn
} from '@shared/agent'
import type {
  AgentSession,
  AgentSessionEvent,
  ExtensionFactory
} from '@earendil-works/pi-coding-agent'
import { resolveTextModel } from '../model'
import { skillCatalogPrompt } from '../skills'
import { requireProjectRoot } from '../session'
import { createPiModelRuntime } from './model-runtime'
import { createPiTools } from './tools'
import { createPiResourceLoader } from './resources'
import { acquirePiSessionLock } from './session-lock'
import { openPiSessionManager, createPiSessionId } from './session'
import {
  attachmentContext,
  generationModelsContext,
  referenceContext,
  stageContext,
  systemPromptFor
} from './prompt'
import {
  piConfirmationReason,
  piPermissionBlock
} from './permissions'
import {
  createAgentTurn,
  looksLikePreamble,
  mergeChange,
  syncScopeWithChange,
  textOfContent,
  usageOf
} from './events'
import { toolTimeoutMs } from './timeouts'
import { loadPiCodingAgent } from './loader'

export interface AgentTurnCallbacks {
  sendEvent(event: AgentEvent): void
  sendToolCall(call: AgentToolCallRequest): void
}

interface PendingTool {
  resolve(result: AgentToolResultInput): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

interface PendingConfirmation {
  resolve(approved: boolean): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

interface ActivePiTurn {
  turn: AgentTurn
  sessionId: string
  windowId: number
  scope: AgentScope
  session: AgentSession | null
  release: (() => Promise<void>) | null
  controller: AbortController
  pending: Map<string, PendingTool>
  confirmations: Map<string, PendingConfirmation>
  continueCount: number
  finished: boolean
  callbacks: AgentTurnCallbacks
}

const activeTurns = new Map<string, ActivePiTurn>()

function createScope(request: AgentChatRequest): AgentScope {
  return {
    projectPath: requireProjectRoot(),
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
    ...(request.stageNodeId ? { stageNodeId: request.stageNodeId } : {}),
    selectedClipIds: [...new Set(request.selectedClipIds ?? [])],
    playheadMs: Math.max(0, request.playheadMs ?? 0)
  }
}

function rejectPending(active: ActivePiTurn): void {
  for (const [callId, pending] of active.pending) {
    clearTimeout(pending.timer)
    active.pending.delete(callId)
    pending.reject(new DOMException('已取消', 'AbortError'))
  }
  for (const [callId, pending] of active.confirmations) {
    clearTimeout(pending.timer)
    active.confirmations.delete(callId)
    pending.reject(new DOMException('已取消', 'AbortError'))
  }
}

async function finalizeTurn(
  active: ActivePiTurn,
  status: AgentTurn['status'],
  error?: string
): Promise<void> {
  if (active.finished) return
  active.finished = true
  active.turn.status = status
  active.turn.endedAt = new Date().toISOString()
  if (error) active.turn.error = error

  rejectPending(active)

  const session = active.session
  if (session) {
    try {
      session.sessionManager.appendCustomEntry('cinelabTurn', active.turn)
    } catch {
      // 会话落盘失败不影响本轮 UI
    }
  }

  if (status === 'error' && error) {
    active.callbacks.sendEvent({
      type: 'error',
      turnId: active.turn.id,
      message: error
    })
  }
  active.callbacks.sendEvent({ type: 'turn_end', turn: active.turn })
  activeTurns.delete(active.turn.id)

  try {
    session?.dispose()
  } catch {
    // 忽略 dispose 失败
  }
  await active.release?.().catch(() => undefined)
}

function installContinueHook(active: ActivePiTurn): void {
  if (!active.session) return
  const session = active.session
  const inner = session.agent.finishTurn
  session.agent.finishTurn = async (turnContext, signal) => {
    const decision = await inner?.(turnContext, signal)
    if (decision) return decision
    const message = turnContext.message
    if (message.stopReason !== 'stop') return
    if (turnContext.toolResults.length > 0) return
    if (message.content.some((part) => part.type === 'toolCall')) return
    if (!looksLikePreamble(textOfContent(message.content))) return
    if (active.continueCount >= 2) return
    active.continueCount += 1
    return { action: 'continue' }
  }
}

function requestConfirmation(
  active: ActivePiTurn,
  call: AgentToolCall,
  reason: string
): Promise<boolean> {
  if (active.controller.signal.aborted) {
    return Promise.reject(new DOMException('已取消', 'AbortError'))
  }

  return new Promise<boolean>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer)
      active.controller.signal.removeEventListener('abort', onAbort)
    }
    const timer = setTimeout(() => {
      active.confirmations.delete(call.callId)
      cleanup()
      resolve(false)
    }, 60_000)
    const onAbort = (): void => {
      active.confirmations.delete(call.callId)
      cleanup()
      reject(new DOMException('已取消', 'AbortError'))
    }

    active.controller.signal.addEventListener('abort', onAbort, { once: true })
    active.confirmations.set(call.callId, {
      resolve: (approved) => {
        cleanup()
        resolve(approved)
      },
      reject: (error) => {
        cleanup()
        reject(error)
      },
      timer
    })
    active.callbacks.sendEvent({
      type: 'confirm_request',
      turnId: active.turn.id,
      call,
      reason
    })
  })
}

function createToolCallbacks(
  active: ActivePiTurn,
  callbacks: AgentTurnCallbacks
): {
  sendToolCall: (call: AgentToolCallRequest) => void
  waitForToolResult: (
    callId: string,
    signal?: AbortSignal
  ) => Promise<AgentToolResultInput>
} {
  return {
    sendToolCall: (call) => callbacks.sendToolCall(call),
    waitForToolResult: (callId, signal) => {
      const name = active.turn.toolCalls.find(
        (item) => item.callId === callId
      )?.name
      const timeout = toolTimeoutMs(name)
      const combined = signal
        ? AbortSignal.any([active.controller.signal, signal])
        : active.controller.signal

      return new Promise<AgentToolResultInput>((resolve, reject) => {
        if (combined.aborted) {
          reject(new DOMException('已取消', 'AbortError'))
          return
        }
        const onAbort = (): void => {
          const pending = active.pending.get(callId)
          if (pending) {
            clearTimeout(pending.timer)
            active.pending.delete(callId)
          }
          reject(new DOMException('已取消', 'AbortError'))
        }
        const timer = setTimeout(() => {
          active.pending.delete(callId)
          combined.removeEventListener('abort', onAbort)
          reject(new Error('工具执行超时'))
        }, timeout)

        combined.addEventListener('abort', onAbort, { once: true })
        active.pending.set(callId, {
          resolve: (result) => {
            clearTimeout(timer)
            combined.removeEventListener('abort', onAbort)
            resolve(result)
          },
          reject: (error) => {
            clearTimeout(timer)
            combined.removeEventListener('abort', onAbort)
            reject(error)
          },
          timer
        })
      })
    }
  }
}

function handlePiEvent(
  active: ActivePiTurn,
  event: AgentSessionEvent,
  callbacks: AgentTurnCallbacks
): void {
  if (event.type === 'message_update') {
    const update = event.assistantMessageEvent
    if (update.type === 'text_delta') {
      active.turn.assistantText += update.delta
      callbacks.sendEvent({
        type: 'text_delta',
        turnId: active.turn.id,
        text: update.delta
      })
    } else if (update.type === 'thinking_delta') {
      callbacks.sendEvent({
        type: 'thinking_delta',
        turnId: active.turn.id,
        text: update.delta
      })
    }
    return
  }

  if (event.type === 'tool_execution_start') {
    const call: AgentToolCall = {
      callId: event.toolCallId,
      name: event.toolName,
      args:
        event.args && typeof event.args === 'object'
          ? (event.args as Record<string, unknown>)
          : {}
    }
    active.turn.toolCalls.push(call)
    callbacks.sendEvent({
      type: 'tool_start',
      turnId: active.turn.id,
      call
    })
    return
  }

  if (event.type === 'tool_execution_end') {
    const result = event.result
    const details = (result.details ?? {}) as {
      change?: AgentTurn['change']
      proposalId?: string
    }
    mergeChange(active.turn.change, details.change)
    syncScopeWithChange(active.scope, details.change)
    if (details.proposalId) {
      active.turn.proposalIds.push(details.proposalId)
    }
    const text = textOfContent(result.content)
    callbacks.sendEvent({
      type: 'tool_end',
      turnId: active.turn.id,
      result: {
        callId: event.toolCallId,
        ok: !event.isError,
        ...(event.isError ? { error: text || '工具执行失败' } : { result: text })
      }
    })
    return
  }

  if (event.type === 'message_end' && event.message.role === 'assistant') {
    active.turn.usage = usageOf(event.message.usage) ?? active.turn.usage
    if (event.message.stopReason === 'length') {
      active.turn.error = '模型回复因长度限制被截断'
    } else if (event.message.stopReason === 'error') {
      active.turn.error =
        event.message.errorMessage ?? '模型请求失败'
    }
    return
  }

  if (event.type === 'compaction_start' || event.type === 'compaction_end') {
    callbacks.sendEvent({
      type: 'compaction',
      turnId: active.turn.id,
      active: event.type === 'compaction_start'
    })
    return
  }

  if (event.type === 'auto_retry_start') {
    callbacks.sendEvent({
      type: 'retry',
      turnId: active.turn.id,
      message: '模型请求失败，正在重试'
    })
    return
  }

  if (event.type === 'agent_settled') {
    const status =
      active.controller.signal.aborted
        ? 'cancelled'
        : active.turn.error
          ? 'error'
          : 'completed'
    void finalizeTurn(active, status, active.turn.error)
  }
}

async function runTurn(input: {
  root: string
  request: AgentChatRequest
  scope: AgentScope
  turn: AgentTurn
  active: ActivePiTurn
  windowId: number
}): Promise<void> {
  const { root, request, scope, turn, active, windowId } = input

  try {
    const runtime = await resolveTextModel(request.modelKey)
    if (!runtime) {
      throw new Error('还没有配置文本模型，请先在设置中配置 text.chat 模型')
    }

    active.release = await acquirePiSessionLock(
      root,
      turn.sessionId,
      windowId
    )
    const history = await openPiSessionManager(
      root,
      turn.sessionId,
      request.message
    )
    const { modelRuntime, model } = await createPiModelRuntime(runtime)
    const coding = await loadPiCodingAgent()
    const settingsManager = coding.SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 3 }
    })
    const catalog = await skillCatalogPrompt(root)
    const systemPrompt = [
      systemPromptFor(request.profileId),
      stageContext(request.stageNodeId),
      attachmentContext(request.attachments),
      referenceContext(request.references),
      generationModelsContext(request.generationModels),
      catalog
    ]
      .filter(Boolean)
      .join('\n\n')

    const toolCallbacks = createToolCallbacks(active, active.callbacks)
    const customTools = createPiTools({
      turnId: turn.id,
      scope,
      profileId: request.profileId,
      permissionMode: request.permissionMode,
      sendToolCall: toolCallbacks.sendToolCall,
      waitForToolResult: toolCallbacks.waitForToolResult
    })

    const extensionFactory: ExtensionFactory = (pi) => {
      pi.on('tool_call', async (event) => {
        const call: AgentToolCall = {
          callId: event.toolCallId,
          name: event.toolName,
          args:
            event.input && typeof event.input === 'object'
              ? (event.input as Record<string, unknown>)
              : {}
        }
        const blocked = piPermissionBlock(
          call,
          scope,
          request.permissionMode
        )
        if (blocked) return { block: true, reason: blocked }
        const reason = piConfirmationReason(call)
        if (!reason) return
        const approved = await requestConfirmation(active, call, reason)
        if (!approved) {
          return { block: true, reason: '用户取消该操作' }
        }
      })
    }

    const resourceLoader = await createPiResourceLoader({
      root,
      agentDir: join(root, '.cinelab', 'agent'),
      systemPrompt,
      settingsManager,
      extensionFactories: [extensionFactory]
    })

    const { session } = await coding.createAgentSession({
      cwd: root,
      agentDir: join(root, '.cinelab', 'agent'),
      modelRuntime,
      model,
      thinkingLevel: 'off',
      sessionManager: history,
      resourceLoader,
      settingsManager,
      noTools: 'builtin',
      customTools
    })
    active.session = session
    installContinueHook(active)

    const unsubscribe = session.subscribe((event) => {
      handlePiEvent(active, event, active.callbacks)
    })

    active.callbacks.sendEvent({ type: 'turn_start', turn })
    try {
      await session.prompt(request.message)
    } finally {
      unsubscribe()
    }

    if (!active.finished) {
      const status =
        active.controller.signal.aborted
          ? 'cancelled'
          : active.turn.error
            ? 'error'
            : 'completed'
      await finalizeTurn(active, status, active.turn.error)
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '本轮执行失败'
    if (active.controller.signal.aborted) {
      await finalizeTurn(active, 'cancelled', '已取消')
    } else {
      await finalizeTurn(active, 'error', message)
    }
  }
}

export function startTurn(
  request: AgentChatRequest,
  callbacks: AgentTurnCallbacks,
  windowId = 0
): { turnId: string } {
  const root = requireProjectRoot()
  const sessionId = request.sessionId?.trim() || createPiSessionId()
  const scope = createScope(request)
  const turn = createAgentTurn(sessionId, request.message)
  const active: ActivePiTurn = {
    turn,
    sessionId,
    windowId,
    scope,
    session: null,
    release: null,
    controller: new AbortController(),
    pending: new Map(),
    confirmations: new Map(),
    continueCount: 0,
    finished: false,
    callbacks
  }
  activeTurns.set(turn.id, active)

  void runTurn({ root, request, scope, turn, active, windowId })
  return { turnId: turn.id }
}

export function cancelTurn(turnId: string, windowId?: number): void {
  const active = activeTurns.get(turnId)
  if (!active) return
  if (windowId !== undefined && active.windowId !== windowId) return
  active.controller.abort(new DOMException('已取消', 'AbortError'))
  void active.session?.abort()
  rejectPending(active)
}

export function resolveToolResult(
  input: AgentToolResultInput,
  windowId?: number
): void {
  const active = activeTurns.get(input.turnId)
  if (!active) return
  if (windowId !== undefined && active.windowId !== windowId) return
  const pending = active.pending.get(input.callId)
  if (!pending) return
  active.pending.delete(input.callId)
  pending.resolve(input)
}

export function resolveConfirmation(
  input: AgentConfirmInput,
  windowId?: number
): void {
  const active = activeTurns.get(input.turnId)
  if (!active) return
  if (windowId !== undefined && active.windowId !== windowId) return
  const pending = active.confirmations.get(input.callId)
  if (!pending) return
  active.confirmations.delete(input.callId)
  pending.resolve(input.approved)
}

export function getActiveTurnInfo(
  turnId: string
): { sessionId: string; scope: AgentScope } | null {
  const active = activeTurns.get(turnId)
  if (!active) return null
  return { sessionId: active.sessionId, scope: active.scope }
}
