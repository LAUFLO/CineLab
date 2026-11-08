import { create } from 'zustand'
import type {
  AgentEvent,
  AgentModelInfo,
  AgentPermissionMode,
  AgentSessionMessage,
  AgentTurn
} from '@shared/agent'
import { useCanvasStore } from '../stores/canvas'
import { useProjectStore } from '../stores/project'

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
  toggle: () => void
  open: () => void
  close: () => void
  setPermissionMode: (mode: AgentPermissionMode) => void
  loadSession: () => Promise<void>
  loadModelInfo: () => Promise<void>
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
        profileId: 'canvas',
        permissionMode: state.permissionMode,
        message: text.trim(),
        canvasId: project.canvasId,
        selectedNodeIds
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
          if (index < 0) return state
          const next = [...state.messages]
          next[index] = {
            ...next[index],
            toolStatus: event.result.ok ? 'ok' : 'error',
            content: event.result.ok
              ? JSON.stringify(event.result.result ?? { ok: true })
              : event.result.error ?? '工具执行失败'
          }
          return { messages: next }
        })
        break
      case 'turn_end':
        set((state) => ({
          running: false,
          currentTurnId: null,
          lastTurn: event.turn,
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
      case 'error':
        set({ error: event.message })
        break
      default:
        break
    }
  },

  undoLastTurn: () => {
    const turn = get().lastTurn
    if (!turn || turn.change.updatedNodeIds.length === 0) return
    useCanvasStore.getState().undo()
    set((state) => ({
      lastTurn: null,
      messages: [
        ...state.messages,
        {
          id: nextMessageId(),
          role: 'assistant',
          content: '已撤销本轮画布修改。'
        }
      ]
    }))
  }
}))
