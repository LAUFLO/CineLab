import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  AgentSessionEntry,
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
  return `main-${Date.now().toString(36)}`
}

export async function ensureSession(
  root: string,
  sessionId: string
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

  const header: AgentSessionEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: 'session',
    version: 1,
    sessionId
  }
  await fs.writeFile(file, `${JSON.stringify(header)}\n`, 'utf8')
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

export async function loadSession(
  root: string,
  sessionId: string
): Promise<AgentSessionSnapshot> {
  const file = sessionFile(root, sessionId)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { sessionId, messages: [], turns: [] }
    }
    throw error
  }

  const messages: AgentSessionMessage[] = []
  const turns: AgentTurn[] = []
  const toolMessageIndex = new Map<string, number>()

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let entry: AgentSessionEntry
    try {
      entry = JSON.parse(line) as AgentSessionEntry
    } catch {
      continue
    }
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
    }
  }

  return { sessionId, messages, turns }
}

export function requireProjectRoot(): string {
  const root = getCurrentProjectRoot()
  if (!root) throw new Error('当前没有打开的项目')
  return root
}
