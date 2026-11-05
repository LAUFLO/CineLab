import type { ModelDef } from '@shared/provider-schema'

export interface ProviderRuntime {
  baseUrl: string
  apiKey: string
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
  form.append('model', model.remoteModel)
  form.append('prompt', prompt)
  form.append('n', String(Number(params.n ?? 1)))
  if (params.size) form.append('size', String(params.size))
  if (params.quality) form.append('quality', String(params.quality))

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
  const headers = { Authorization: `Bearer ${provider.apiKey}` }

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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`
    },
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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`
    },
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
