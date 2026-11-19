import type {
  AssistantMessage,
  AssistantMessageEventStream,
  JsonObject,
  Model,
  SimpleStreamOptions,
  TextContent,
  ThinkingContent,
  ToolCall,
  TranscriptContext,
  Usage
} from '@earendil-works/pi-ai'
import type { AgentRuntimeModel } from '../model'
import { httpFetch } from '../../providers/http'
import { loadPiAi, loadPiCodingAgent } from './loader'
import { textOfContent } from './events'

type PiAiModule = typeof import('@earendil-works/pi-ai')
type OpenAiModel = Model<'openai-completions'>

export interface PiModelHandle {
  modelRuntime: import('@earendil-works/pi-coding-agent').ModelRuntime
  model: OpenAiModel
}

const ZERO_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0
}

function zeroUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { ...ZERO_COST, total: 0 }
  }
}

function usageFrom(raw: {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}): Usage {
  const input = raw.prompt_tokens ?? 0
  const output = raw.completion_tokens ?? 0
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: raw.total_tokens ?? input + output,
    cost: { ...ZERO_COST, total: 0 }
  }
}

function maxTokensOf(runtime: AgentRuntimeModel): number {
  const param = runtime.model.params.find((item) => item.key === 'max_tokens')
  const value = Number(param?.defaultValue)
  return Number.isFinite(value) && value > 0 ? value : 4096
}

function openAiMessages(
  context: TranscriptContext,
  piAi: PiAiModule
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = []
  const system = piAi.getCurrentSystemMessage(context.messages)
  if (system) {
    messages.push({
      role: 'system',
      content: piAi.getSystemMessageText(system)
    })
  }

  for (const message of context.messages) {
    if (message.role === 'system') continue
    if (message.role === 'user') {
      messages.push({
        role: 'user',
        content: textOfContent(message.content)
      })
      continue
    }
    if (message.role === 'assistant') {
      const text = textOfContent(message.content).trim()
      const toolCalls = message.content
        .filter((part): part is ToolCall => part.type === 'toolCall')
        .map((part) => ({
          id: part.id,
          type: 'function',
          function: {
            name: part.name,
            arguments: JSON.stringify(part.arguments ?? {})
          }
        }))
      messages.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {})
      })
      continue
    }
    messages.push({
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: textOfContent(message.content)
    })
  }
  return messages
}

function openAiTools(
  context: TranscriptContext,
  piAi: PiAiModule
): Array<Record<string, unknown>> {
  return piAi.getCurrentTools(context.messages).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.parameters ?? { type: 'object', properties: {} }
    }
  }))
}

function requestHeaders(runtime: AgentRuntimeModel): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(runtime.provider.apiKey
      ? { Authorization: `Bearer ${runtime.provider.apiKey}` }
      : {}),
    ...(runtime.provider.headers ?? {})
  }
}

interface OpenAiChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

function stopReasonOf(finishReason: string | null | undefined): AssistantMessage['stopReason'] {
  if (finishReason === 'tool_calls' || finishReason === 'function_call') {
    return 'toolUse'
  }
  if (finishReason === 'length') return 'length'
  if (finishReason === 'content_filter') return 'error'
  return 'stop'
}

function isResponse(value: Response | AssistantMessage): value is Response {
  return (
    typeof (value as Response).status === 'number' &&
    typeof (value as Response).headers?.get === 'function'
  )
}

function errorMessage(
  runtime: AgentRuntimeModel,
  stopReason: 'error' | 'aborted',
  message: string
): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'openai-completions',
    provider: runtime.info.providerId,
    model: runtime.info.modelId,
    usage: zeroUsage(),
    stopReason,
    errorMessage: message,
    timestamp: Date.now()
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get('retry-after')
  const seconds = header ? Number(header) : NaN
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 30_000)
  }
  return Math.min(1000 * 2 ** attempt, 8_000)
}

