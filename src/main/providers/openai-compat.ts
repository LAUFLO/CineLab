import { httpFetch } from './http'
import type { ModelDef } from '@shared/provider-schema'
import type {
  AssetLayer,
  LayerBounds,
  LayerBox,
  TextRecognition,
  TextRecognitionLine,
  TextRecognitionStyle
} from '@shared/generation'
import { mergeHeaders } from './headers'
import { sleep } from './retry'
import { applyModelRequestBody, applyModelRequestForm } from './model-body'

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
  /** 图层拆分结果中的图层信息 */
  layer?: AssetLayer
  /** 规整文字图层的富文本 OCR 结果 */
  textRecognition?: TextRecognition
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toBounds(value: unknown): LayerBounds | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined
  const numbers = value.map((item) => Number(item))
  if (numbers.some((item) => !Number.isFinite(item))) return undefined
  return [numbers[0], numbers[1], numbers[2], numbers[3]]
}

function toLayerBox(value: unknown): LayerBox | undefined {
  if (!isRecord(value)) return undefined
  const absolute = toBounds(value.absolute)
  const normalized = toBounds(value.normalized)
  if (!absolute && !normalized) return undefined
  return {
    ...(absolute ? { absolute } : {}),
    ...(normalized ? { normalized } : {})
  }
}

function toTextStyle(value: unknown): TextRecognitionStyle | undefined {
  if (!isRecord(value)) return undefined
  const style: TextRecognitionStyle = {}
  if (typeof value.similar_font_family === 'string') {
    style.similarFontFamily = value.similar_font_family
  }
  if (typeof value.foreground_color === 'string') {
    style.foregroundColor = value.foreground_color
  }
  for (const key of [
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'shadow',
    'translucent'
  ] as const) {
    if (typeof value[key] === 'boolean') style[key] = value[key] as boolean
  }
  return Object.keys(style).length > 0 ? style : undefined
}

function toTextRecognition(value: unknown): TextRecognition | undefined {
  if (!isRecord(value) || typeof value.text !== 'string') return undefined

  const lines: TextRecognitionLine[] = []
  if (Array.isArray(value.lines)) {
    for (const line of value.lines) {
      if (!isRecord(line) || !Array.isArray(line.runs)) continue
      const runs = line.runs.flatMap((run) => {
        if (!isRecord(run) || typeof run.text !== 'string') return []
        const style = toTextStyle(run.style)
        return [{ text: run.text, ...(style ? { style } : {}) }]
      })
      if (runs.length === 0) continue
      const boundingBox = toLayerBox(line.bounding_box)
      lines.push({ ...(boundingBox ? { boundingBox } : {}), runs })
    }
  }

  return {
    text: value.text,
    ...(lines.length > 0 ? { lines } : {})
  }
}

