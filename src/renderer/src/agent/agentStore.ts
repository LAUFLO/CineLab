import { create } from 'zustand'
import type {
  AgentAttachment,
  AgentEvent,
  AgentGenerationModels,
  AgentModelInfo,
  AgentPermissionMode,
  AgentProposal,
  AgentReference,
  AgentSessionInfo,
  AgentSessionMessage,
  AgentSessionSnapshot,
  AgentToolCall,
  AgentTurn
} from '@shared/agent'
import {
  NODE_META,
  TITLE_HEIGHT,
  type OutputRef
} from '@shared/canvas-schema'
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
  attachments: AgentAttachment[]
  references: AgentReference[]
  contextSummary: AgentSessionSnapshot['summary'] | null
  compacting: boolean
  running: boolean
  currentTurnId: string | null
  permissionMode: AgentPermissionMode
  modelKey: string | null
  generationModels: AgentGenerationModels
  modelInfo: AgentModelInfo | null
  textModels: AgentModelInfo[]
  allModels: AgentModelInfo[]
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
  attachLocalAssets: () => Promise<void>
  removeAttachment: (nodeId: string) => void
  addReference: (reference: AgentReference) => void
  removeReference: (reference: AgentReference) => void
  compactContext: () => Promise<void>
  loadSessions: () => Promise<void>
  loadSession: (sessionId?: string) => Promise<void>
  newSession: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  loadModelInfo: () => Promise<void>
  loadTextModels: () => Promise<void>
  loadModels: () => Promise<void>
  setModelKey: (modelKey: string | null) => Promise<void>
  setGenerationModel: (
    output: 'image' | 'video' | 'audio',
    modelKey: string | null
  ) => Promise<void>
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

export const AGENT_CONTEXT_BUDGET_TOKENS = 32_000
export const AGENT_KEEP_RECENT_MESSAGES = 6

export interface AgentContextStats {
  usedTokens: number
  percent: number
  coveredMessages: number
  compactableMessages: number
  totalDialogueMessages: number
}

/** 粗略按 3 字符 ≈ 1 token 估算，只用于圆环提示 */
export function agentContextStats(
  messages: AgentMessage[],
  summary: AgentSessionSnapshot['summary'] | null
): AgentContextStats {
  const dialogue = messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant'
  )
  const covered = summary?.coveredMessages ?? 0
  const remaining = dialogue.slice(covered)
  const chars =
    (summary?.content.length ?? 0) +
    remaining.reduce((sum, message) => sum + message.content.length, 0)
  const usedTokens = Math.ceil(chars / 3)
  const percent = Math.min(
    100,
    Math.max(0, Math.round((usedTokens / AGENT_CONTEXT_BUDGET_TOKENS) * 100))
  )
  return {
    usedTokens,
    percent,
    coveredMessages: covered,
    compactableMessages: Math.max(
      0,
      remaining.length - AGENT_KEEP_RECENT_MESSAGES
    ),
    totalDialogueMessages: dialogue.length
  }
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

const GENERATION_MODELS_KEY = 'cinelab.agent.generationModels'