async function requestStream(
  runtime: AgentRuntimeModel,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Response | AssistantMessage> {
  const baseUrl = runtime.provider.baseUrl.trim().replace(/\/+$/, '')
  let lastError = '模型请求失败'

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await httpFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(runtime),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {})
    })
    if (response.ok) return response

    const text = await response.text().catch(() => '')
    lastError = `HTTP ${response.status}: ${text.slice(0, 400)}`
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === 2 || signal?.aborted) break
    await sleep(retryDelay(response, attempt), signal)
  }

  return errorMessage(runtime, signal?.aborted ? 'aborted' : 'error', lastError)
}

async function streamFromSse(
  response: Response,
  runtime: AgentRuntimeModel,
  piAi: PiAiModule,
  stream: AssistantMessageEventStream,
  signal?: AbortSignal
): Promise<AssistantMessage> {
  const message: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: 'openai-completions',
    provider: runtime.info.providerId,
    model: runtime.info.modelId,
    usage: zeroUsage(),
    stopReason: 'pending',
    timestamp: Date.now()
  }
  stream.push({ type: 'start', partial: message })

  let textBlock: TextContent | null = null
  let textIndex = -1
  let thinkingBlock: ThinkingContent | null = null
  let thinkingIndex = -1
  let finishReason: string | null = null
  const toolBlocks = new Map<
    number,
    { block: ToolCall; raw: string; index: number; ended: boolean }
  >()

  const ensureText = (): void => {
    if (textBlock) return
    textBlock = { type: 'text', text: '' }
    message.content.push(textBlock)
    textIndex = message.content.length - 1
    stream.push({ type: 'text_start', contentIndex: textIndex, partial: message })
  }

  const ensureThinking = (): void => {
    if (thinkingBlock) return
    thinkingBlock = { type: 'thinking', thinking: '' }
    message.content.push(thinkingBlock)
    thinkingIndex = message.content.length - 1
    stream.push({
      type: 'thinking_start',
      contentIndex: thinkingIndex,
      partial: message
    })
  }

  const appendTool = (item: {
    index?: number
    id?: string
    function?: { name?: string; arguments?: string }
  }): void => {
    const index = typeof item.index === 'number' ? item.index : 0
    let entry = toolBlocks.get(index)
    if (!entry) {
      const block: ToolCall = {
        type: 'toolCall',
        id: item.id ?? `call_${index}`,
        name: item.function?.name ?? '',
        arguments: {}
      }
      message.content.push(block)
      entry = {
        block,
        raw: '',
        index: message.content.length - 1,
        ended: false
      }
      toolBlocks.set(index, entry)
      stream.push({
        type: 'toolcall_start',
        contentIndex: entry.index,
        partial: message
      })
    }
    if (item.id) entry.block.id = item.id
    if (item.function?.name) entry.block.name = item.function.name
    const delta = item.function?.arguments ?? ''
    if (delta) {
      entry.raw += delta
      stream.push({
        type: 'toolcall_delta',
        contentIndex: entry.index,
        delta,
        partial: message
      })
    }
  }

  const finishTools = (): void => {
    for (const entry of toolBlocks.values()) {
      if (entry.ended) continue
      entry.ended = true
      try {
        const parsed = JSON.parse(entry.raw || '{}') as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          entry.block.arguments = parsed as JsonObject
        } else {
          entry.block.argumentsError = '工具参数不是对象'
        }
      } catch {
        entry.block.argumentsError = `工具参数不是合法 JSON：${entry.raw.slice(0, 200)}`
      }
      stream.push({
        type: 'toolcall_end',
        contentIndex: entry.index,
        toolCall: entry.block,
        partial: message
      })
    }
  }

  const finishText = (): void => {
    if (!textBlock) return
    stream.push({
      type: 'text_end',
      contentIndex: textIndex,
      content: textBlock.text,
      partial: message
    })
    textBlock = null
  }

  const finishThinking = (): void => {
    if (!thinkingBlock) return
    stream.push({
      type: 'thinking_end',
      contentIndex: thinkingIndex,
      content: thinkingBlock.thinking,
      partial: message
    })
    thinkingBlock = null
  }

  const endMessage = (
    stopReason: AssistantMessage['stopReason'],
    error?: string
  ): AssistantMessage => {
    finishText()
    finishThinking()
    finishTools()
    message.stopReason = stopReason
    message.timestamp = message.timestamp || Date.now()
    if (error) message.errorMessage = error
    if (stopReason === 'error' || stopReason === 'aborted') {
      stream.push({
        type: 'error',
        reason: stopReason as 'error' | 'aborted',
        error: message
      })
    } else {
      stream.push({
        type: 'done',
        reason: stopReason as 'stop' | 'length' | 'toolUse' | 'deferred',
        message
      })
    }
    stream.end(message)
    return message
  }

  try {
    const reader = response.body?.getReader()
    if (!reader) {
      return endMessage('error', '模型没有返回流式响应')
    }
    const decoder = new TextDecoder()
    let buffer = ''
    let ended = false

    while (!ended) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined)
        return endMessage('aborted', '已取消')
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue

        let chunk: OpenAiChunk
        try {
          chunk = JSON.parse(data) as OpenAiChunk
        } catch {
          continue
        }

        if (chunk.usage) message.usage = usageFrom(chunk.usage)
        const choice = chunk.choices?.[0]
        if (!choice) continue
        if (choice.finish_reason) finishReason = choice.finish_reason

        const delta = choice.delta
        if (!delta) continue
        const reasoning = delta.reasoning_content ?? delta.reasoning
        if (typeof reasoning === 'string' && reasoning) {
          ensureThinking()
          if (thinkingBlock) {
            thinkingBlock.thinking += reasoning
            stream.push({
              type: 'thinking_delta',
              contentIndex: thinkingIndex,
              delta: reasoning,
              partial: message
            })
          }
        }
        if (typeof delta.content === 'string' && delta.content) {
          ensureText()
          if (textBlock) {
            textBlock.text += delta.content
            stream.push({
              type: 'text_delta',
              contentIndex: textIndex,
              delta: delta.content,
              partial: message
            })
          }
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const item of delta.tool_calls) appendTool(item)
        }
      }
    }

    const stopReason =
      finishReason === 'content_filter'
        ? 'error'
        : toolBlocks.size > 0 && !finishReason
          ? 'toolUse'
          : stopReasonOf(finishReason)
    return endMessage(
      stopReason,
      stopReason === 'error' && finishReason === 'content_filter'
        ? '模型返回内容被过滤'
        : undefined
    )
  } catch (error) {
    if (signal?.aborted) return endMessage('aborted', '已取消')
    const messageText =
      error instanceof Error ? error.message : '模型流式响应失败'
    return endMessage('error', messageText)
  }
}

