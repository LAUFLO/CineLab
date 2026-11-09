import { create } from 'zustand'
import type {
  AgentEvent,
  AgentModelInfo,
  AgentPermissionMode,
  AgentProposal,
  AgentSessionInfo,
  AgentSessionMessage,
  AgentToolCall,
  AgentTurn
} from '@shared/agent'
import { isStudioNode, useCanvasStore } from '../stores/canvas'
import { useProjectStore } from '../stores/project'
import { useStudioStore } from '../stores/studio'
import { useTimelineStore } from '../stores/timeline'

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  turnId?: string
  callId?: string
  toolName?: string
  toolStatus?: 'running' | 'ok' | 'error'
}

interface AgentState {
  visible: boolean
  sessionId: string
  sessionTitle: string
  sessions: AgentSessionInfo[]
  messages: AgentMessage[]
  turns: AgentTurn[]
  running: boolean
  currentTurnId: string | null
  permissionMode: AgentPermissionMode
  modelKey: string | null
  modelInfo: AgentModelInfo | null
  textModels: AgentModelInfo[]
  error: string | null
  lastTurn: AgentTurn | null
  proposal: AgentProposal | null
  proposalBusy: boolean
  pendingConfirm: {
    turnId: string
    call: AgentToolCall
    reason: string
  } | null
  confirming: boolean
  toggle: () => void
  open: () => void
  close: () => void
  setPermissionMode: (mode: AgentPermissionMode) => void
  loadSessions: () => Promise<void>
  loadSession: (sessionId?: string) => Promise<void>
  newSession: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  loadModelInfo: () => Promise<void>
  loadTextModels: () => Promise<void>
  setModelKey: (modelKey: string | null) => Promise<void>
  loadProposal: () => Promise<void>
  submitProposal: () => Promise<void>
  cancelProposal: () => Promise<void>
  confirmTool: (approved: boolean) => Promise<void>
  send: (text: string) => Promise<void>
  cancel: () => Promise<void>
  applyEvent: (event: AgentEvent) => void
  undoLastTurn: () => void
  clearError: () => void
}

let messageSeq = 0

function nextMessageId(): string {
  messageSeq += 1
  return `agent-message-${Date.now()}-${messageSeq}`
}

export function agentTurnChangeCount(turn: AgentTurn | null): number {
  if (!turn) return 0
  const change = turn.change
  return (
    (change.createdNodeIds?.length ?? 0) +
    (change.updatedNodeIds?.length ?? 0) +
    (change.deletedNodeIds?.length ?? 0) +
    (change.createdEdgeIds?.length ?? 0) +
    (change.deletedEdgeIds?.length ?? 0) +
    (change.timelineUpdated ? 1 : 0)
  )
}

function toAgentMessage(message: AgentSessionMessage): AgentMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.turnId ? { turnId: message.turnId } : {}),
    ...(message.callId ? { callId: message.callId } : {}),
    ...(message.toolName ? { toolName: message.toolName } : {}),
    ...(message.toolStatus
      ? {
          toolStatus:
            message.toolStatus === 'running' ? 'ok' : message.toolStatus
        }
      : {})
  }
}

function appendText(
  messages: AgentMessage[],
  turnId: string,
  text: string
): AgentMessage[] {
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant' && last.turnId === turnId) {
    return [
      ...messages.slice(0, -1),
      { ...last, content: last.content + text }
    ]
  }
  return [
    ...messages,
    {
      id: nextMessageId(),
      role: 'assistant',
      content: text,
      turnId
    }
  ]
}

function readStored(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(key)
      : null
  } catch {
    return null
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // 无痕模式或存储被禁用时忽略
  }
}

function modelKeyOf(model: AgentModelInfo): string {
  return `${model.providerId}/${model.modelId}`
}

