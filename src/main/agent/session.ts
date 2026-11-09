import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  AgentSessionEntry,
  AgentSessionInfo,
  AgentSessionMessage,
  AgentSessionSnapshot,
  AgentTurn
} from '@shared/agent'
import { getCurrentProjectRoot } from '../project/manager'

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

export function sessionDirectory(root: string): string {
  return join(root, '.cinelab', 'agent', 'sessions')
}

export function sessionFile(root: string, sessionId: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('会话 ID 无效')
  }
  return join(sessionDirectory(root), `${sessionId}.jsonl`)
}

export function createSessionId(): string {
  return `main-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`
}

export async function ensureSession(
  root: string,
  sessionId: string,
  title?: string
): Promise<void> {
  const directory = sessionDirectory(root)
  await fs.mkdir(directory, { recursive: true })

  const file = sessionFile(root, sessionId)
  try {
    await fs.access(file)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const now = new Date().toISOString()
  const header: AgentSessionEntry = {
    id: randomUUID(),
    timestamp: now,
    type: 'session',
    version: 1,
    sessionId
  }
  const lines = [JSON.stringify(header)]
  if (title) {
    lines.push(
      JSON.stringify({
        id: randomUUID(),
        timestamp: now,
        type: 'meta',
        title
      } satisfies AgentSessionEntry)
    )
  }
  await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8')
}

export async function appendSessionEntry(
  root: string,
  sessionId: string,
  entry: AgentSessionEntry
): Promise<void> {
  await ensureSession(root, sessionId)
  await fs.appendFile(
    sessionFile(root, sessionId),
    `${JSON.stringify(entry)}\n`,
    'utf8'
  )
}

export async function appendMessage(
  root: string,
  sessionId: string,
  message: AgentSessionMessage
): Promise<void> {
  await appendSessionEntry(root, sessionId, {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: 'message',
    message
  })
}

export async function appendTurn(
  root: string,
  sessionId: string,
  turn: AgentTurn
): Promise<void> {
  await appendSessionEntry(root, sessionId, {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: 'turn',
    turn
  })
}

async function readSessionEntries(
  root: string,
  sessionId: string
): Promise<AgentSessionEntry[]> {
  let raw: string
  try {
    raw = await fs.readFile(sessionFile(root, sessionId), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const entries: AgentSessionEntry[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line) as AgentSessionEntry)
    } catch {
      // 跳过损坏的行
    }
  }
  return entries
}

export async function loadSession(
  root: string,
  sessionId: string
): Promise<AgentSessionSnapshot> {
  const entries = await readSessionEntries(root, sessionId)
  if (entries.length === 0) {
    return { sessionId, messages: [], turns: [] }
  }

  const messages: AgentSessionMessage[] = []
  const turns: AgentTurn[] = []
  const toolMessageIndex = new Map<string, number>()
  let title: string | undefined

  for (const entry of entries) {
    if (entry.type === 'message') {
      const message = entry.message
      if (message.role === 'tool' && message.callId) {
        const index = toolMessageIndex.get(message.callId)
        if (index !== undefined) {
          messages[index] = message
          continue
        }
        toolMessageIndex.set(message.callId, messages.length)
      }
      messages.push(message)
    } else if (entry.type === 'turn') {
      turns.push(entry.turn)
    } else if (entry.type === 'meta') {
      title = entry.title
    }
  }

  return { sessionId, ...(title ? { title } : {}), messages, turns }
}

export async function listSessions(root: string): Promise<AgentSessionInfo[]> {
  const directory = sessionDirectory(root)
  let files: string[]
  try {
    files = await fs.readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    return []
  }

  const sessions: AgentSessionInfo[] = []
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue
    const sessionId = file.slice(0, -'.jsonl'.length)
    if (!SESSION_ID_PATTERN.test(sessionId)) continue

    const entries = await readSessionEntries(root, sessionId)
    if (entries.length === 0) continue

    let title = '新对话'
    let updatedAt = entries[entries.length - 1]?.timestamp ?? ''
    let preview: string | undefined
    let messageCount = 0

    for (const entry of entries) {
      if (entry.type === 'meta') title = entry.title
      if (entry.type === 'message') {
        if (entry.message.role === 'user') {
          messageCount += 1
          preview = entry.message.content.slice(0, 80)
        }
        if (entry.message.role === 'assistant') messageCount += 1
      }
    }

    if (title === '新对话') {
      const firstUser = entries.find(
        (entry) =>
          entry.type === 'message' && entry.message.role === 'user'
      )
      if (firstUser && firstUser.type === 'message') {
        title = firstUser.message.content.slice(0, 40) || title
      }
    }

    sessions.push({
      sessionId,
      title,
      updatedAt,
      messageCount,
      ...(preview ? { preview } : {})
    })
  }

  return sessions.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  )
}

export async function createSession(
  root: string,
  title = '新对话'
): Promise<AgentSessionInfo> {
  const sessionId = createSessionId()
  await ensureSession(root, sessionId, title)
  return {
    sessionId,
    title,
    updatedAt: new Date().toISOString(),
    messageCount: 0
  }
}

export async function renameSession(
  root: string,
  sessionId: string,
  title: string
): Promise<AgentSessionInfo> {
  const next = title.trim().slice(0, 100)
  if (!next) throw new Error('会话标题不能为空')
  await appendSessionEntry(root, sessionId, {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: 'meta',
    title: next
  })
  const sessions = await listSessions(root)
  return (
    sessions.find((session) => session.sessionId === sessionId) ?? {
      sessionId,
      title: next,
      updatedAt: new Date().toISOString(),
      messageCount: 0
    }
  )
}

/** 首条用户消息自动生成会话标题；已有标题时不覆盖 */
export async function ensureSessionTitle(
  root: string,
  sessionId: string,
  text: string
): Promise<void> {
  const snapshot = await loadSession(root, sessionId)
  if (snapshot.title && snapshot.title !== '新对话') return
  const title = text.trim().replace(/\s+/g, ' ').slice(0, 40)
  if (!title) return
  await appendSessionEntry(root, sessionId, {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: 'meta',
    title
  })
}

export function requireProjectRoot(): string {
  const root = getCurrentProjectRoot()
  if (!root) throw new Error('当前没有打开的项目')
  return root
}
