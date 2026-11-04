import type { ModelDef } from '@shared/provider-schema'

export interface ProviderRuntime {
  baseUrl: string
  apiKey: string
}

export interface AdapterContext {
  signal: AbortSignal
  onProgress: (percent: number, message?: string) => void
}

export interface ImageOutput {
  data: Buffer
  mime: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export async function generateImage(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  ctx: AdapterContext
): Promise<ImageOutput[]> {
  const body: Record<string, unknown> = {
    model: model.remoteModel,
    prompt,
    n: Number(params.n ?? 1)
  }

  if (params.size) body.size = params.size
  if (params.quality) body.quality = params.quality

  ctx.onProgress(5, '提交请求')

  const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/images/generations`, {
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

    ctx.onProgress(
      60 + Math.round(((index + 1) / items.length) * 25),
      '下载结果'
    )
  }

  ctx.onProgress(90, '写入项目')
  return outputs
}