export const useAgentStore = create<AgentState>((set, get) => ({
  visible: false,
  sessionId: '',
  sessionTitle: '新对话',
  sessions: [],
  messages: [],
  turns: [],
  running: false,
  currentTurnId: null,
  permissionMode: 'current',
  modelKey: readStored('cinelab.agent.modelKey'),
  modelInfo: null,
  textModels: [],
  error: null,
  lastTurn: null,
  proposal: null,
  proposalBusy: false,
  pendingConfirm: null,
  confirming: false,

  toggle: () => set((state) => ({ visible: !state.visible })),
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  setPermissionMode: (mode) => set({ permissionMode: mode }),
  clearError: () => set({ error: null }),

  loadSessions: async () => {
    try {
      let sessions = await window.api.agent.sessionList()
      const stored = readStored('cinelab.agent.sessionId')
      let target =
        sessions.find((session) => session.sessionId === stored) ??
        sessions[0]
      if (!target) {
        target = await window.api.agent.sessionCreate('新对话')
        sessions = [target, ...sessions]
      }
      set({ sessions })
      await get().loadSession(target.sessionId)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '读取会话失败' })
    }
  },

  loadSession: async (sessionId) => {
    const id = sessionId ?? get().sessionId
    if (!id) {
      await get().loadSessions()
      return
    }
    try {
      const session = await window.api.agent.sessionLoad(id)
      const info = get().sessions.find((item) => item.sessionId === id)
      writeStored('cinelab.agent.sessionId', id)
      set({
        sessionId: id,
        sessionTitle: session.title ?? info?.title ?? '新对话',
        messages: session.messages.map(toAgentMessage),
        turns: session.turns,
        lastTurn: session.turns[session.turns.length - 1] ?? null,
        running: false,
        currentTurnId: null,
        proposal: null,
        pendingConfirm: null,
        confirming: false,
        error: null
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '读取会话失败' })
    }
  },

  newSession: async () => {
    if (get().running) return
    try {
      const info = await window.api.agent.sessionCreate('新对话')
      set((state) => ({
        sessions: [info, ...state.sessions.filter(
          (session) => session.sessionId !== info.sessionId
        )],
        error: null
      }))
      await get().loadSession(info.sessionId)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '新建会话失败' })
    }
  },

  selectSession: async (sessionId) => {
    if (get().running || sessionId === get().sessionId) return
    await get().loadSession(sessionId)
  },

  loadModelInfo: async () => {
    try {
      const info = await window.api.agent.modelInfo(
        get().modelKey ?? undefined
      )
      set({ modelInfo: info })
    } catch {
      set({ modelInfo: null })
    }
  },

  loadTextModels: async () => {
    try {
      const models = await window.api.agent.textModels()
      const current = get().modelKey
      if (current && !models.some((model) => modelKeyOf(model) === current)) {
        writeStored('cinelab.agent.modelKey', null)
        set({ modelKey: null, textModels: models })
        return
      }
      set({ textModels: models })
    } catch {
      set({ textModels: [] })
    }
  },

  setModelKey: async (modelKey) => {
    writeStored('cinelab.agent.modelKey', modelKey)
    set({ modelKey })
    await get().loadModelInfo()
  },

  loadProposal: async () => {
    try {
      const proposal = await window.api.agent.proposalActive(
        get().sessionId || undefined
      )
      set({ proposal })
    } catch {
      set({ proposal: null })
    }
  },

  submitProposal: async () => {
    const proposal = get().proposal
    if (!proposal || get().proposalBusy) return
    if (proposal.status !== 'pending') return

    const nodeExists = useCanvasStore
      .getState()
      .nodes.some((node) => node.id === proposal.request.nodeId)
    if (!nodeExists) {
      set({ error: '目标节点已不在画布中，请让 CineBot 重新生成提案' })
      try {
        const next = await window.api.agent.proposalCancel(proposal.id)
        set({ proposal: next })
      } catch {
        // 取消失败时保留原提案，等待主进程状态事件
      }
      return
    }

    set({ proposalBusy: true, error: null })
    try {
      const next = await window.api.agent.proposalSubmit(proposal.id)
      set({ proposal: next })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '提交生成失败'
      })
      await get().loadProposal()
    } finally {
      set({ proposalBusy: false })
    }
  },

  cancelProposal: async () => {
    const proposal = get().proposal
    if (!proposal || get().proposalBusy) return
    set({ proposalBusy: true })
    try {
      const next = await window.api.agent.proposalCancel(proposal.id)
      set({ proposal: next })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '取消提案失败'
      })
    } finally {
      set({ proposalBusy: false })
    }
  },

  confirmTool: async (approved) => {
    const pending = get().pendingConfirm
    if (!pending || get().confirming) return
    set({ confirming: true })
    try {
      await window.api.agent.confirm({
        turnId: pending.turnId,
        callId: pending.call.callId,
        approved
      })
      set({ pendingConfirm: null })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '确认操作失败'
      })
    } finally {
      set({ confirming: false })
    }
  },

  send: async (text) => {
    const state = get()
    if (state.running || !text.trim()) return
    if (!state.sessionId) {
      set({ error: 'CineBot 会话还没有准备好，请稍后重试' })
      return
    }
    const project = useProjectStore.getState()
    const canvas = useCanvasStore.getState()
    if (!project.canvasId) {
      set({ error: '请先打开一个项目' })
      return
    }

    const selectedNodeIds = canvas.nodes
      .filter((node) => node.selected)
      .map((node) => node.id)

    const studio = useStudioStore.getState()
    const timelineState = useTimelineStore.getState()
    const studioNode =
      studio.open && studio.nodeId
        ? canvas.nodes.find((node) => node.id === studio.nodeId)
        : undefined
    const timelineId =
      studioNode && isStudioNode(studioNode)
        ? studioNode.data.timelineId
        : undefined
    if (studio.open && !timelineId) {
      set({ error: '剪辑室时间线还没有加载' })
      return
    }
    const profileId = studio.open ? 'clip' : 'canvas'

    set({
      error: null,
      running: true,
      messages: [
        ...state.messages,
        {
          id: nextMessageId(),
          role: 'user',
          content: text.trim()
        }
      ]
    })

    try {
      const result = await window.api.agent.chat({
        profileId,
        permissionMode: state.permissionMode,
        message: text.trim(),
        canvasId: project.canvasId,
        selectedNodeIds,
        sessionId: state.sessionId,
        ...(state.modelKey ? { modelKey: state.modelKey } : {}),
        ...(profileId === 'clip' && timelineId ? { timelineId } : {}),
        ...(profileId === 'clip' && studioNode
          ? { studioNodeId: studioNode.id }
          : {}),
        ...(profileId === 'clip' && timelineState.selectedIds.length > 0
          ? { selectedClipIds: timelineState.selectedIds }
          : {}),
        ...(profileId === 'clip'
          ? { playheadMs: timelineState.playheadMs }
          : {})
      })
      set({ currentTurnId: result.turnId })
    } catch (error) {
      set({
        running: false,
        currentTurnId: null,
        error: error instanceof Error ? error.message : '发送失败'
      })
    }
  },

  cancel: async () => {
    const turnId = get().currentTurnId
    if (!turnId) return
    await window.api.agent.cancel(turnId)
  },

  applyEvent: (event) => {
    switch (event.type) {
      case 'turn_start':
        set((state) => ({
          running: true,
          currentTurnId: event.turn.id,
          lastTurn: event.turn,
          sessionTitle:
            state.sessionTitle === '新对话' && event.turn.userText.trim()
              ? event.turn.userText.trim().slice(0, 40)
              : state.sessionTitle
        }))
        break
      case 'text':
      case 'text_delta':
        set((state) => ({
          messages: appendText(state.messages, event.turnId, event.text)
        }))
        break
      case 'tool_start':
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: nextMessageId(),
              role: 'tool',
              content: JSON.stringify(event.call.args),
              turnId: event.turnId,
              callId: event.call.callId,
              toolName: event.call.name,
              toolStatus: 'running'
            }
          ]
        }))
        break
      case 'tool_end':
        set((state) => {
          let index = -1
          for (let cursor = state.messages.length - 1; cursor >= 0; cursor -= 1) {
            const message = state.messages[cursor]
            if (
              message.role === 'tool' &&
              message.callId === event.result.callId
            ) {
              index = cursor
              break
            }
          }
          const next = [...state.messages]
          if (index >= 0) {
            next[index] = {
              ...next[index],
              toolStatus: event.result.ok ? 'ok' : 'error',
              content: event.result.ok
                ? JSON.stringify(event.result.result ?? { ok: true })
                : event.result.error ?? '工具执行失败'
            }
          }
          return {
            messages: next,
            ...(state.pendingConfirm?.call.callId === event.result.callId
              ? { pendingConfirm: null }
              : {})
          }
        })
        break
      case 'confirm_request':
        set({
          pendingConfirm: {
            turnId: event.turnId,
            call: event.call,
            reason: event.reason
          }
        })
        break
      case 'turn_end': {
        useCanvasStore.getState().endCommandTurn(event.turn.id)
        useTimelineStore.getState().endCommandTurn(event.turn.id)
        set((state) => {
          const messages = state.messages.map((message) =>
            message.role === 'tool' &&
            message.turnId === event.turn.id &&
            message.toolStatus === 'running'
              ? {
                  ...message,
                  toolStatus:
                    event.turn.status === 'completed'
                      ? ('ok' as const)
                      : ('error' as const),
                  content:
                    event.turn.status === 'completed'
                      ? message.content
                      : '本轮已结束'
                }
              : message
          )
          return {
            running: false,
            currentTurnId: null,
            lastTurn: event.turn,
            pendingConfirm: null,
            confirming: false,
            turns: [...state.turns, event.turn],
            messages:
              event.turn.status === 'cancelled'
                ? [
                    ...messages,
                    {
                      id: nextMessageId(),
                      role: 'assistant' as const,
                      content: '已停止本轮。'
                    }
                  ]
                : messages,
            error:
              event.turn.status === 'error'
                ? event.turn.error ?? '本轮执行失败'
                : state.error
          }
        })
        void window.api.agent.sessionList().then((sessions) => {
          const current = sessions.find(
            (session) => session.sessionId === get().sessionId
          )
          set({
            sessions,
            ...(current ? { sessionTitle: current.title } : {})
          })
        })
        break
      }
      case 'proposal':
        set({ proposal: event.proposal })
        break
      case 'error':
        set({ error: event.message })
        break
      default:
        break
    }
  },

  undoLastTurn: () => {
    const turn = get().lastTurn
    if (!turn || agentTurnChangeCount(turn) === 0) return

    const change = turn.change
    const canvasChanges =
      (change.createdNodeIds?.length ?? 0) +
      (change.updatedNodeIds?.length ?? 0) +
      (change.deletedNodeIds?.length ?? 0) +
      (change.createdEdgeIds?.length ?? 0) +
      (change.deletedEdgeIds?.length ?? 0)

    if (canvasChanges > 0) useCanvasStore.getState().undo()
    if (change.timelineUpdated) useTimelineStore.getState().undo()

    set((state) => ({
      lastTurn: null,
      messages: [
        ...state.messages,
        {
          id: nextMessageId(),
          role: 'assistant',
          content: change.timelineUpdated
            ? '已撤销本轮修改。'
            : '已撤销本轮画布修改。'
        }
      ]
    }))
  }
}))
