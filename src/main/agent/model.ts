import type { AgentModelInfo, AgentUsage } from '@shared/agent'
import type { ModelDef } from '@shared/provider-schema'
import { httpFetch } from '../providers/http'
import { mergeHeaders } from '../providers/headers'
import { listProviders, resolveProvider } from '../settings/store'

export interface AgentRuntimeModel {
  info: AgentModelInfo
  model: ModelDef
  provider: {
    baseUrl: string
    apiKey: string
    headers?: Record<string, string>
  }
}

export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

export interface AgentChatResult {
  content: string
  toolCalls: Array<{
    callId: string
    name: string
    args: Record<string, unknown>
    rawArguments: string
  }>
  assistantMessage: AgentChatMessage
  usage?: AgentUsage
}

export async function resolveTextModel(): Promise<AgentRuntimeModel | null> {
  const providers = await listProviders()

  for (const provider of providers) {
    const model = provider.models.find((item) => item.capability === 'text.chat')
    if (!model) continue

    const runtime = await resolveProvider(provider.id)
    if (!runtime) continue

    return {
      info: {
        providerId: provider.id,
        modelId: model.id,
        name: model.name
      },
      model,
      provider: {
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        ...(runtime.headers ? { headers: runtime.headers } : {})
      }
    }
  }

  return null
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // 模型可能分片或返回不完整 JSON，交给 runtime 当作参数错误处理。
  }
  return {}
}

function buildAssistantMessage(
  content: string,
  toolCalls: AgentChatResult['toolCalls']
): AgentChatMessage {
  return {
    role: 'assistant',
    content: content || null,
    ...(toolCalls.length
      ? {
          tool_calls: toolCalls.map((call) => ({
            id: call.callId,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments: call.rawArguments
            }
          }))
        }
      : {})
  }
}

async function readSse(
  response: Response,
  onTextDelta?: (text: string) => void
): Promise<AgentChatResult> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('模型没有返回流式响应')

  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let usage: AgentUsage | undefined
  const toolCalls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue

      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null
            tool_calls?: Array<{
              index?: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
        }>
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
        }
      }
      try {
        chunk = JSON.parse(data)
      } catch {
        continue
      }

      if (chunk.usage) {
        usage = {
          input: chunk.usage.prompt_tokens ?? 0,
          output: chunk.usage.completion_tokens ?? 0,
          total:
            chunk.usage.total_tokens ??
            (chunk.usage.prompt_tokens ?? 0) +
              (chunk.usage.completion_tokens ?? 0)
        }
      }

      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue

      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content
        onTextDelta?.(delta.content)
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const item of delta.tool_calls) {
          const index = typeof item.index === 'number' ? item.index : 0
          const current = toolCalls.get(index) ?? {
            id: '',
            name: '',
            arguments: ''
          }
          if (typeof item.id === 'string') current.id = item.id
          if (typeof item.function?.name === 'string') {
            current.name = item.function.name
          }
          if (typeof item.function?.arguments === 'string') {
            current.arguments += item.function.arguments
          }
          toolCalls.set(index, current)
        }
      }
    }
  }

  const calls = [...toolCalls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => ({
      callId: call.id,
      name: call.name,
      args: parseArguments(call.arguments),
      rawArguments: call.arguments
    }))
    .filter((call) => call.name)

  return {
    content,
    toolCalls: calls,
    assistantMessage: buildAssistantMessage(content, calls),
    ...(usage ? { usage } : {})
  }
}

export async function chatWithTools(input: {
  runtime: AgentRuntimeModel
  messages: AgentChatMessage[]
  tools: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
  signal: AbortSignal
  onTextDelta?: (text: string) => void
}): Promise<AgentChatResult> {
  const { runtime, messages, tools, signal, onTextDelta } = input
  const baseUrl = runtime.provider.baseUrl.trim().replace(/\/+$/, '')

  const response = await httpFetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: mergeHeaders(
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${runtime.provider.apiKey}`
      },
      runtime.provider.headers
    ),
    body: JSON.stringify({
      model: runtime.model.remoteModel,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 2048,
      stream: true
    }),
    signal
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) {
    return readSse(response, onTextDelta)
  }

  // 部分中转站忽略 stream 参数，直接返回 JSON；这里做兼容回退。
  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }>
      }
    }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }

  const message = json.choices?.[0]?.message
  if (!message) throw new Error('模型没有返回消息')

  const content = typeof message.content === 'string' ? message.content : ''
  if (content) onTextDelta?.(content)

  const calls = (message.tool_calls ?? []).map((call) => ({
    callId: call.id,
    name: call.function.name,
    args: parseArguments(call.function.arguments),
    rawArguments: call.function.arguments
  }))

  const usage = json.usage
    ? {
        input: json.usage.prompt_tokens ?? 0,
        output: json.usage.completion_tokens ?? 0,
        total:
          json.usage.total_tokens ??
          (json.usage.prompt_tokens ?? 0) + (json.usage.completion_tokens ?? 0)
      }
    : undefined

  return {
    content,
    toolCalls: calls,
    assistantMessage: buildAssistantMessage(content, calls),
    ...(usage ? { usage } : {})
  }
}
