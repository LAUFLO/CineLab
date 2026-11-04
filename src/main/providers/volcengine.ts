import type { ModelDef } from '@shared/provider-schema'
import { sleep } from './retry'
import type { AdapterContext, ImageOutput, ProviderRuntime } from './openai-compat'

interface TaskResponse {
  id?: string
  status?: string
  content?: { video_url?: string }
  error?: { message?: string }
}

export interface ImageRef {
  dataUrl: string
  role: string
}

function roleName(role: string): string {
  if (role === 'firstFrame') return 'first_frame'
  if (role === 'lastFrame') return 'last_frame'
  return 'reference'
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export async function generateVideoArk(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ImageRef[],
  ctx: AdapterContext
): Promise<ImageOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const headers = {
    Authorization: `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json'
  }

  const content: unknown[] = [{ type: 'text', text: prompt }]

  for (const ref of refs) {
    content.push({
      type: 'image_url',
      image_url: { url: ref.dataUrl },
      role: roleName(ref.role)
    })
  }

  const body: Record<string, unknown> = {
    model: model.remoteModel,
    content,
    resolution: params.resolution ?? '720p',
    ratio: params.ratio ?? '16:9',
    duration: Number(params.duration ?? 5),
    watermark: false
  }

  if (params.generate_audio !== undefined) {
    body.generate_audio = Boolean(params.generate_audio)
  }

  ctx.onProgress(5, '提交任务')

  const submit = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!submit.ok) {
    const text = await submit.text().catch(() => '')
    throw new Error(`HTTP ${submit.status}: ${text.slice(0, 400)}`)
  }

  const created = (await submit.json()) as TaskResponse
  if (!created.id) {
    throw new Error('接口没有返回任务 ID')
  }

  const taskId = created.id
  const maxAttempts = 180
  const interval = 5000

  ctx.onProgress(10, '任务已创建，等待生成')

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(interval, ctx.signal)

    const response = await fetch(`${baseUrl}/contents/generations/tasks/${taskId}`, {
      headers,
      signal: ctx.signal
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`查询任务失败 HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    const task = (await response.json()) as TaskResponse

    if (task.status === 'failed' || task.status === 'cancelled') {
      throw new Error(task.error?.message ?? `任务状态：${task.status}`)
    }

    if (task.status === 'succeeded') {
      const videoUrl = task.content?.video_url
      if (!videoUrl) throw new Error('任务成功但没有返回视频地址')

      ctx.onProgress(92, '下载视频')

      const download = await fetch(videoUrl, { signal: ctx.signal })
      if (!download.ok) {
        throw new Error(`下载视频失败：HTTP ${download.status}`)
      }

      const mime = download.headers.get('content-type')?.split(';')[0] ?? 'video/mp4'
      return [{ data: Buffer.from(await download.arrayBuffer()), mime }]
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 80), 90)
    ctx.onProgress(percent, `生成中（${task.status ?? 'running'}）`)
  }

  throw new Error('视频任务超时')
}