function readGenerationModels(): AgentGenerationModels {
  const raw = readStored(GENERATION_MODELS_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as AgentGenerationModels
    const result: AgentGenerationModels = {}
    for (const output of ['image', 'video', 'audio'] as const) {
      const value = parsed[output]
      if (typeof value === 'string' && value.includes('/')) {
        result[output] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeGenerationModels(models: AgentGenerationModels): void {
  writeStored(
    GENERATION_MODELS_KEY,
    Object.keys(models).length > 0 ? JSON.stringify(models) : null
  )
}

export const useAgentStore = create<AgentState>((set, get) => ({
  visible: false,
  sessionId: '',
  sessionTitle: '新对话',
  sessions: [],
  messages: [],
  turns: [],
  attachments: [],
  references: [],
  contextSummary: null,
  compacting: false,
  running: false,
  currentTurnId: null,
  permissionMode: 'current',
  modelKey: readStored('cinelab.agent.modelKey'),
  generationModels: readGenerationModels(),
  modelInfo: null,
  textModels: [],
  allModels: [],
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

  attachLocalAssets: async () => {
    if (get().running) return
    try {
      const available = 8 - get().attachments.length
      if (available <= 0) {
        set({ error: '每轮最多附加 8 个素材' })
        return
      }

      const assets = await window.api.library.importAssets('场景')
      if (assets.length === 0) return
      const selectedAssets = assets.slice(0, available)
      const created: AgentAttachment[] = []
      const canvas = useCanvasStore.getState()
      const center = {
        x: (window.innerWidth / 2 - canvas.viewport.x) / canvas.viewport.zoom,
        y: (window.innerHeight / 2 - canvas.viewport.y) / canvas.viewport.zoom
      }
      let offsetY = 0

      for (const asset of selectedAssets) {
        const kind: AgentAttachment['kind'] =
          asset.kind === 'video'
            ? 'video'
            : asset.kind === 'audio'
              ? 'audio'
              : 'image'
        const meta = NODE_META[kind]
        const nodeId = useCanvasStore.getState().addNode(kind, {
          x: center.x,
          y: center.y + offsetY
        })
        const output: OutputRef = {
          id: asset.path,
          path: asset.path,
          scope: 'global',
          kind,
          createdAt: asset.modifiedAt ?? new Date().toISOString(),
          model: '本地上传'
        }
        useCanvasStore.getState().patchNodeData(nodeId, {
          title: asset.name,
          status: 'done',
          assetOnly: true,
          outputs: [output],
          selectedOutputId: asset.path
        })
        created.push({
          nodeId,
          name: asset.name,
          path: asset.path,
          scope: 'global',
          kind
        })
        offsetY += meta.height + TITLE_HEIGHT + 24
      }

      const createdIds = new Set(created.map((item) => item.nodeId))
      useCanvasStore.setState({
        nodes: useCanvasStore.getState().nodes.map((node) => ({
          ...node,
          selected: createdIds.has(node.id)
        }))
      })

      set((state) => ({
        attachments: [...state.attachments, ...created].slice(0, 8),
        error:
          assets.length > selectedAssets.length
            ? '每轮最多附加 8 个素材，超出的文件未添加'
            : null
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '上传素材失败'
      })
    }
  },

  removeAttachment: (nodeId) =>
    set((state) => ({
      attachments: state.attachments.filter((item) => item.nodeId !== nodeId)
    })),

  addReference: (reference) =>
    set((state) => {
      const exists = state.references.some(
        (item) =>
          (reference.nodeId && item.nodeId === reference.nodeId) ||
          (item.scope === reference.scope && item.path === reference.path)
      )
      if (exists) return state
      return { references: [...state.references, reference].slice(0, 8) }
    }),

  removeReference: (reference) =>
    set((state) => ({
      references: state.references.filter(
        (item) =>
          !(
            (reference.nodeId && item.nodeId === reference.nodeId) ||
            (item.scope === reference.scope && item.path === reference.path)
          )
      )
    })),

  compactContext: async () => {
    const state = get()
    if (!state.sessionId || state.running || state.compacting) return
    set({ compacting: true, error: null })
    try {
      const snapshot = await window.api.agent.sessionCompact(
        state.sessionId,
        state.modelKey ?? undefined
      )
      set({
        contextSummary: snapshot.summary ?? null,
        messages: snapshot.messages.map(toAgentMessage),
        turns: snapshot.turns,
        lastTurn:
          snapshot.turns[snapshot.turns.length - 1] ?? state.lastTurn,
        compacting: false,
        error: null
      })
    } catch (error) {
      set({
        compacting: false,
        error: error instanceof Error ? error.message : '压缩上下文失败'
      })
    }
  },
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
        attachments: [],
        references: [],
        contextSummary: session.summary ?? null,
        compacting: false,
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

  deleteSession: async (sessionId) => {
    if (get().running) return
    try {
      await window.api.agent.sessionDelete(sessionId)
      let sessions = get().sessions.filter(
        (session) => session.sessionId !== sessionId
      )

      if (sessionId === get().sessionId) {
        let next = sessions[0]
        if (!next) {
          next = await window.api.agent.sessionCreate('新对话')
          sessions = [next]
        }
        set({ sessions, error: null })
        await get().loadSession(next.sessionId)
      } else {
        set({ sessions, error: null })
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '删除会话失败'
      })
    }
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
    await get().loadModels()
  },

  loadModels: async () => {
    try {
      const models = await window.api.agent.models()
      const textModels = models.filter((model) => model.output === 'text')
      const current = get().modelKey
      if (
        current &&
        !textModels.some((model) => modelKeyOf(model) === current)
      ) {
        writeStored('cinelab.agent.modelKey', null)
        set({ modelKey: null })
      }

      const generationModels = { ...get().generationModels }
      let changed = false
      for (const output of ['image', 'video', 'audio'] as const) {
        const key = generationModels[output]
        if (!key) continue
        if (
          !models.some(
            (model) => model.output === output && modelKeyOf(model) === key
          )
        ) {
          delete generationModels[output]
          changed = true
        }
      }
      if (changed) writeGenerationModels(generationModels)

      set({ allModels: models, textModels, generationModels })
      await get().loadModelInfo()
    } catch {
      set({ allModels: [], textModels: [] })
    }
  },

  setModelKey: async (modelKey) => {
    writeStored('cinelab.agent.modelKey', modelKey)
    set({ modelKey })
    await get().loadModelInfo()
  },

  setGenerationModel: async (output, modelKey) => {
    const generationModels = { ...get().generationModels }
    if (modelKey) generationModels[output] = modelKey
    else delete generationModels[output]
    writeGenerationModels(generationModels)
    set({ generationModels })
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
        ...(Object.keys(state.generationModels).length > 0
          ? { generationModels: state.generationModels }
          : {}),
        ...(state.attachments.length > 0
          ? { attachments: state.attachments }
          : {}),
        ...(state.references.length > 0
          ? { references: state.references }
          : {}),
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
      set({
        currentTurnId: result.turnId,
        attachments: [],
        references: []
      })
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

if (import.meta.env.DEV) {
  ;(
    window as unknown as { __agentStore?: typeof useAgentStore }
  ).__agentStore = useAgentStore
}
