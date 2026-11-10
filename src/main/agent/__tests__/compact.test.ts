import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({ user: '' }))
const mocks = vi.hoisted(() => ({
  resolveTextModel: vi.fn(),
  chatWithTools: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => paths.user,
    getAppPath: () => paths.user,
    isPackaged: false,
    getName: () => 'CineLab'
  },
  nativeImage: {}
}))

vi.mock('../model', () => ({
  resolveTextModel: mocks.resolveTextModel,
  chatWithTools: mocks.chatWithTools
}))

import { compactSession } from '../compact'
import {
  appendMessage,
  createSession,
  loadSession
} from '../session'

describe('agent context compaction', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cinelab-compact-'))
    paths.user = join(root, 'user')
    mocks.resolveTextModel.mockResolvedValue({
      info: {
        providerId: 'p',
        modelId: 'm',
        name: 'Mock',
        output: 'text'
      },
      model: {
        id: 'm',
        name: 'Mock',
        capability: 'text.chat',
        remoteModel: 'm',
        params: []
      },
      provider: {
        baseUrl: 'http://localhost',
        apiKey: 'key'
      }
    })
    mocks.chatWithTools.mockResolvedValue({
      content: '压缩后的摘要',
      toolCalls: [],
      assistantMessage: {
        role: 'assistant',
        content: '压缩后的摘要'
      }
    })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  async function seed(
    sessionId: string,
    start: number,
    count: number
  ): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const turn = start + index
      await appendMessage(root, sessionId, {
        id: `u-${turn}`,
        role: 'user',
        content: `用户消息 ${turn}`,
        turnId: `turn-${turn}`
      })
      await appendMessage(root, sessionId, {
        id: `a-${turn}`,
        role: 'assistant',
        content: `助手回复 ${turn}`,
        turnId: `turn-${turn}`
      })
    }
  }

  it('summarizes older dialogue and keeps recent messages', async () => {
    const session = await createSession(root)
    await seed(session.sessionId, 1, 5)

    const snapshot = await compactSession(
      root,
      session.sessionId,
      'p/m'
    )
    expect(mocks.chatWithTools).toHaveBeenCalledTimes(1)
    expect(snapshot.summary?.content).toBe('压缩后的摘要')
    expect(snapshot.summary?.coveredMessages).toBe(4)

    const prompt = mocks.chatWithTools.mock.calls[0][0].messages
    expect(prompt[0].role).toBe('system')
    expect(prompt[1].content).toContain('用户消息 1')
    expect(prompt[1].content).not.toContain('用户消息 5')

    await seed(session.sessionId, 6, 2)
    const second = await compactSession(root, session.sessionId, 'p/m')
    expect(second.summary?.coveredMessages).toBe(8)
  })

  it('does nothing when there are only recent messages', async () => {
    const session = await createSession(root)
    await seed(session.sessionId, 1, 3)
    const snapshot = await compactSession(root, session.sessionId, 'p/m')
    expect(snapshot.summary).toBeUndefined()
    expect(mocks.chatWithTools).not.toHaveBeenCalled()
  })
})
