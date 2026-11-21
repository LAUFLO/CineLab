import { httpFetch } from './http'
import type { ModelDef } from '@shared/provider-schema'
import type { VideoOperationOptions } from '@shared/generation'
import { mergeHeaders } from './headers'
import { sleep } from './retry'
import { contractFor } from '@shared/capabilities'
import type { ModelContract } from '@shared/model-contracts'
import { applyModelRequestBody } from './model-body'
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

export interface ArkVideoInput {
  dataUrl: string
  mime: string
  absolutePath?: string
}

function roleName(role: string, contract: ModelContract | null): string {
  if (role === 'firstFrame') return contract?.roles.firstFrame ?? 'first_frame'
  if (role === 'lastFrame') return contract?.roles.lastFrame ?? 'last_frame'
  return contract?.roles.reference ?? 'reference_image'
}

function operationHint(
  videoOptions: VideoOperationOptions | undefined
): string {
  if (!videoOptions) return ''

  if (videoOptions.operation === 'extend') {
    return videoOptions.direction === 'backward'
      ? '向前延长这段视频。'
      : '向后延长这段视频。'
  }

  if (videoOptions.range) {
    return `只修改第 ${videoOptions.range.start.toFixed(1)} 到 ${videoOptions.range.end.toFixed(1)} 秒，其余画面保持不变。`
  }

  return ''
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
  ctx: AdapterContext,
  video?: ArkVideoInput,
  videoOptions?: VideoOperationOptions
): Promise<ImageOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const headers = mergeHeaders(
    {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json'
    },
    provider.headers
  )

  const hint = operationHint(videoOptions)
  const finalPrompt = hint ? `${prompt}\n\n${hint}` : prompt
  const content: unknown[] = [{ type: 'text', text: finalPrompt }]
  const contract = contractFor(model)

  for (const ref of refs) {
    content.push({
      type: 'image_url',
      image_url: { url: ref.dataUrl },
      role: roleName(ref.role, contract)
    })
  }

  if (video) {
    content.push({
      type: 'video_url',
      video_url: { url: video.dataUrl },
      role: 'reference_video'
    })
  }

  const isEdit =
    videoOptions?.operation === 'shot-retake' ||
    videoOptions?.operation === 'element-replace'
  const isExtend = videoOptions?.operation === 'extend'
  const isOmni = isEdit || isExtend

  const body: Record<string, unknown> = {
    model: model.remoteModel,
    content,
    resolution: params.resolution ?? '720p',
    ratio: isOmni ? 'adaptive' : (params.ratio ?? '16:9'),
    duration: isOmni ? -1 : Number(params.duration ?? 5),
    watermark: Boolean(params.watermark ?? false)
  }

  if (isOmni && /2-5/i.test(model.remoteModel)) {
    body.omni_reference_task_type = isExtend ? 'extend' : 'edit'
  }

  if (params.generate_audio !== undefined) {
    body.generate_audio = Boolean(params.generate_audio)
  }

  applyModelRequestBody(body, model, { prompt: finalPrompt, params, refs })

  ctx.onProgress(5, '提交任务')

  const submit = await httpFetch(`${baseUrl}/contents/generations/tasks`, {
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

    const response = await httpFetch(`${baseUrl}/contents/generations/tasks/${taskId}`, {
      headers,
      signal: ctx.signal
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`查询任务失败 HTTP ${response.status}: ${text.slice(0, 1000)}`)
    }

    const task = (await response.json()) as TaskResponse

    if (task.status === 'failed' || task.status === 'cancelled') {
      throw new Error(task.error?.message ?? `任务状态：${task.status}`)
    }

    if (task.status === 'succeeded') {
      const videoUrl = task.content?.video_url
      if (!videoUrl) throw new Error('任务成功但没有返回视频地址')

      ctx.onProgress(92, '下载视频')

      const download = await httpFetch(videoUrl, { signal: ctx.signal })
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
