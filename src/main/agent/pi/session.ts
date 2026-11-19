import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  AgentSessionInfo,
  AgentSessionMessage,
  AgentSessionSnapshot,
  AgentTurn
} from '@shared/agent'
import type { SessionManager } from '@earendil-works/pi-coding-agent'
import { loadPiCodingAgent } from './loader'
import { textOfContent } from './events'
import { resolveTextModel } from '../model'
import { createPiModelRuntime } from './model-runtime'
import { createPiResourceLoader } from './resources'

export function piSessionDirectory(root: string): string {
  return join(root, '.cinelab', 'agent', 'sessions', 'v2')
}

export function createPiSessionId(): string {
  return `main-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`
}

export async function findPiSessionPath(
  root: string,
  sessionId: string
): Promise<string | undefined> {
  const { SessionManager: Manager } = await loadPiCodingAgent()
  return Manager.findById(root, sessionId, piSessionDirectory(root))
}

export async function listPiSessions(
  root: string
): Promise<AgentSessionInfo[]> {
  const { SessionManager: Manager } = await loadPiCodingAgent()
  const sessions = await Manager.list(root, piSessionDirectory(root))
  return sessions
    .map((info) => {
      const title =
        info.name?.trim() ||
        info.firstMessage.trim().slice(0, 40) ||
        '新对话'
      return {
        sessionId: info.id,
        title,
        updatedAt: info.modified.toISOString(),
        messageCount: info.messageCount,
        ...(info.firstMessage.trim()
          ? { preview: info.firstMessage.trim().slice(0, 80) }
          : {})
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function createPiSession(
  root: string,
  title = '新对话'
): Promise<AgentSessionInfo> {
  return {
    sessionId: createPiSessionId(),
    title,
    updatedAt: new Date().toISOString(),
    messageCount: 0
  }
}

export async function openPiSessionManager(
  root: string,
  sessionId: string,
  title?: string
): Promise<SessionManager> {
  const { SessionManager: Manager } = await loadPiCodingAgent()
  const directory = piSessionDirectory(root)
  const path = await findPiSessionPath(root, sessionId)
  const manager = path
    ? Manager.open(path, directory, root)
    : Manager.create(root, directory, { id: sessionId })

  if (title && !manager.getSessionName()) {
    manager.appendSessionInfo(title.trim().replace(/\s+/g, ' ').slice(0, 40))
  }
  return manager
}

export async function loadPiSession(
  root: string,
  sessionId: string
): Promise<AgentSessionSnapshot> {
  const path = await findPiSessionPath(root, sessionId)
  if (!path) {
    return { sessionId, messages: [], turns: [] }
  }

  const { SessionManager: Manager } = await loadPiCodingAgent()
  const manager = Manager.open(path, piSessionDirectory(root), root)
  const messages: AgentSessionMessage[] = []
  const turns: AgentTurn[] = []
  let firstUserText = ''

  for (const entry of manager.getEntries()) {
    if (entry.type === 'message') {
      const message = entry.message
      if (message.role === 'user') {
        const content = textOfContent(message.content).trim()
        if (content) {
          if (!firstUserText) firstUserText = content
          messages.push({
            id: entry.id,
            role: 'user',
            content
          })
        }
      } else if (message.role === 'assistant') {
        const content = textOfContent(message.content).trim()
        if (content) {
          messages.push({
            id: entry.id,
            role: 'assistant',
            content
          })
        }
      } else if (message.role === 'toolResult') {
        messages.push({
          id: entry.id,
          role: 'tool',
          content: textOfContent(message.content),
          callId: message.toolCallId,
          toolName: message.toolName,
          toolStatus: message.isError ? 'error' : 'ok'
        })
      }
      continue
    }

    if (entry.type === 'custom' && entry.customType === 'cinelabTurn') {
      const turn = entry.data as AgentTurn | undefined
      if (turn && typeof turn === 'object' && typeof turn.id === 'string') {
        turns.push(turn)
      }
    }
  }

  const title = manager.getSessionName() ?? firstUserText.slice(0, 40)
  return {
    sessionId,
    ...(title ? { title } : {}),
    messages,
    turns
  }
}

export async function renamePiSession(
  root: string,
  sessionId: string,
  title: string
): Promise<AgentSessionInfo> {
  const next = title.trim().slice(0, 100)
  if (!next) throw new Error('会话标题不能为空')
  const path = await findPiSessionPath(root, sessionId)
  if (!path) throw new Error('会话不存在')
  const { SessionManager: Manager } = await loadPiCodingAgent()
  const manager = Manager.open(path, piSessionDirectory(root), root)
  manager.appendSessionInfo(next)
  const sessions = await listPiSessions(root)
  return (
    sessions.find((session) => session.sessionId === sessionId) ?? {
      sessionId,
      title: next,
      updatedAt: new Date().toISOString(),
      messageCount: 0
    }
  )
}

export async function deletePiSession(
  root: string,
  sessionId: string
): Promise<void> {
  const path = await findPiSessionPath(root, sessionId)
  if (path) await fs.rm(path, { force: true })
  const lock = join(piSessionDirectory(root), '.locks', `${sessionId}.lock`)
  await fs.rm(lock, { force: true }).catch(() => undefined)
}

export async function compactPiSession(
  root: string,
  sessionId: string,
  modelKey?: string
): Promise<AgentSessionSnapshot> {
  const runtime = await resolveTextModel(modelKey)
  if (!runtime) {
    throw new Error('还没有配置文本模型，无法压缩上下文')
  }
  const path = await findPiSessionPath(root, sessionId)
  if (!path) return loadPiSession(root, sessionId)

  const coding = await loadPiCodingAgent()
  const { modelRuntime, model } = await createPiModelRuntime(runtime)
  const settingsManager = coding.SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: false }
  })
  const agentDir = join(root, '.cinelab', 'agent')
  const manager = await openPiSessionManager(root, sessionId)
  const resourceLoader = await createPiResourceLoader({
    root,
    agentDir,
    systemPrompt: '',
    settingsManager,
    extensionFactories: [],
    noExtensions: true
  })
  const { session } = await coding.createAgentSession({
    cwd: root,
    agentDir,
    modelRuntime,
    model,
    thinkingLevel: 'off',
    sessionManager: manager,
    resourceLoader,
    settingsManager,
    noTools: 'all',
    tools: [],
    customTools: []
  })

  try {
    await session.compact()
  } catch (error) {
    if (
      error instanceof Error &&
      /Nothing to compact/i.test(error.message)
    ) {
      return loadPiSession(root, sessionId)
    }
    throw error
  } finally {
    session.dispose()
  }
  return loadPiSession(root, sessionId)
}
