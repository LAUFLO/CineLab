/**
 * M0 spike：验证自定义会话目录。
 *
 * 运行：
 *   node scripts/spike/pi-session.mjs
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager
} from '@earendil-works/pi-coding-agent'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'

const agentDir = join(tmpdir(), 'cinelab-pi-spike-session')
rmSync(agentDir, { recursive: true, force: true })
mkdirSync(agentDir, { recursive: true })
const sessionDir = join(agentDir, 'sessions', 'v2')

const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

const runtime = await ModelRuntime.create({
  credentials: {
    async get() {
      return { type: 'api_key', apiKey: 'spike' }
    },
    async set() {},
    async delete() {},
    async list() {
      return []
    }
  },
  modelsPath: null,
  refreshOnCreate: false
})
runtime.registerProvider('spike', {
  name: 'Spike',
  api: 'openai-completions',
  baseUrl: 'http://127.0.0.1:1',
  models: [
    {
      id: 'spike-model',
      name: 'Spike Model',
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      reasoning: false,
      contextWindow: 128000,
      maxTokens: 4096
    }
  ],
  streamSimple: () => {
    const stream = createAssistantMessageEventStream()
    const message = {
      role: 'assistant',
      content: [{ type: 'text', text: '你好。' }],
      api: 'openai-completions',
      provider: 'spike',
      model: 'spike-model',
      usage,
      stopReason: 'stop',
      timestamp: Date.now()
    }
    queueMicrotask(() => {
      stream.push({ type: 'start', partial: message })
      stream.push({ type: 'text_start', contentIndex: 0, partial: message })
      stream.push({ type: 'text_delta', contentIndex: 0, delta: '你好。', partial: message })
      stream.push({ type: 'text_end', contentIndex: 0, content: '你好。', partial: message })
      stream.push({ type: 'done', reason: 'stop', message })
      stream.end(message)
    })
    return stream
  }
})
await runtime.setRuntimeApiKey('spike', 'spike')

const history = SessionManager.create(agentDir, sessionDir)
const { session } = await createAgentSession({
  cwd: agentDir,
  agentDir,
  modelRuntime: runtime,
  model: runtime.getModel('spike', 'spike-model'),
  thinkingLevel: 'off',
  sessionManager: history,
  settingsManager: SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  }),
  noTools: 'builtin',
  customTools: []
})

await session.prompt('你好')
const file = history.getSessionFile()
console.log('sessionDir:', history.getSessionDir())
console.log('sessionFile:', file)
console.log('exists:', file ? existsSync(file) : false)
console.log('compact type:', typeof session.compact)

session.dispose()
