import type { ModelDef } from '@shared/provider-schema'
import { mergeHeaders } from './headers'
import { sleep } from './retry'

export interface ProviderRuntime {
  baseUrl: string
  apiKey: string
  secretKey?: string
  headers?: Record<string, string>
}

export interface AdapterContext {
  signal: AbortSignal
  onProgress: (percent: number, message?: string) => void
}

export interface ProviderOutput {
  data: Buffer
  mime: string
  text?: string
}

export type ImageOutput = ProviderOutput

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export interface ReferenceImage {
  dataUrl: string
  role: string
}

function parseDataUrl(
  dataUrl: string,
  index: number
): { blob: Blob; filename: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) return null

  const mime = match[1]
  const ext =
    mime === 'image/jpeg'
      ? 'jpg'
      : mime === 'image/webp'
        ? 'webp'
        : mime === 'image/gif'
          ? 'gif'
          : 'png'

  return {
    blob: new Blob([Buffer.from(match[2], 'base64')], { type: mime }),
    filename: `reference-${index}.${ext}`
  }
}

async function parseImageResponse(
  response: Response,
  ctx: AdapterContext
): Promise<ImageOutput[]> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`)
  }

  const json = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>
  }

  const items = json.data ?? []
  if (items.length === 0) {
    throw new Error('接口返回了空结果')
  }

  ctx.onProgress(60, '下载结果')
  const outputs: ImageOutput[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]

    if (item.b64_json) {
      outputs.push({ data: Buffer.from(item.b64_json, 'base64'), mime: 'image/png' })
    } else if (item.url) {
      const download = await fetch(item.url, { signal: ctx.signal })
      if (!download.ok) {
        throw new Error(`下载图片失败：HTTP ${download.status}`)
      }
      const mime = download.headers.get('content-type')?.split(';')[0] ?? 'image/png'
      outputs.push({ data: Buffer.from(await download.arrayBuffer()), mime })
    }

    ctx.onProgress(60 + Math.round(((index + 1) / items.length) * 25), '下载结果')
  }

  ctx.onProgress(90, '写入项目')
  return outputs
}

function buildEditForm(
  model: ModelDef,
  prompt: string,
  params: Record<string, unknown>,
  refs: ReferenceImage[],
  singleField: boolean
): FormData | null {
  const form = new FormData()
  const isMoss = /moss/i.test(model.remoteModel)
  form.append('model', model.remoteModel)
  form.append('prompt', prompt)
  form.append('n', String(Number(params.n ?? 1)))
  if (params.size) form.append('size', String(params.size))
  if (params.quality) form.append('quality', String(params.quality))
  if (isMoss && params.watermark !== undefined) {
    form.append(
      'output_watermark',
      JSON.stringify({ enabled: Boolean(params.watermark) })
    )
  }

  let accepted = 0
  for (let index = 0; index < refs.length; index += 1) {
    const parsed = parseDataUrl(refs[index].dataUrl, index)
    if (!parsed) continue
    const field = singleField ? 'image' : refs.length === 1 ? 'image' : 'image[]'
    form.append(field, parsed.blob, parsed.filename)
    accepted += 1
    if (singleField) break
  }

  return accepted > 0 ? form : null
}

export async function generateImage(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ReferenceImage[],
  ctx: AdapterContext
): Promise<ImageOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const headers = mergeHeaders(
    { Authorization: `Bearer ${provider.apiKey}` },
    provider.headers
  )
  const isMoss = /moss/i.test(model.remoteModel)
  const isAgnes = /^agnes-image/i.test(model.remoteModel)

  if (isAgnes) {
    const body: Record<string, unknown> = {
      model: model.remoteModel,
      prompt,
      size: params.size ?? '1K',
      ratio: params.ratio ?? '1:1',
      extra_body: {
        response_format: 'url',
        ...(refs.length > 0
          ? { image: refs.map((ref) => ref.dataUrl) }
          : {})
      }
    }

    ctx.onProgress(5, refs.length > 0 ? '提交图生图请求' : '提交请求')

    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: ctx.signal
    })

    return parseImageResponse(response, ctx)
  }

  if (refs.length > 0) {
    ctx.onProgress(5, '提交图生图请求')
    const form = buildEditForm(model, prompt, params, refs, false)
    if (!form) {
      throw new Error('参考图解析失败，无法发起图生图请求')
    }

    let response = await fetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers,
      body: form,
      signal: ctx.signal
    })

    if (!response.ok && refs.length > 1) {
      const status = response.status
      const text = await response.text().catch(() => '')
      const imageFieldError =
        (status === 400 || status === 422) && /image(\[\])?/i.test(text)

      if (!imageFieldError) {
        throw new Error(`HTTP ${status}: ${text.slice(0, 400)}`)
      }

      ctx.onProgress(15, '参考图字段不兼容，改用单图重试')
      const fallback = buildEditForm(model, prompt, params, refs, true)
      if (!fallback) {
        throw new Error('参考图解析失败，无法重试图生图请求')
      }

      response = await fetch(`${baseUrl}/images/edits`, {
        method: 'POST',
        headers,
        body: fallback,
        signal: ctx.signal
      })
    }

    return parseImageResponse(response, ctx)
  }

  const body: Record<string, unknown> = {
    model: model.remoteModel,
    prompt,
    n: Number(params.n ?? 1)
  }

  if (params.size) body.size = params.size
  if (params.quality) body.quality = params.quality
  if (isMoss && params.watermark !== undefined) {
    body.output_watermark = { enabled: Boolean(params.watermark) }
  }

  ctx.onProgress(5, '提交请求')

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  return parseImageResponse(response, ctx)
}

export async function generateSpeech(
  model: ModelDef,
  provider: ProviderRuntime,
  input: string,
  params: Record<string, unknown>,
  ctx: AdapterContext
): Promise<ImageOutput[]> {
  const body = {
    model: model.remoteModel,
    input,
    voice: params.voice ?? 'alloy',
    speed: Number(params.speed ?? 1),
    response_format: params.format ?? 'mp3'
  }

  ctx.onProgress(10, '合成语音')

  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/audio/speech`, {
    method: 'POST',
    headers: mergeHeaders(
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      provider.headers
    ),
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${message.slice(0, 400)}`)
  }

  const mime = response.headers.get('content-type')?.split(';')[0] ?? 'audio/mpeg'
  ctx.onProgress(80, '写入音频')

  return [{ data: Buffer.from(await response.arrayBuffer()), mime }]
}

export async function generateText(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  const body: Record<string, unknown> = {
    model: model.remoteModel,
    messages: [{ role: 'user', content: prompt }]
  }

  if (params.temperature !== undefined) {
    body.temperature = Number(params.temperature)
  }
  if (params.max_tokens !== undefined) {
    body.max_tokens = Number(params.max_tokens)
  }

  ctx.onProgress(10, '生成文本')

  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: mergeHeaders(
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      provider.headers
    ),
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('接口没有返回文本内容')
  }

  ctx.onProgress(85, '写入文本')
  return [{ data: Buffer.from(content, 'utf8'), mime: 'text/plain', text: content }]
}

interface MusicTask {
  id?: string
  task_id?: string
  status?: string
  error?: { message?: string } | string | null
  message?: string
  url?: string
  audio_url?: string
  outputs?: string[]
  result?: { outputs?: string[]; url?: string; audio_url?: string }
  data?: {
    id?: string
    task_id?: string
    status?: string
    url?: string
    audio_url?: string
    outputs?: string[]
    result?: { outputs?: string[]; url?: string; audio_url?: string }
  }
}

function musicTaskId(task: MusicTask): string | undefined {
  return task.data?.id ?? task.data?.task_id ?? task.id ?? task.task_id
}

function musicStatus(task: MusicTask): string | undefined {
  return task.data?.status ?? task.status
}

function musicUrl(task: MusicTask): string | undefined {
  const candidates = [
    task.result?.outputs?.[0],
    task.result?.url,
    task.result?.audio_url,
    task.outputs?.[0],
    task.url,
    task.audio_url,
    task.data?.result?.outputs?.[0],
    task.data?.result?.url,
    task.data?.result?.audio_url,
    task.data?.outputs?.[0],
    task.data?.url,
    task.data?.audio_url
  ]

  return candidates.find(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
}

async function downloadAudio(
  url: string,
  ctx: AdapterContext
): Promise<ImageOutput[]> {
  const response = await fetch(url, { signal: ctx.signal })

  if (!response.ok) {
    throw new Error(`下载音频失败：HTTP ${response.status}`)
  }

  const mime = response.headers.get('content-type')?.split(';')[0] ?? 'audio/mpeg'
  return [{ data: Buffer.from(await response.arrayBuffer()), mime }]
}

export async function generateMusic(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  ctx: AdapterContext
): Promise<ImageOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const headers = mergeHeaders(
    {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json'
    },
    provider.headers
  )

  const body: Record<string, unknown> = {
    model: model.remoteModel,
    mode: params.mode ?? 'v5_5',
    generation_type: 'music_generation',
    custom_mode: false,
    instrumental:
      params.instrumental === true || params.instrumental === 'true',
    prompt
  }

  ctx.onProgress(5, '提交音乐任务')

  const response = await fetch(`${baseUrl}/audio/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.startsWith('audio/')) {
    ctx.onProgress(80, '写入音频')
    return [
      {
        data: Buffer.from(await response.arrayBuffer()),
        mime: contentType.split(';')[0] || 'audio/mpeg'
      }
    ]
  }

  let task = (await response.json()) as MusicTask
  const directUrl = musicUrl(task)
  if (directUrl) {
    ctx.onProgress(80, '下载音频')
    return downloadAudio(directUrl, ctx)
  }

  const taskId = musicTaskId(task)
  if (!taskId) {
    throw new Error('接口没有返回音乐任务 ID')
  }

  ctx.onProgress(10, '任务已创建，等待生成')

  const maxAttempts = 120
  let consecutiveErrors = 0

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(2000, ctx.signal)

    try {
      const poll = await fetch(
        `${baseUrl}/audio/generations/${encodeURIComponent(taskId)}`,
        { headers, signal: ctx.signal }
      )

      if (!poll.ok) {
        const text = await poll.text().catch(() => '')
        throw new Error(`查询任务失败 HTTP ${poll.status}: ${text.slice(0, 200)}`)
      }

      task = (await poll.json()) as MusicTask
      consecutiveErrors = 0
    } catch (error) {
      consecutiveErrors += 1
      if (consecutiveErrors >= 5) throw error
      ctx.onProgress(10, `查询失败，重试中（${consecutiveErrors}/5）`)
      continue
    }

    const status = musicStatus(task)

    if (status === 'failed' || status === 'error') {
      const message =
        typeof task.error === 'string'
          ? task.error
          : task.error?.message ?? task.message ?? '音乐任务失败'
      throw new Error(message)
    }

    const url = musicUrl(task)
    if (
      url &&
      (!status ||
        status === 'completed' ||
        status === 'succeed' ||
        status === 'success' ||
        status === 'succeeded')
    ) {
      ctx.onProgress(80, '下载音频')
      return downloadAudio(url, ctx)
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 70), 80)
    ctx.onProgress(percent, `生成中（${status ?? 'processing'}）`)
  }

  throw new Error('音乐任务超时')
}
