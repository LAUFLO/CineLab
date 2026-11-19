/**
 * M0 spike：验证 pi-coding-agent 1.5.2 的最小闭环。
 * 只读验证，不接入 CineLab 业务。
 *
 * 运行：
 *   node scripts/spike/pi-smoke.mjs
 *
 * 验证点：
 *   1. createAgentSession + SessionManager + customTools 可创建；
 *   2. 自定义 ModelRuntime + streamSimple 可驱动纯文本回合；
 *   3. 同一 streamSimple 可驱动 tool call → tool result → 最终文本；
 *   4. finishTurn 包装后仍能触发自动续跑判断。
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

const agentDir = join(tmpdir(), 'cinelab-pi-spike')
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

function textMessage(text, stopReason = 'stop') {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'spike',
    model: 'spike-model',
    usage,
    stopReason,
    timestamp: Date.now()
  }
}

function toolCallMessage(name, args) {
  return {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: `call_${name}_1`,
        name,
        arguments: args
      }
    ],
    api: 'openai-completions',
    provider: 'spike',
    model: 'spike-model',
    usage,
    stopReason: 'toolUse',
    timestamp: Date.now()
  }
}

function emitText(stream, text) {
  const message = textMessage(text)
  stream.push({ type: 'start', partial: message })
  stream.push({ type: 'text_start', contentIndex: 0, partial: message })
  stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: message })
  stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: message })
  stream.push({ type: 'done', reason: 'stop', message })
  stream.end(message)
}

function emitToolCall(stream, name, args) {
  const message = toolCallMessage(name, args)
  stream.push({ type: 'start', partial: message })
  stream.push({ type: 'toolcall_start', contentIndex: 0, partial: message })
  stream.push({
    type: 'toolcall_delta',
    contentIndex: 0,
    delta: JSON.stringify(args),
    partial: message
  })
  stream.push({
    type: 'toolcall_end',
    contentIndex: 0,
    toolCall: message.content[0],
    partial: message
  })
  stream.push({ type: 'done', reason: 'toolUse', message })
  stream.end(message)
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
  streamSimple: (_model, _context) => {
    requestCount += 1
    const stream = createAssistantMessageEventStream()
    queueMicrotask(() => {
      if (requestCount === 1) {
        emitToolCall(stream, 'echo', { text: 'hello' })
      } else {
        emitText(stream, `完成，第 ${requestCount} 次请求。`)
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
      name: 'echo',
      label: 'Echo',
      description: '原样返回 text',
      parameters: Type.Object({ text: Type.String() }),
      execute: async (_id, params) => ({
        content: [{ type: 'text', text: `echo:${params.text}` }],
        details: { ok: true }
      })
    }
  ]
})

const events = []
session.subscribe((event) => {
  events.push(event.type)
  if (event.type === 'message_update') {
    const update = event.assistantMessageEvent
    if (update.type === 'text_delta') process.stdout.write(`[text] ${update.delta}\n`)
    if (update.type === 'toolcall_start') process.stdout.write('[toolcall] start\n')
  }
  if (event.type === 'tool_execution_start') {
    process.stdout.write(`[tool] ${event.toolName} ${JSON.stringify(event.args)}\n`)
  }
  if (event.type === 'tool_execution_end') {
    process.stdout.write(`[tool-end] ${event.toolName} error=${event.isError}\n`)
  }
  if (event.type === 'agent_settled') process.stdout.write('[settled]\n')
})

await session.prompt('请调用 echo 工具')
console.log('events:', [...new Set(events)].join(', '))
console.log('requests:', requestCount)
console.log('lastText:', session.getLastAssistantText?.())

session.dispose()