async function streamFromJson(
  response: Response,
  runtime: AgentRuntimeModel,
  piAi: PiAiModule,
  stream: AssistantMessageEventStream
): Promise<AssistantMessage> {
  const message: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: 'openai-completions',
    provider: runtime.info.providerId,
    model: runtime.info.modelId,
    usage: zeroUsage(),
    stopReason: 'pending',
    timestamp: Date.now()
  }
  stream.push({ type: 'start', partial: message })

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
      finish_reason?: string | null
    }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }
  if (json.usage) message.usage = usageFrom(json.usage)
  const choice = json.choices?.[0]
  const content = choice?.message?.content ?? ''
  if (content) {
    const block: TextContent = { type: 'text', text: content }
    message.content.push(block)
    stream.push({ type: 'text_start', contentIndex: 0, partial: message })
    stream.push({
      type: 'text_delta',
      contentIndex: 0,
      delta: content,
      partial: message
    })
    stream.push({
      type: 'text_end',
      contentIndex: 0,
      content,
      partial: message
    })
  }
  for (const call of choice?.message?.tool_calls ?? []) {
    let args: JsonObject = {}
    let argumentsError: string | undefined
    try {
      const parsed = JSON.parse(call.function.arguments || '{}') as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as JsonObject
      } else {
        argumentsError = '工具参数不是对象'
      }
    } catch {
      argumentsError = '工具参数不是合法 JSON'
    }
    const block: ToolCall = {
      type: 'toolCall',
      id: call.id,
      name: call.function.name,
      arguments: args,
      ...(argumentsError ? { argumentsError } : {})
    }
    const index = message.content.length
    message.content.push(block)
    stream.push({ type: 'toolcall_start', contentIndex: index, partial: message })
    stream.push({
      type: 'toolcall_end',
      contentIndex: index,
      toolCall: block,
      partial: message
    })
  }
  const stopReason = stopReasonOf(choice?.finish_reason)
  message.stopReason = stopReason
  if (stopReason === 'error') {
    message.errorMessage = '模型返回内容被过滤'
    stream.push({ type: 'error', reason: 'error', error: message })
  } else {
    stream.push({
      type: 'done',
      reason: stopReason as 'stop' | 'length' | 'toolUse' | 'deferred',
      message
    })
  }
  stream.end(message)
  return message
}

