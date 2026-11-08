export type AgentProfileId = 'clip' | 'canvas'

export type AgentIntent =
  | 'remove_silence'
  | 'split_by_shots'
  | 'beat_markers'
  | 'beat_split'
  | 'answer'
  | 'unsupported'

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentSelectedClip {
  id: string
  kind: 'video' | 'audio' | 'image' | 'text' | 'layer' | 'transition'
  name: string
  startMs: number
  durationMs: number
  hasMedia: boolean
}

export interface AgentContext {
  timelineName: string
  durationMs: number
  clipCount: number
  trackCount: number
  markerCount: number
  selectedClip?: AgentSelectedClip
}

export interface AgentChatRequest {
  profileId: AgentProfileId
  messages: AgentMessage[]
  context: AgentContext
}

export interface AgentChatResult {
  content: string
  model?: string
}

export interface AgentPlanResponse {
  reply: string
  intent: AgentIntent
  args: Record<string, unknown>
  needsConfirm: boolean
}

const INTENTS: AgentIntent[] = [
  'remove_silence',
  'split_by_shots',
  'beat_markers',
  'beat_split',
  'answer',
  'unsupported'
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * 解析模型返回的结构化计划。
 * 兼容纯 JSON、```json 代码围栏，以及 JSON 前后带解释文字的情况。
 */
export function parseAgentPlan(content: string): AgentPlanResponse {
  const trimmed = content.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  const raw = fenced ? fenced[1] : trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')

  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<
        string,
        unknown
      >
      const intent = INTENTS.includes(parsed.intent as AgentIntent)
        ? (parsed.intent as AgentIntent)
        : 'unsupported'
      return {
        reply:
          typeof parsed.reply === 'string' && parsed.reply.trim()
            ? parsed.reply.trim()
            : trimmed,
        intent,
        args: asRecord(parsed.args),
        needsConfirm: parsed.needsConfirm !== false
      }
    } catch {
      // 非 JSON 时按普通回答处理
    }
  }

  return {
    reply: trimmed,
    intent: 'unsupported',
    args: {},
    needsConfirm: false
  }
}
