import { create } from 'zustand'
import type {
  AgentEvent,
  AgentModelInfo,
  AgentPermissionMode,
  AgentProposal,
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
  messages: AgentMessage[]
  turns: AgentTurn[]
  running: boolean
  currentTurnId: string | null
  permissionMode: AgentPermissionMode
  modelInfo: AgentModelInfo | null
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
  loadSession: () => Promise<void>
  loadModelInfo: () => Promise<void>
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

export const useAgentStore = create<AgentState>((set, get) => ({
  visible: false,
  messages: [],
  turns: [],
  running: false,
  currentTurnId: null,
  permissionMode: 'current',
  modelInfo: null,
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

  loadSession: async () => {
    try {
      const session = await window.api.agent.sessionLoad()
      set({
        messages: session.messages.map(toAgentMessage),
        turns: session.turns,
        lastTurn: session.turns[session.turns.length - 1] ?? null
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '读取会话失败' })
    }
  },

  loadModelInfo: async () => {
    try {
      const info = await window.api.agent.modelInfo()
      set({ modelInfo: info })
    } catch {
      set({ modelInfo: null })
    }
  },

  loadProposal: async () => {
    try {
      const proposal = await window.api.agent.proposalActive()
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
      set({ error: '目标节点已不在画布中，请让助手重新生成提案' })
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
        set({
          running: true,
          currentTurnId: event.turn.id,
          lastTurn: event.turn
        })
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
          const index = state.messages.findIndex(
            (message) =>
              message.role === 'tool' &&
              message.callId === event.result.callId
          )
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
      case 'turn_end':
        useCanvasStore.getState().endCommandTurn(event.turn.id)
        useTimelineStore.getState().endCommandTurn(event.turn.id)
        set((state) => ({
          running: false,
          currentTurnId: null,
          lastTurn: event.turn,
          pendingConfirm: null,
          confirming: false,
          turns: [...state.turns, event.turn],
          messages:
            event.turn.status === 'cancelled'
              ? [
                  ...state.messages,
                  {
                    id: nextMessageId(),
                    role: 'assistant',
                    content: '已停止本轮。'
                  }
                ]
              : state.messages,
          error:
            event.turn.status === 'error'
              ? event.turn.error ?? '本轮执行失败'
              : state.error
        }))
        break
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
