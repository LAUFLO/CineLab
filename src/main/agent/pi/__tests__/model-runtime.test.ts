import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentRuntimeModel } from '../../model'
import { createPiModelRuntime } from '../model-runtime'
import { loadPiAi } from '../loader'

vi.mock('../../../providers/http', () => ({
  httpFetch: vi.fn()
}))

const { httpFetch } = await import('../../../providers/http')
const fetchMock = vi.mocked(httpFetch)

const runtime = {
  info: {
    providerId: 'mock',
    modelId: 'mock-text',
    name: 'Mock Text',
    output: 'text'
  },
  model: {
    id: 'mock-text',
    name: 'Mock Text',
    capability: 'text.chat',
    remoteModel: 'mock-text',
    inputs: ['text'],
    operations: [],
    params: [],
    adapter: 'openai-compat',
    modes: []
  },
  provider: {
    baseUrl: 'https://mock.invalid/v1',
    apiKey: 'test-key',
    headers: {}
  }
} as unknown as AgentRuntimeModel

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' }
  })
}

async function streamResult() {
  const piAi = await loadPiAi()
  const context = piAi.normalizeContext({
    systemPrompt: '你是测试助手',
    messages: [],
    tools: []
  })
  const { modelRuntime, model } = await createPiModelRuntime(runtime)
  return modelRuntime.streamSimple(model, context).result()
}

describe('pi custom model runtime', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('parses a non-streaming JSON response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: '你好' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
      })
    )
    const message = await streamResult()
    expect(message.stopReason).toBe('stop')
    expect(message.content).toEqual([{ type: 'text', text: '你好' }])
    expect(message.usage.totalTokens).toBe(5)
  })

  it('parses SSE text and tool calls', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"我先读取"}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"canvas_get","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":4,"completion_tokens":3,"total_tokens":7}}\n\n',
        'data: [DONE]\n\n'
      ])
    )
    const message = await streamResult()
    expect(message.stopReason).toBe('toolUse')
    expect(message.content).toEqual(
      expect.arrayContaining([
        { type: 'text', text: '我先读取' },
        expect.objectContaining({
          type: 'toolCall',
          name: 'canvas_get',
          id: 'call_1'
        })
      ])
    )
    expect(message.usage.totalTokens).toBe(7)
  })

  it('retries a 429 response', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '0.001' }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '重试成功' }, finish_reason: 'stop' }]
        })
      )
    const message = await streamResult()
    expect(message.content).toEqual([{ type: 'text', text: '重试成功' }])
  })

  it('surfaces repeated server errors as an error message', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
    const message = await streamResult()
    expect(message.stopReason).toBe('error')
    expect(message.errorMessage).toContain('HTTP 500')
  })
})
