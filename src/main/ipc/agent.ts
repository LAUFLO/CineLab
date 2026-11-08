import { BrowserWindow, ipcMain } from 'electron'
import type {
  AgentChatRequest,
  AgentEvent,
  AgentToolCallRequest,
  AgentToolResultInput
} from '@shared/agent'
import { resolveTextModel } from '../agent/model'
import { cancelTurn, resolveToolResult, startTurn } from '../agent/runtime'
import { loadSession, requireProjectRoot } from '../agent/session'

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
    ...(typeof request.sessionId === 'string'
      ? { sessionId: request.sessionId }
      : {})
  }
}

export function registerAgentIpc(): void {
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

  ipcMain.handle('agent:session-load', async () => {
    const root = requireProjectRoot()
    return loadSession(root, 'main')
  })

  ipcMain.handle('agent:model-info', async () => {
    const runtime = await resolveTextModel()
    return runtime?.info ?? null
  })
}
