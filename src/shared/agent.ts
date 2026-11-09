import type { GenerateRequest } from './generation'
import type { Capability } from './provider-schema'

export type AgentProfileId = 'canvas' | 'clip' | 'film' | 'stage'

export type AgentPermissionMode = 'read-only' | 'current' | 'full-access'

export interface AgentScope {
  projectPath: string
  canvasId: string
  selectedNodeIds: string[]
  /** CineBot 剪辑作用域：当前打开的时间线 */
  timelineId?: string
  studioNodeId?: string
  selectedClipIds?: string[]
  playheadMs?: number
}

export interface AgentAttachment {
  /** 已上传到画布的素材节点 */
  nodeId: string
  name: string
  path: string
  scope: 'project' | 'global'
  kind: 'image' | 'video' | 'audio'
}

export interface AgentChatRequest {
  profileId: AgentProfileId
  permissionMode: AgentPermissionMode
  message: string
  canvasId: string
  selectedNodeIds: string[]
  timelineId?: string
  studioNodeId?: string
  selectedClipIds?: string[]
  playheadMs?: number
  sessionId?: string
  /** 用户选择的文本模型；省略时自动选择第一个可用模型 */
  modelKey?: string
  /** 用户本轮附带的本地素材，已经创建为画布节点 */
  attachments?: AgentAttachment[]
}

export interface AgentModelInfo {
  providerId: string
  modelId: string
  name: string
  providerName?: string
}

export interface AgentSessionInfo {
  sessionId: string
  title: string
  updatedAt: string
  messageCount: number
  preview?: string
}

export interface AgentUsage {
  input: number
  output: number
  total: number
}

export type AgentProposalStatus =
  | 'pending'
  | 'submitting'
  | 'submitted'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'

export interface AgentProposal {
  id: string
  sessionId: string
  turnId: string
  status: AgentProposalStatus
  /** 提交时直接交给 generationQueue 的完整请求 */
  request: GenerateRequest
  nodeTitle: string
  modelName: string
  capability: Capability
  /** 本次请求会生成的媒体数量 */
  count: number
  createdAt: string
  expiresAt: string
  submittedAt?: string
  runId?: string
  error?: string
}

/** 渲染进程登记提案时提交的草稿；模型名与能力由主进程补全 */
export interface AgentProposalDraft {
  turnId: string
  request: GenerateRequest
  nodeTitle: string
  /** 期望数量；只有模型声明了数量参数时才生效 */
  count?: number
}

export interface AgentToolCall {
  callId: string
  name: string
  args: Record<string, unknown>
}

export interface AgentToolResult {
  callId: string
  ok: boolean
  result?: unknown
  error?: string
}

export interface AgentTurnChange {
  createdNodeIds: string[]
  updatedNodeIds: string[]
  deletedNodeIds: string[]
  createdEdgeIds: string[]
  deletedEdgeIds: string[]
  previousTitles: Record<string, string>
  previousPositions: Record<string, { x: number; y: number }>
  /** 本轮是否修改了剪辑室时间线 */
  timelineUpdated?: boolean
}

export type AgentTurnStatus = 'running' | 'completed' | 'cancelled' | 'error'

export interface AgentTurn {
  id: string
  sessionId: string
  status: AgentTurnStatus
  userText: string
  assistantText: string
  toolCalls: AgentToolCall[]
  /** 本轮登记的生成提案 */
  proposalIds: string[]
  change: AgentTurnChange
  usage?: AgentUsage
  error?: string
  startedAt: string
  endedAt?: string
}

export type AgentEvent =
  | { type: 'turn_start'; turn: AgentTurn }
  | { type: 'text'; turnId: string; text: string }
  | { type: 'text_delta'; turnId: string; text: string }
  | { type: 'tool_start'; turnId: string; call: AgentToolCall }
  | { type: 'tool_end'; turnId: string; result: AgentToolResult }
  | {
      type: 'confirm_request'
      turnId: string
      call: AgentToolCall
      reason: string
    }
  | { type: 'turn_end'; turn: AgentTurn }
  | { type: 'proposal'; proposal: AgentProposal }
  | { type: 'error'; turnId?: string; message: string }

export interface AgentSessionMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  turnId?: string
  callId?: string
  toolName?: string
  toolStatus?: 'running' | 'ok' | 'error'
}

export interface AgentSessionSnapshot {
  sessionId: string
  title?: string
  messages: AgentSessionMessage[]
  turns: AgentTurn[]
}

export interface AgentToolCallRequest extends AgentToolCall {
  turnId: string
  permissionMode: AgentPermissionMode
  scope: AgentScope
}

export interface AgentToolResultInput extends AgentToolResult {
  turnId: string
  change?: AgentTurnChange
}

export interface AgentConfirmInput {
  turnId: string
  callId: string
  approved: boolean
}

export interface AgentSessionEntryBase {
  id: string
  timestamp: string
}

export type AgentSessionEntry =
  | (AgentSessionEntryBase & {
      type: 'session'
      version: 1
      sessionId: string
    })
  | (AgentSessionEntryBase & {
      type: 'message'
      message: AgentSessionMessage
    })
  | (AgentSessionEntryBase & {
      type: 'turn'
      turn: AgentTurn
    })
  | (AgentSessionEntryBase & {
      type: 'meta'
      title: string
    })
