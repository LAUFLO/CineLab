import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentTurn } from '@shared/agent'
import {
  createPiSession,
  deletePiSession,
  findPiSessionPath,
  listPiSessions,
  loadPiSession,
  openPiSessionManager,
  piSessionDirectory,
  renamePiSession
} from '../session'

const roots: string[] = []

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'cinelab-pi-session-'))
  roots.push(root)
  await fs.mkdir(piSessionDirectory(root), { recursive: true })
  return root
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
    )
  )
})

function turn(sessionId: string): AgentTurn {
  return {
    id: 'turn-1',
    sessionId,
    status: 'completed',
    userText: '你好',
    assistantText: '你好',
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
    startedAt: '2026-11-19T00:00:00.000Z',
    endedAt: '2026-11-19T00:00:01.000Z'
  }
}

describe('pi v2 sessions', () => {
  it('creates, reads, renames and deletes a v2 session', async () => {
    const root = await makeRoot()
    const info = await createPiSession(root, '测试会话')
    expect(info.sessionId).toMatch(/^main-/)

    const manager = await openPiSessionManager(
      root,
      info.sessionId,
      '测试会话'
    )
    manager.appendMessage({
      role: 'user',
      content: '你好',
      timestamp: Date.now()
    } as never)
    manager.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: '你好' }],
      api: 'openai-completions',
      provider: 'test',
      model: 'test',
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0
        }
      },
      stopReason: 'stop',
      timestamp: Date.now()
    } as never)
    manager.appendCustomEntry('cinelabTurn', turn(info.sessionId))
    manager.appendSessionInfo('测试会话')

    const path = await findPiSessionPath(root, info.sessionId)
    expect(path).toBeTruthy()

    const sessions = await listPiSessions(root)
    expect(sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: info.sessionId,
          title: '测试会话'
        })
      ])
    )

    const snapshot = await loadPiSession(root, info.sessionId)
    expect(snapshot.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant'
    ])
    expect(snapshot.turns).toHaveLength(1)
    expect(snapshot.turns[0].id).toBe('turn-1')

    const renamed = await renamePiSession(root, info.sessionId, '新标题')
    expect(renamed.title).toBe('新标题')
    expect((await loadPiSession(root, info.sessionId)).title).toBe('新标题')

    await deletePiSession(root, info.sessionId)
    expect(await findPiSessionPath(root, info.sessionId)).toBeUndefined()
    expect(await loadPiSession(root, info.sessionId)).toEqual({
      sessionId: info.sessionId,
      messages: [],
      turns: []
    })
  })

  it('returns an empty snapshot for unknown sessions', async () => {
    const root = await makeRoot()
    expect(await loadPiSession(root, 'missing')).toEqual({
      sessionId: 'missing',
      messages: [],
      turns: []
    })
  })
})
