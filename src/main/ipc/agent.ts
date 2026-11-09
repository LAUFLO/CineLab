import { BrowserWindow, ipcMain } from 'electron'
import type {
  AgentAttachment,
  AgentChatRequest,
  AgentConfirmInput,
  AgentEvent,
  AgentGenerationModels,
  AgentProposal,
  AgentProposalDraft,
  AgentReference,
  AgentToolCallRequest,
  AgentToolResultInput
} from '@shared/agent'
import { listAgentModels, listTextModels, resolveTextModel } from '../agent/model'
import {
  activeProposal,
  cancelProposal,
  createProposal,
  deleteSessionProposals,
  setProposalChangeListener,
  submitProposal
} from '../agent/proposals'
import {
  cancelTurn,
  getActiveTurnInfo,
  resolveConfirmation,
  resolveToolResult,
  startTurn
} from '../agent/runtime'
import {
  createSession,
  deleteSession,
  listSessions,
  loadSession,
  renameSession,
  requireProjectRoot
} from '../agent/session'

function broadcastProposal(proposal: AgentProposal): void {
  const event: AgentEvent = { type: 'proposal', proposal }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('agent:event', event)
  }
}

function assertChatRequest(input: unknown): AgentChatRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('请求格式无效')
  }
  const request = input as Partial<AgentChatRequest>
  if (typeof request.message !== 'string' || !request.message.trim()) {
    throw new Error('消息不能为空')
  }
  if (request.message.length > 8000) {
    throw new Error('消息不能超过 8000 个字符')
  }
  if (typeof request.canvasId !== 'string') {
    throw new Error('缺少画布 ID')
  }
  if (!Array.isArray(request.selectedNodeIds)) {
    throw new Error('缺少选中节点')
  }
  const selectedNodeIds = request.selectedNodeIds.filter(
    (id): id is string => typeof id === 'string'
  )
  if (selectedNodeIds.length > 50) {
    throw new Error('选中节点过多')
  }

  const selectedClipIds = Array.isArray(request.selectedClipIds)
    ? request.selectedClipIds.filter(
        (id): id is string => typeof id === 'string'
      )
    : []
  if (selectedClipIds.length > 200) {
    throw new Error('选中片段过多')
  }

  const attachments: AgentAttachment[] = []
  if (request.attachments !== undefined) {
    if (!Array.isArray(request.attachments) || request.attachments.length > 8) {
      throw new Error('附件最多 8 个')
    }
    for (const item of request.attachments) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error('附件格式无效')
      }
      const attachment = item as Partial<AgentAttachment>
      if (
        typeof attachment.nodeId !== 'string' ||
        !attachment.nodeId.trim() ||
        attachment.nodeId.length > 120
      ) {
        throw new Error('附件节点 ID 无效')
      }
      if (
        typeof attachment.name !== 'string' ||
        !attachment.name.trim() ||
        attachment.name.length > 200
      ) {
        throw new Error('附件名称无效')
      }
      const path = attachment.path
      if (
        typeof path !== 'string' ||
        !path.trim() ||
        path.length > 2000 ||
        path.includes('..') ||
        path.startsWith('/') ||
        path.startsWith('\\') ||
        /^[a-zA-Z]:/.test(path)
      ) {
        throw new Error('附件路径必须是相对路径')
      }
      if (attachment.scope !== 'project' && attachment.scope !== 'global') {
        throw new Error('附件作用域无效')
      }
      if (
        attachment.kind !== 'image' &&
        attachment.kind !== 'video' &&
        attachment.kind !== 'audio'
      ) {
        throw new Error('附件类型无效')
      }
      attachments.push({
        nodeId: attachment.nodeId.trim(),
        name: attachment.name.trim(),
        path,
        scope: attachment.scope,
        kind: attachment.kind
      })
    }
  }

  const generationModels: AgentGenerationModels = {}
  if (request.generationModels !== undefined) {
    if (
      typeof request.generationModels !== 'object' ||
      request.generationModels === null ||
      Array.isArray(request.generationModels)
    ) {
      throw new Error('生成模型选择无效')
    }
    for (const output of ['image', 'video', 'audio'] as const) {
      const value = request.generationModels[output]
      if (value === undefined) continue
      if (
        typeof value !== 'string' ||
        !value.includes('/') ||
        value.length > 300
      ) {
        throw new Error(`${output} 模型标识无效`)
      }
      generationModels[output] = value
    }
  }

  const references: AgentReference[] = []
  if (request.references !== undefined) {
    if (!Array.isArray(request.references) || request.references.length > 8) {
      throw new Error('引用素材最多 8 个')
    }
    for (const item of request.references) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error('引用素材格式无效')
      }
      const reference = item as Partial<AgentReference>
      if (
        reference.nodeId !== undefined &&
        (typeof reference.nodeId !== 'string' ||
          !reference.nodeId.trim() ||
          reference.nodeId.length > 120)
      ) {
        throw new Error('引用素材节点 ID 无效')
      }
      if (
        typeof reference.name !== 'string' ||
        !reference.name.trim() ||
        reference.name.length > 200
      ) {
        throw new Error('引用素材名称无效')
      }
      const path = reference.path
      if (
        typeof path !== 'string' ||
        !path.trim() ||
        path.length > 2000 ||
        path.includes('..') ||
        path.startsWith('/') ||
        path.startsWith('\\') ||
        /^[a-zA-Z]:/.test(path)
      ) {
        throw new Error('引用素材路径必须是相对路径')
      }
      if (reference.scope !== 'project' && reference.scope !== 'global') {
        throw new Error('引用素材作用域无效')
      }
      if (
        reference.kind !== 'image' &&
        reference.kind !== 'video' &&
        reference.kind !== 'audio'
      ) {
        throw new Error('引用素材类型无效')
      }
      references.push({
        ...(reference.nodeId ? { nodeId: reference.nodeId.trim() } : {}),
        name: reference.name.trim(),
        path,
        scope: reference.scope,
        kind: reference.kind
      })
    }
  }
  if (
    request.timelineId !== undefined &&
    (typeof request.timelineId !== 'string' ||
      request.timelineId.length > 120)
  ) {
    throw new Error('时间线 ID 无效')
  }
  if (
    request.studioNodeId !== undefined &&
    (typeof request.studioNodeId !== 'string' ||
      request.studioNodeId.length > 120)
  ) {
    throw new Error('剪辑室节点 ID 无效')
  }

  const permissionMode =
    request.permissionMode === 'read-only' ? 'read-only' : 'current'
  const profileId = request.profileId === 'clip' ||
    request.profileId === 'film' ||
    request.profileId === 'stage'
    ? request.profileId
    : 'canvas'
  return {
    profileId,
    permissionMode,
    message: request.message.trim(),
    canvasId: request.canvasId,
    selectedNodeIds,
    ...(typeof request.timelineId === 'string'
      ? { timelineId: request.timelineId }
      : {}),
    ...(typeof request.studioNodeId === 'string'
      ? { studioNodeId: request.studioNodeId }
      : {}),
    ...(selectedClipIds.length > 0 ? { selectedClipIds } : {}),
    ...(typeof request.playheadMs === 'number' &&
    Number.isFinite(request.playheadMs)
      ? { playheadMs: Math.max(0, request.playheadMs) }
      : {}),
    ...(typeof request.sessionId === 'string'
      ? { sessionId: request.sessionId }
      : {}),
    ...(typeof request.modelKey === 'string' &&
    request.modelKey.includes('/') &&
    request.modelKey.length <= 300
      ? { modelKey: request.modelKey }
      : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...(Object.keys(generationModels).length > 0
      ? { generationModels }
      : {})
  }
}

