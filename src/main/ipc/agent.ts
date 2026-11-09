import { BrowserWindow, ipcMain } from 'electron'
import type {
  AgentChatRequest,
  AgentConfirmInput,
  AgentEvent,
  AgentProposal,
  AgentProposalDraft,
  AgentToolCallRequest,
  AgentToolResultInput
} from '@shared/agent'
import { resolveTextModel } from '../agent/model'
import {
  activeProposal,
  cancelProposal,
  createProposal,
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
import { loadSession, requireProjectRoot } from '../agent/session'

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

  ipcMain.handle('agent:session-load', async () => {
    const root = requireProjectRoot()
    return loadSession(root, 'main')
  })

  ipcMain.handle('agent:model-info', async () => {
    const runtime = await resolveTextModel()
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

  ipcMain.handle('agent:proposal-active', async () => {
    const root = requireProjectRoot()
    return activeProposal(root, 'main')
  })

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
