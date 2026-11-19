import { randomUUID } from 'node:crypto'
import type {
  AgentToolCall,
  AgentTurn,
  AgentTurnChange,
  AgentUsage
} from '@shared/agent'
import type { AssistantMessage, Usage } from '@earendil-works/pi-ai'

export function createAgentTurn(
  sessionId: string,
  userText: string
): AgentTurn {
  return {
    id: randomUUID(),
    sessionId,
    status: 'running',
    userText,
    assistantText: '',
    toolCalls: [],
    proposalIds: [],
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

export function mergeChange(
  target: AgentTurnChange,
  next?: AgentTurnChange
): void {
  if (!next) return
  for (const id of next.createdNodeIds ?? []) {
    if (!target.createdNodeIds.includes(id)) target.createdNodeIds.push(id)
  }
  for (const id of next.updatedNodeIds ?? []) {
    if (!target.updatedNodeIds.includes(id)) target.updatedNodeIds.push(id)
  }
  for (const id of next.deletedNodeIds ?? []) {
    if (!target.deletedNodeIds.includes(id)) target.deletedNodeIds.push(id)
  }
  for (const id of next.createdEdgeIds ?? []) {
    if (!target.createdEdgeIds.includes(id)) target.createdEdgeIds.push(id)
  }
  for (const id of next.deletedEdgeIds ?? []) {
    if (!target.deletedEdgeIds.includes(id)) target.deletedEdgeIds.push(id)
  }
  for (const [id, title] of Object.entries(next.previousTitles ?? {})) {
    if (!(id in target.previousTitles)) target.previousTitles[id] = title
  }
  for (const [id, position] of Object.entries(next.previousPositions ?? {})) {
    if (!(id in target.previousPositions)) {
      target.previousPositions[id] = position
    }
  }
  if (next.timelineUpdated) target.timelineUpdated = true
  if (next.stageUpdated) target.stageUpdated = true
  if (next.filmUpdated) target.filmUpdated = true
}

type ContentPart = {
  type: string
  text?: string
  thinking?: string
}

export function textOfContent(
  content: string | readonly ContentPart[] | null | undefined
): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .map((part) => {
      if (part.type === 'text') return part.text ?? ''
      if (part.type === 'thinking') return part.thinking ?? ''
      return ''
    })
    .join('')
}

export function usageOf(usage: Usage | undefined): AgentUsage | undefined {
  if (!usage) return undefined
  return {
    input: usage.input ?? 0,
    output: usage.output ?? 0,
    total:
      usage.totalTokens ??
      (usage.input ?? 0) + (usage.output ?? 0)
  }
}

export function assistantTextOf(message: AssistantMessage): string {
  return textOfContent(message.content).trim()
}

const PREAMBLE_PATTERN =
  /^(好|好的|行|可以|我先|我先来|现在|接下来|让我|我需要|需要先|先)/

export function looksLikePreamble(text: string): boolean {
  const value = text.trim()
  if (!value || value.length > 120) return false
  if (/[：:]$/.test(value)) return true
  return PREAMBLE_PATTERN.test(value)
}

export function toolCallOf(part: {
  id?: string
  name?: string
  arguments?: unknown
}, fallbackId: string): AgentToolCall {
  return {
    callId: part.id || fallbackId,
    name: part.name || '',
    args:
      part.arguments && typeof part.arguments === 'object'
        ? (part.arguments as Record<string, unknown>)
        : {}
  }
}
