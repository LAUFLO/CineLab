import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ user: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => paths.user,
    getAppPath: () => paths.user,
    isPackaged: false,
    getName: () => 'CineLab'
  },
  nativeImage: {}
}))

import {
  appendMessage,
  createSession,
  ensureSessionTitle,
  listSessions,
  loadSession,
  renameSession,
  sessionDirectory
} from '../session'

describe('agent sessions', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cinelab-sessions-'))
    paths.user = join(root, 'user')
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('creates, titles, renames and lists sessions', async () => {
    const created = await createSession(root, '新对话')
    expect(created.title).toBe('新对话')

    await ensureSessionTitle(root, created.sessionId, '第一条用户消息')
    let sessions = await listSessions(root)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.title).toBe('第一条用户消息')

    await renameSession(root, created.sessionId, '重命名会话')
    sessions = await listSessions(root)
    expect(sessions[0]?.title).toBe('重命名会话')

    const snapshot = await loadSession(root, created.sessionId)
    expect(snapshot.title).toBe('重命名会话')
    expect(snapshot.messages).toEqual([])
  })

  it('counts user and assistant messages and keeps a preview', async () => {
    const created = await createSession(root)
    await appendMessage(root, created.sessionId, {
      id: 'm1',
      role: 'user',
      content: '把片段前移一秒'
    })
    await appendMessage(root, created.sessionId, {
      id: 'm2',
      role: 'assistant',
      content: '已完成'
    })
    await appendMessage(root, created.sessionId, {
      id: 'm3',
      role: 'tool',
      content: '{"ok":true}',
      toolName: 'timeline_move_clips'
    })

    const sessions = await listSessions(root)
    expect(sessions[0]?.messageCount).toBe(2)
    expect(sessions[0]?.preview).toBe('把片段前移一秒')
  })

  it('writes and reuses the session index', async () => {
    const created = await createSession(root, '索引会话')
    await appendMessage(root, created.sessionId, {
      id: 'm1',
      role: 'user',
      content: '索引测试'
    })

    const first = await listSessions(root)
    expect(first).toHaveLength(1)

    const indexFile = join(sessionDirectory(root), '.index.json')
    const index = JSON.parse(await fs.readFile(indexFile, 'utf8')) as Record<
      string,
      { title: string; messageCount: number }
    >
    expect(index[created.sessionId]?.title).toBe('索引会话')

    await appendMessage(root, created.sessionId, {
      id: 'm2',
      role: 'assistant',
      content: '已完成'
    })
    const second = await listSessions(root)
    expect(second[0]?.messageCount).toBe(2)
  })
})
