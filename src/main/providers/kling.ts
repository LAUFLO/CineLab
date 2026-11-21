import { httpFetch } from './http'
import type { ModelDef } from '@shared/provider-schema'
import { klingAuthorization } from './kling-auth'
import { mergeHeaders } from './headers'
import type {
  AdapterContext,
  ProviderOutput,
  ProviderRuntime
} from './openai-compat'
import { sleep } from './retry'
import type { LoadedRef } from './media'
import { contractFor } from '@shared/capabilities'

interface KlingTask {
  code?: number
  message?: string
  data?: {
    task_id?: string
    task_status?: string
    task_status_msg?: string
    task_result?: {
      videos?: Array<{ url?: string; duration?: string }>
    }
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '')
}

async function downloadVideo(
  url: string,
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  ctx.onProgress(92, '下载视频')

  let response: Response | null = null
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      const current = await httpFetch(url, { signal: ctx.signal })
      if (current.ok) {
        response = current
        break
      }
    } catch {
      // 网络抖动时重试下载
    }
    await sleep(1500, ctx.signal)
  }

  if (!response) throw new Error('下载视频失败')

  const mime = response.headers.get('content-type')?.split(';')[0] ?? 'video/mp4'
  return [{ data: Buffer.from(await response.arrayBuffer()), mime }]
}

export function buildKlingBody(
  model: ModelDef,
  prompt: string,
  params: Record<string, unknown>,
  refs: LoadedRef[]
): Record<string, unknown> {
  const first = refs.find((ref) => ref.role === 'firstFrame')
  const last = refs.find((ref) => ref.role === 'lastFrame')
  const contract = contractFor(model)
  const firstFrameField = contract?.fields.firstFrame ?? 'image'
  const lastFrameField = contract?.fields.lastFrame ?? 'image_tail'
  const body: Record<string, unknown> = {
    model_name: model.remoteModel,
    prompt,
    mode: String(params.mode ?? 'std'),
    duration: String(params.duration ?? '5'),
    aspect_ratio: String(params.ratio ?? '16:9'),
    cfg_scale: Number(params.cfg_scale ?? 0.5)
  }

  const negativePrompt = params.negative_prompt
  if (typeof negativePrompt === 'string' && negativePrompt.trim()) {
    body.negative_prompt = negativePrompt.trim()
  }

  if (first) body[firstFrameField] = first.base64
  if (last) body[lastFrameField] = last.base64

  return body
}

export async function generateVideoKling(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: LoadedRef[],
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const first = refs.find((ref) => ref.role === 'firstFrame')
  const last = refs.find((ref) => ref.role === 'lastFrame')
  const isImageMode = Boolean(first || last)
  const path = isImageMode ? 'image2video' : 'text2video'

  const headers = mergeHeaders(
    {
      Authorization: klingAuthorization(provider.apiKey, provider.secretKey),
      'Content-Type': 'application/json'
    },
    provider.headers
  )

  const body = buildKlingBody(model, prompt, params, refs)

  ctx.onProgress(5, '提交视频任务')

  const submit = await httpFetch(`${baseUrl}/v1/videos/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!submit.ok) {
    const text = await submit.text().catch(() => '')
    throw new Error(`HTTP ${submit.status}: ${text.slice(0, 400)}`)
  }

  const created = (await submit.json()) as KlingTask
  if (created.code !== undefined && created.code !== 0) {
    throw new Error(created.message ?? `提交任务失败：${created.code}`)
  }

  const taskId = created.data?.task_id
  if (!taskId) throw new Error('接口没有返回 task_id')

  ctx.onProgress(10, '任务已创建，等待生成')

  for (let attempt = 0; attempt < 180; attempt += 1) {
    await sleep(3000, ctx.signal)

    const response = await httpFetch(
      `${baseUrl}/v1/videos/${path}/${encodeURIComponent(taskId)}`,
      { headers, signal: ctx.signal }
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`查询任务失败 HTTP ${response.status}: ${text.slice(0, 1000)}`)
    }

    const task = (await response.json()) as KlingTask
    if (task.code !== undefined && task.code !== 0) {
      throw new Error(task.message ?? `查询任务失败：${task.code}`)
    }

    const status = task.data?.task_status ?? ''
    if (status === 'failed') {
      throw new Error(task.data?.task_status_msg ?? '视频任务失败')
    }

    if (status === 'succeed' || status === 'succeeded') {
      const url = task.data?.task_result?.videos?.[0]?.url
      if (!url) throw new Error('任务成功但没有返回视频地址')
      return downloadVideo(url, ctx)
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 70), 80)
    ctx.onProgress(percent, `生成中（${status || 'processing'}）`)
  }

  throw new Error('视频任务超时')
}
