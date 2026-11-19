/**
 * M0 spike：验证 finishTurn 包装和 Type.Unsafe。
 *
 * 运行：
 *   node scripts/spike/pi-continue.mjs
 *
 * 验证点：
 *   1. session.agent.finishTurn 原始钩子存在；
 *   2. 包装后先调用原钩子，再叠加自动续跑；
 *   3. 第一轮只输出过渡语时，能自动发起第二轮；
 *   4. Type.Unsafe(JSON Schema) 工具可被调用。
 */

import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager
} from '@earendil-works/pi-coding-agent'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import { Type } from 'typebox'

const agentDir = join(tmpdir(), 'cinelab-pi-spike-continue')
rmSync(agentDir, { recursive: true, force: true })
mkdirSync(agentDir, { recursive: true })

const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

function message(content, stopReason) {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'spike',
    model: 'spike-model',
    usage,
    stopReason,
    timestamp: Date.now()
  }
}

function emitText(stream, text) {
  const m = message([{ type: 'text', text }], 'stop')
  stream.push({ type: 'start', partial: m })
  stream.push({ type: 'text_start', contentIndex: 0, partial: m })
  stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: m })
  stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: m })
  stream.push({ type: 'done', reason: 'stop', message: m })
  stream.end(m)
}

function emitToolCall(stream, name, args) {
  const m = message(
    [{ type: 'toolCall', id: `call_${name}_1`, name, arguments: args }],
    'toolUse'
  )
  stream.push({ type: 'start', partial: m })
  stream.push({ type: 'toolcall_start', contentIndex: 0, partial: m })
  stream.push({
    type: 'toolcall_delta',
    contentIndex: 0,
    delta: JSON.stringify(args),
    partial: m
  })
  stream.push({
    type: 'toolcall_end',
    contentIndex: 0,
    toolCall: m.content[0],
    partial: m
  })
  stream.push({ type: 'done', reason: 'toolUse', message: m })
  stream.end(m)
}

let requestCount = 0

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
    requestCount += 1
    const stream = createAssistantMessageEventStream()
    queueMicrotask(() => {
      if (requestCount === 1) {
        emitText(stream, '我先查一下当前场景：')
      } else if (requestCount === 2) {
        emitToolCall(stream, 'json_tool', { text: 'ok' })
      } else {
        emitText(stream, '完成。')
      }
    })
    return stream
  }
})

const model = runtime.getModel('spike', 'spike-model')
if (!model) throw new Error('模型未注册')
await runtime.setRuntimeApiKey('spike', 'spike')

const { session } = await createAgentSession({
  cwd: agentDir,
  agentDir,
  modelRuntime: runtime,
  model,
  thinkingLevel: 'off',
  sessionManager: SessionManager.inMemory(agentDir),
  settingsManager: SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  }),
  noTools: 'builtin',
  customTools: [
    {
      name: 'json_tool',
      label: 'JSON Tool',
      description: '用 Type.Unsafe 包装的 JSON Schema',
      parameters: Type.Unsafe({
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false
      }),
      execute: async (_id, params) => ({
        content: [{ type: 'text', text: `json:${params.text}` }],
        details: { ok: true }
      })
    }
  ]
})

console.log('finishTurn type:', typeof session.agent.finishTurn)
const inner = session.agent.finishTurn
let continueCount = 0
let innerCalled = 0

session.agent.finishTurn = async (turn, signal) => {
  innerCalled += 1
  const decision = await inner?.(turn, signal)
  console.log('inner decision:', decision)
  if (decision) return decision
  if (turn.message.stopReason !== 'stop') return
  const hasToolCall = turn.message.content.some((part) => part.type === 'toolCall')
  if (hasToolCall || turn.toolResults.length > 0) return
  if (continueCount++ >= 2) return
  console.log('auto-continue:', continueCount)
  return { action: 'continue' }
}

session.subscribe((event) => {
  if (event.type === 'message_update') {
    const update = event.assistantMessageEvent
    if (update.type === 'text_delta') process.stdout.write(`[text] ${update.delta}\n`)
  }
  if (event.type === 'tool_execution_start') {
    process.stdout.write(`[tool] ${event.toolName} ${JSON.stringify(event.args)}\n`)
  }
})

await session.prompt('开始')

console.log('requests:', requestCount)
console.log('innerCalled:', innerCalled)
console.log('lastText:', session.getLastAssistantText?.())

session.dispose()
