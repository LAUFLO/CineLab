import { httpFetch } from './http'
import type { ModelDef } from '@shared/provider-schema'
import type {
  AdapterContext,
  ProviderOutput,
  ProviderRuntime
} from './openai-compat'
import { mergeHeaders } from './headers'
import { sleep } from './retry'

interface ImageRef {
  dataUrl: string
  role: string
}

interface AgnesTask {
  video_id?: string
  id?: string
  task_id?: string
  status?: string
  progress?: number
  url?: string
  error?: { message?: string } | string | null
  detail?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function errorMessage(task: AgnesTask): string {
  if (typeof task.error === 'string') return task.error
  if (task.error?.message) return task.error.message
  return task.detail ?? '任务失败'
}

export async function generateVideoAgnes(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ImageRef[],
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const origin = new URL(baseUrl).origin
  const headers = mergeHeaders(
    {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json'
    },
    provider.headers
  )

  const firstFrame = refs.find((ref) => ref.role === 'firstFrame')
  const lastFrame = refs.find((ref) => ref.role === 'lastFrame')
  const references = refs.filter((ref) => ref.role === 'reference')
  const mode = firstFrame || lastFrame
    ? 'keyframe'
    : references.length > 0
      ? 'reference'
      : 'text'

  const body: Record<string, unknown> = {
    model: model.remoteModel,
    prompt,
    mode,
    seconds: String(params.duration ?? params.seconds ?? '5'),
    size: '720P',
    aspect_ratio: params.ratio ?? '16:9'
  }

  if (mode === 'keyframe') {
    if (firstFrame) body.first_frame = firstFrame.dataUrl
    if (lastFrame) body.last_frame = lastFrame.dataUrl
  } else if (mode === 'reference') {
    body.images = references.slice(0, 5).map((ref) => ref.dataUrl)
  }

  ctx.onProgress(5, '提交视频任务')

  const submit = await httpFetch(`${baseUrl}/videos`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!submit.ok) {
    const text = await submit.text().catch(() => '')
    throw new Error(`HTTP ${submit.status}: ${text.slice(0, 400)}`)
  }

  const created = (await submit.json()) as AgnesTask
  const videoId = created.video_id ?? created.id ?? created.task_id
  if (!videoId) {
    throw new Error('接口没有返回 video_id')
  }

  const queryUrl =
    `${origin}/agnesapi?video_id=${encodeURIComponent(videoId)}` +
    `&model_name=${encodeURIComponent(model.remoteModel)}`

  ctx.onProgress(10, '任务已创建，等待生成')

  const maxAttempts = 180
  let consecutiveErrors = 0

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(2000, ctx.signal)

    let task: AgnesTask

    try {
      const response = await httpFetch(queryUrl, { headers, signal: ctx.signal })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`查询任务失败 HTTP ${response.status}: ${text.slice(0, 200)}`)
      }

      task = (await response.json()) as AgnesTask
      consecutiveErrors = 0
    } catch (error) {
      consecutiveErrors += 1
      if (consecutiveErrors >= 5) throw error
      ctx.onProgress(10, `查询失败，重试中（${consecutiveErrors}/5）`)
      continue
    }

    if (task.status === 'failed') {
      throw new Error(errorMessage(task))
    }

    if (task.status === 'completed') {
      if (!task.url) throw new Error('任务完成但没有返回视频地址')

      ctx.onProgress(92, '下载视频')

      let download: Response | null = null
      for (let retry = 0; retry < 3; retry += 1) {
        try {
          const response = await httpFetch(task.url, { signal: ctx.signal })
          if (response.ok) {
            download = response
            break
          }
        } catch {
          // 网络抖动时重试下载
        }
        await sleep(1500, ctx.signal)
      }

      if (!download) {
        throw new Error('下载视频失败，请稍后重试')
      }

      const mime = download.headers.get('content-type')?.split(';')[0] ?? 'video/mp4'
      return [{ data: Buffer.from(await download.arrayBuffer()), mime }]
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 80), 90)
    ctx.onProgress(percent, `生成中（${task.status ?? 'processing'}）`)
  }

  throw new Error('视频任务超时')
}