async function parseImageResponse(
  response: Response,
  ctx: AdapterContext
): Promise<ImageOutput[]> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 2000)}`)
  }

  const json = (await response.json()) as {
    data?: Array<{
      b64_json?: string
      url?: string
      output_format?: string
      z_index?: number
      name?: string
      description?: string
      bounding_box?: unknown
      text_recognition?: unknown
    }>
  }

  const items = json.data ?? []
  if (items.length === 0) {
    throw new Error('接口返回了空结果')
  }

  ctx.onProgress(60, '下载结果')
  const outputs: ImageOutput[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]

    const boundingBox = toLayerBox(item.bounding_box)
    const layer: AssetLayer | undefined =
      typeof item.z_index === 'number'
        ? {
            zIndex: item.z_index,
            ...(item.name ? { name: item.name } : {}),
            ...(item.description ? { description: item.description } : {}),
            ...(boundingBox ? { boundingBox } : {})
          }
        : undefined
    const textRecognition = toTextRecognition(item.text_recognition)

    if (item.b64_json) {
      const format = item.output_format
      outputs.push({
        data: Buffer.from(item.b64_json, 'base64'),
        mime: format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : 'image/png',
        ...(layer ? { layer } : {}),
        ...(textRecognition ? { textRecognition } : {})
      })
    } else if (item.url) {
      const download = await httpFetch(item.url, { signal: ctx.signal })
      if (!download.ok) {
        throw new Error(`下载图片失败：HTTP ${download.status}`)
      }
      const mime = download.headers.get('content-type')?.split(';')[0] ?? 'image/png'
      outputs.push({
        data: Buffer.from(await download.arrayBuffer()),
        mime,
        ...(layer ? { layer } : {}),
        ...(textRecognition ? { textRecognition } : {})
      })
    }

    ctx.onProgress(60 + Math.round(((index + 1) / items.length) * 25), '下载结果')
  }

  ctx.onProgress(90, '写入项目')
  return outputs
}

const DECLARED_IMAGE_DIMENSION_KEYS = [
  'ratio',
  'aspect_ratio',
  'width',
  'height'
] as const

function extraBodyHas(model: ModelDef, key: string): boolean {
  return Boolean(
    model.extraBody &&
      Object.prototype.hasOwnProperty.call(model.extraBody, key)
  )
}

function declaredImageParam(
  model: ModelDef,
  key: string,
  mode: 't2i' | 'i2i'
): boolean {
  return model.params.some(
    (param) =>
      param.key === key &&
      (!param.appliesTo || param.appliesTo.includes(mode)) &&
      (!param.when?.mode || param.when.mode === mode)
  )
}

/**
 * 模型显式声明了比例/宽高参数时，OpenAI 兼容的 edits / generations
 * 默认只发送 size。这里把这些字段补进表单或 JSON，避免本地已判定支持
 * 目标比例、请求却被适配器静默丢弃。
 * extraBody 已配置同名字段时交给 extraBody，避免重复。
 */
function appendDeclaredImageDimensions(
  form: FormData,
  model: ModelDef,
  params: Record<string, unknown>
): void {
  for (const key of DECLARED_IMAGE_DIMENSION_KEYS) {
    if (!declaredImageParam(model, key, 'i2i')) continue
    const value = params[key]
    if (value === undefined || value === null || value === '') continue
    if (extraBodyHas(model, key)) continue
    form.append(key, String(value))
  }
}

function declaredImageDimensions(
  model: ModelDef,
  params: Record<string, unknown>,
  mode: 't2i' | 'i2i'
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const key of DECLARED_IMAGE_DIMENSION_KEYS) {
    if (!declaredImageParam(model, key, mode)) continue
    const value = params[key]
    if (value === undefined || value === null || value === '') continue
    if (extraBodyHas(model, key)) continue
    values[key] = value
  }
  return values
}

function buildEditForm(
  model: ModelDef,
  prompt: string,
  params: Record<string, unknown>,
  refs: ReferenceImage[],
  singleField: boolean,
  mask?: string
): FormData | null {
  const form = new FormData()
  const isMoss = /moss/i.test(model.remoteModel)
  form.append('model', model.remoteModel)
  form.append('prompt', prompt)
  form.append('n', String(Number(params.n ?? 1)))
  if (params.size) form.append('size', String(params.size))
  if (params.quality) form.append('quality', String(params.quality))
  appendDeclaredImageDimensions(form, model, params)
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

  if (accepted === 0) return null

  if (mask) {
    const parsed = parseDataUrl(mask, 0)
    if (!parsed) {
      throw new Error('蒙版解析失败，无法发起局部编辑请求')
    }
    form.append('mask', parsed.blob, 'mask.png')
  }

  applyModelRequestForm(form, model, { prompt, params, refs })

  if (form.get('layer_decomposition') !== 'true') {
    form.delete('layer_decomposition_options')
  }

  if (form.get('background') === 'transparent' && form.get('output_format') !== 'png') {
    form.set('output_format', 'png')
  }

  return form
}

export async function generateImage(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ReferenceImage[],
  ctx: AdapterContext,
  mask?: string
): Promise<ImageOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const headers = mergeHeaders(
    { Authorization: `Bearer ${provider.apiKey}` },
    provider.headers
  )
  const isMoss = /moss/i.test(model.remoteModel)
  const isAgnes = /^agnes-image/i.test(model.remoteModel)

  if (isAgnes) {
    if (mask) {
      throw new Error('当前模型不支持蒙版编辑，请换用支持 /images/edits mask 的模型')
    }
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
    Object.assign(
      body,
      declaredImageDimensions(model, params, refs.length > 0 ? 'i2i' : 't2i')
    )
    applyModelRequestBody(body, model, { prompt, params, refs })

    ctx.onProgress(5, refs.length > 0 ? '提交图生图请求' : '提交请求')

    const response = await httpFetch(`${baseUrl}/images/generations`, {
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

  // Seedream 图层拆分：官方接口走 /images/generations + image，不使用 edits 表单
  const layerMode =
    params.layer_decomposition === true || params.layer_decomposition === 'true'

  if (layerMode) {
    if (refs.length === 0) {
      throw new Error('图层拆分需要一张参考图')
    }
    if (refs.length > 1) {
      throw new Error('图层拆分只支持一张参考图')
    }
    if (mask) {
      throw new Error('图层拆分不支持蒙版')
    }

    const body: Record<string, unknown> = {
      model: model.remoteModel,
      prompt,
      image: refs[0].dataUrl
    }
    if (params.size) body.size = params.size
    applyModelRequestBody(body, model, { prompt, params, refs })
    // 官方要求图层拆分场景不能传 background
    delete body.background

    ctx.onProgress(5, '提交图层拆分请求')

    const response = await httpFetch(`${baseUrl}/images/generations`, {
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

  if (mask && refs.length === 0) {
    throw new Error('蒙版编辑需要一张参考图')
  }

  if (refs.length > 0) {
    ctx.onProgress(5, '提交图生图请求')
    const form = buildEditForm(model, prompt, params, refs, false, mask)
    if (!form) {
      throw new Error('参考图解析失败，无法发起图生图请求')
    }

    const response = await httpFetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers,
      body: form,
      signal: ctx.signal
    })

    if (mask && !response.ok) {
      const status = response.status
      const text = await response.text().catch(() => '')
      throw new Error(
        `当前模型不支持蒙版编辑或蒙版格式不兼容（HTTP ${status}）：${text.slice(0, 2000)}`
      )
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
  Object.assign(body, declaredImageDimensions(model, params, 't2i'))

  applyModelRequestBody(body, model, {
    prompt,
    params,
    refs,
    ...(mask ? { mask } : {})
  })

  if (body.layer_decomposition !== true) {
    delete body.layer_decomposition_options
  }

  // 透明背景必须输出 PNG，避免用户只改背景导致接口报错
  if (body.background === 'transparent' && body.output_format !== 'png') {
    body.output_format = 'png'
  }

  ctx.onProgress(5, '提交请求')

  const response = await httpFetch(`${baseUrl}/images/generations`, {
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
  applyModelRequestBody(body, model, { prompt: input, params })

  ctx.onProgress(10, '合成语音')

  const response = await httpFetch(`${normalizeBaseUrl(provider.baseUrl)}/audio/speech`, {
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
    throw new Error(`HTTP ${response.status}: ${message.slice(0, 2000)}`)
  }

  const mime = response.headers.get('content-type')?.split(';')[0] ?? 'audio/mpeg'
  ctx.onProgress(80, '写入音频')

  return [{ data: Buffer.from(await response.arrayBuffer()), mime }]
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 支持 system + 多轮消息的 OpenAI 兼容 chat 请求。
 * 供剪辑助手使用，不改变现有单轮 generateText 行为。
 */
export async function chatCompletion(
  model: ModelDef,
  provider: ProviderRuntime,
  messages: ChatMessage[],
  params: Record<string, unknown>,
  ctx: AdapterContext
): Promise<string> {
  const body: Record<string, unknown> = {
    model: model.remoteModel,
    messages
  }

  if (params.temperature !== undefined) {
    body.temperature = Number(params.temperature)
  }
  if (params.max_tokens !== undefined) {
    body.max_tokens = Number(params.max_tokens)
  }

  applyModelRequestBody(body, model, { params })

  ctx.onProgress(10, '生成文本')

  const response = await httpFetch(
    `${normalizeBaseUrl(provider.baseUrl)}/chat/completions`,
    {
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
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 2000)}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('接口没有返回文本内容')
  }

  ctx.onProgress(90, '生成完成')
  return content
}

export async function generateText(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ReferenceImage[],
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  const messageContent =
    refs.length > 0
      ? [
          { type: 'text', text: prompt },
          ...refs.map((ref) => ({
            type: 'image_url',
            image_url: { url: ref.dataUrl }
          }))
        ]
      : prompt

  const body: Record<string, unknown> = {
    model: model.remoteModel,
    messages: [{ role: 'user', content: messageContent }]
  }

  if (params.temperature !== undefined) {
    body.temperature = Number(params.temperature)
  }
  if (params.max_tokens !== undefined) {
    body.max_tokens = Number(params.max_tokens)
  }

  applyModelRequestBody(body, model, { prompt, params, refs })

  ctx.onProgress(10, '生成文本')

  const response = await httpFetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
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
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 2000)}`)
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
  const response = await httpFetch(url, { signal: ctx.signal })

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
  applyModelRequestBody(body, model, { prompt, params })

  ctx.onProgress(5, '提交音乐任务')

  const response = await httpFetch(`${baseUrl}/audio/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 2000)}`)
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
      const poll = await httpFetch(
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
