import type { AgentSessionSnapshot } from '@shared/agent'
import {
  chatWithTools,
  resolveTextModel,
  type AgentChatMessage
} from './model'
import { appendSessionSummary, loadSession } from './session'

const KEEP_RECENT_MESSAGES = 6
const MAX_SUMMARY_INPUT_CHARS = 24_000
const MAX_SUMMARY_OUTPUT_CHARS = 4_000
const SUMMARY_TIMEOUT_MS = 90_000

function dialogueMessages(
  snapshot: AgentSessionSnapshot
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return snapshot.messages
    .filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        message.content.trim()
    )
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content
    }))
}

export async function compactSession(
  root: string,
  sessionId: string,
  modelKey?: string
): Promise<AgentSessionSnapshot> {
  const snapshot = await loadSession(root, sessionId)
  const dialogue = dialogueMessages(snapshot)
  const covered = snapshot.summary?.coveredMessages ?? 0
  const remaining = dialogue.slice(covered)
  const older = remaining.slice(
    0,
    Math.max(0, remaining.length - KEEP_RECENT_MESSAGES)
  )
  if (older.length === 0) return snapshot

  const runtime = await resolveTextModel(modelKey)
  if (!runtime) {
    throw new Error('还没有配置文本模型，无法压缩上下文')
  }

  const transcript = older
    .map(
      (message) =>
        `${message.role === 'user' ? '用户' : '助手'}：${message.content}`
    )
    .join('\n\n')
    .slice(-MAX_SUMMARY_INPUT_CHARS)
  const prior = snapshot.summary
    ? `已有摘要：\n${snapshot.summary.content}\n\n`
    : ''
  const messages: AgentChatMessage[] = [
    {
      role: 'system',
      content:
        '你是 CineLab 的会话压缩器。把对话压缩成简短、准确的中文摘要。保留：用户目标、已确认的决策、已修改的画布节点/时间线/文件、尚未完成的事项和下一步。不要编造，不要展示 JSON，不要超过 600 字。'
    },
    {
      role: 'user',
      content: `${prior}需要压缩的对话：\n${transcript}`
    }
  ]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS)
  try {
    const result = await chatWithTools({
      runtime,
      messages,
      tools: [],
      signal: controller.signal
    })
    const content = result.content.trim().slice(0, MAX_SUMMARY_OUTPUT_CHARS)
    if (!content) throw new Error('模型没有返回摘要')
    await appendSessionSummary(
      root,
      sessionId,
      content,
      covered + older.length
    )
    return await loadSession(root, sessionId)
  } finally {
    clearTimeout(timer)
  }
}