export function registerAgentIpc(): void {
  setProposalChangeListener(broadcastProposal)

  ipcMain.handle('agent:chat', async (event, input: unknown) => {
    const request = assertChatRequest(input)
    const win = BrowserWindow.fromWebContents(event.sender)

    const sendEvent = (payload: AgentEvent): void => {
      if (!win || win.isDestroyed()) return
      win.webContents.send('agent:event', payload)
    }

    const sendToolCall = (call: AgentToolCallRequest): void => {
      if (!win || win.isDestroyed()) return
      win.webContents.send('agent:tool-call', call)
    }

    return startTurn(request, { sendEvent, sendToolCall })
  })

  ipcMain.handle('agent:cancel', (_event, turnId: unknown) => {
    if (typeof turnId !== 'string') return
    cancelTurn(turnId)
  })

  ipcMain.handle('agent:tool-result', (_event, input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return
    const result = input as AgentToolResultInput
    if (
      typeof result.turnId !== 'string' ||
      typeof result.callId !== 'string' ||
      typeof result.ok !== 'boolean'
    ) {
      return
    }
    resolveToolResult(result)
  })

  ipcMain.handle('agent:confirm', (_event, input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return
    const value = input as Partial<AgentConfirmInput>
    if (
      typeof value.turnId !== 'string' ||
      typeof value.callId !== 'string' ||
      typeof value.approved !== 'boolean'
    ) {
      return
    }
    resolveConfirmation({
      turnId: value.turnId,
      callId: value.callId,
      approved: value.approved
    })
  })

  ipcMain.handle('agent:session-load', async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error('缺少会话 ID')
    }
    const root = requireProjectRoot()
    return loadSession(root, sessionId.trim())
  })

  ipcMain.handle('agent:session-list', async () => {
    return listSessions(requireProjectRoot())
  })

  ipcMain.handle('agent:session-create', async (_event, title: unknown) => {
    return createSession(
      requireProjectRoot(),
      typeof title === 'string' ? title : '新对话'
    )
  })

  ipcMain.handle(
    'agent:session-rename',
    async (_event, sessionId: unknown, title: unknown) => {
      if (typeof sessionId !== 'string' || typeof title !== 'string') {
        throw new Error('会话参数无效')
      }
      return renameSession(requireProjectRoot(), sessionId, title)
    }
  )

  ipcMain.handle(
    'agent:session-delete',
    async (_event, sessionId: unknown) => {
      if (typeof sessionId !== 'string' || !sessionId.trim()) {
        throw new Error('缺少会话 ID')
      }
      const root = requireProjectRoot()
      await deleteSession(root, sessionId.trim())
      await deleteSessionProposals(root, sessionId.trim())
    }
  )

  ipcMain.handle('agent:text-models', async () => listTextModels())
  ipcMain.handle('agent:models', async () => listAgentModels())

  ipcMain.handle('agent:model-info', async (_event, modelKey: unknown) => {
    const runtime = await resolveTextModel(
      typeof modelKey === 'string' ? modelKey : undefined
    )
    return runtime?.info ?? null
  })

  ipcMain.handle('agent:proposal-create', async (_event, input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('提案格式无效')
    }
    const draft = input as AgentProposalDraft
    if (typeof draft.turnId !== 'string') {
      throw new Error('缺少回合 ID')
    }
    const info = getActiveTurnInfo(draft.turnId)
    if (!info) {
      throw new Error('当前回合已结束，不能登记生成提案')
    }
    if (
      !draft.request ||
      typeof draft.request !== 'object' ||
      typeof draft.request.nodeId !== 'string' ||
      !info.scope.selectedNodeIds.includes(draft.request.nodeId)
    ) {
      throw new Error('目标节点不在当前操作范围')
    }
    const root = requireProjectRoot()
    return createProposal(root, info.sessionId, draft)
  })

  ipcMain.handle(
    'agent:proposal-active',
    async (_event, sessionId: unknown) => {
      const root = requireProjectRoot()
      return activeProposal(
        root,
        typeof sessionId === 'string' && sessionId.trim()
          ? sessionId.trim()
          : 'main'
      )
    }
  )

  ipcMain.handle('agent:proposal-submit', async (_event, proposalId: unknown) => {
    if (typeof proposalId !== 'string' || !proposalId.trim()) {
      throw new Error('提案 ID 无效')
    }
    const root = requireProjectRoot()
    return submitProposal(root, proposalId)
  })

  ipcMain.handle('agent:proposal-cancel', async (_event, proposalId: unknown) => {
    if (typeof proposalId !== 'string' || !proposalId.trim()) {
      throw new Error('提案 ID 无效')
    }
    const root = requireProjectRoot()
    return cancelProposal(root, proposalId)
  })
}