function streamOpenAiCompletions(input: {
  runtime: AgentRuntimeModel
  piAi: PiAiModule
  model: OpenAiModel
  context: TranscriptContext
  options?: SimpleStreamOptions
}): AssistantMessageEventStream {
  const stream = input.piAi.createAssistantMessageEventStream()
  void runOpenAiStream(input, stream)
  return stream
}

async function runOpenAiStream(
  input: {
    runtime: AgentRuntimeModel
    piAi: PiAiModule
    model: OpenAiModel
    context: TranscriptContext
    options?: SimpleStreamOptions
  },
  stream: AssistantMessageEventStream
): Promise<void> {
  const { runtime, piAi, context, options } = input
  try {
    const body: Record<string, unknown> = {
      model: runtime.model.remoteModel,
      messages: openAiMessages(context, piAi),
      tools: openAiTools(context, piAi),
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: options?.maxTokens ?? maxTokensOf(runtime),
      stream: true,
      stream_options: { include_usage: true }
    }
    if (!Array.isArray(body.tools) || body.tools.length === 0) {
      delete body.tools
      delete body.tool_choice
    }

    const response = await requestStream(runtime, body, options?.signal)
    if (!isResponse(response)) {
      stream.push({
        type: 'error',
        reason: response.stopReason === 'aborted' ? 'aborted' : 'error',
        error: response
      })
      stream.end(response)
      return
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/event-stream')) {
      await streamFromSse(response, runtime, piAi, stream, options?.signal)
      return
    }
    await streamFromJson(response, runtime, piAi, stream)
  } catch (error) {
    const message = errorMessage(
      runtime,
      options?.signal?.aborted ? 'aborted' : 'error',
      error instanceof Error ? error.message : '模型请求失败'
    )
    stream.push({
      type: 'error',
      reason: message.stopReason === 'aborted' ? 'aborted' : 'error',
      error: message
    })
    stream.end(message)
  }
}

export async function createPiModelRuntime(
  runtime: AgentRuntimeModel
): Promise<PiModelHandle> {
  const [coding, piAi] = await Promise.all([
    loadPiCodingAgent(),
    loadPiAi()
  ])
  const providerId = runtime.info.providerId
  const modelId = runtime.info.modelId
  const maxTokens = maxTokensOf(runtime)

  const modelRuntime = await coding.ModelRuntime.create({
    credentials: new piAi.InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false
  })

  modelRuntime.registerProvider(providerId, {
    name: runtime.info.providerName ?? providerId,
    api: 'openai-completions',
    baseUrl: runtime.provider.baseUrl.trim().replace(/\/+$/, ''),
    headers: runtime.provider.headers,
    models: [
      {
        id: modelId,
        name: runtime.info.name,
        input: ['text'],
        cost: ZERO_COST,
        reasoning: false,
        contextWindow: 128_000,
        maxTokens
      }
    ],
    streamSimple: (model, context, options) =>
      streamOpenAiCompletions({
        runtime,
        piAi,
        model: model as OpenAiModel,
        context,
        options
      })
  })
  await modelRuntime.setRuntimeApiKey(providerId, runtime.provider.apiKey)

  const model = modelRuntime.getModel(providerId, modelId)
  if (!model) {
    throw new Error('模型运行时初始化失败')
  }
  return { modelRuntime, model: model as OpenAiModel }
}
