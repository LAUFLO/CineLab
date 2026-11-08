import { httpFetch } from './http'
import type { ModelDef } from '@shared/provider-schema'
import type {
  AdapterContext,
  ProviderOutput,
  ProviderRuntime
} from './openai-compat'
import { sleep } from './retry'
import { mergeHeaders } from './headers'

interface ImageRef {
  dataUrl: string
  role: string
}

interface MiniMaxTask {
  task_id?: string
  status?: string
  file_id?: string
  base_resp?: { status_code?: number; status_msg?: string }
  task?: {
    id?: string
    status?: string
    content?: { url?: string; prompt?: string }
    error?: { code?: string; message?: string }
  }
  file?: { download_url?: string; backup_download_url?: string }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '')
}

function baseHeaders(provider: ProviderRuntime): Record<string, string> {
  return mergeHeaders(
    {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json'
    },
    provider.headers
  )
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

function contentFromRefs(prompt: string, refs: ImageRef[]): unknown[] {
  const content: unknown[] = [{ type: 'text', text: prompt }]
  const first = refs.find((ref) => ref.role === 'firstFrame')
  const last = refs.find((ref) => ref.role === 'lastFrame')
  const references = refs.filter((ref) => ref.role === 'reference')

  if (first) {
    content.push({ type: 'image_url', image_url: { url: first.dataUrl } })
  }
  if (last) {
    content.push({ type: 'image_url', image_url: { url: last.dataUrl } })
  }
  for (const ref of references.slice(0, 5)) {
    content.push({ type: 'image_url', image_url: { url: ref.dataUrl } })
  }

  return content
}

async function generateH3(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ImageRef[],
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const headers = baseHeaders(provider)

  const body = {
    model: model.remoteModel,
    content: contentFromRefs(prompt, refs),
    duration: Number(params.duration ?? 6),
    resolution: String(params.resolution ?? '768P'),
    ratio: String(params.ratio ?? '16:9')
  }

  ctx.onProgress(5, '提交视频任务')

  const submit = await httpFetch(`${baseUrl}/v2/video_generation`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!submit.ok) {
    const text = await submit.text().catch(() => '')
    throw new Error(`HTTP ${submit.status}: ${text.slice(0, 400)}`)
  }

  const created = (await submit.json()) as MiniMaxTask
  const taskId = created.task_id ?? created.task?.id
  if (!taskId) throw new Error('接口没有返回 task_id')

  ctx.onProgress(10, '任务已创建，等待生成')

  for (let attempt = 0; attempt < 180; attempt += 1) {
    await sleep(3000, ctx.signal)

    const response = await httpFetch(
      `${baseUrl}/v2/query/video_generation/${encodeURIComponent(taskId)}`,
      { headers, signal: ctx.signal }
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`查询任务失败 HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    const task = (await response.json()) as MiniMaxTask
    const status = task.task?.status ?? task.status ?? ''

    if (status === 'failed' || status === 'Failed') {
      throw new Error(
        task.task?.error?.message ?? task.base_resp?.status_msg ?? '视频任务失败'
      )
    }

    if (status === 'succeeded' || status === 'Success') {
      const url = task.task?.content?.url
      if (!url) throw new Error('任务成功但没有返回视频地址')
      return downloadVideo(url, ctx)
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 70), 80)
    ctx.onProgress(percent, `生成中（${status || 'processing'}）`)
  }

  throw new Error('视频任务超时')
}

async function generateLegacy(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ImageRef[],
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const headers = baseHeaders(provider)
  const first = refs.find((ref) => ref.role === 'firstFrame')
  const last = refs.find((ref) => ref.role === 'lastFrame')

  const body: Record<string, unknown> = {
    model: model.remoteModel,
    prompt,
    duration: Number(params.duration ?? 6),
    resolution: String(params.resolution ?? '768P')
  }
  if (first) body.first_frame_image = first.dataUrl
  if (last) body.last_frame_image = last.dataUrl

  ctx.onProgress(5, '提交视频任务')

  const submit = await httpFetch(`${baseUrl}/v1/video_generation`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: ctx.signal
  })

  if (!submit.ok) {
    const text = await submit.text().catch(() => '')
    throw new Error(`HTTP ${submit.status}: ${text.slice(0, 400)}`)
  }

  const created = (await submit.json()) as MiniMaxTask
  if (created.base_resp?.status_code && created.base_resp.status_code !== 0) {
    throw new Error(created.base_resp.status_msg ?? '提交任务失败')
  }

  const taskId = created.task_id
  if (!taskId) throw new Error('接口没有返回 task_id')

  ctx.onProgress(10, '任务已创建，等待生成')

  let fileId: string | undefined

  for (let attempt = 0; attempt < 180; attempt += 1) {
    await sleep(3000, ctx.signal)

    const response = await httpFetch(
      `${baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
      { headers, signal: ctx.signal }
    )

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`查询任务失败 HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    const task = (await response.json()) as MiniMaxTask
    const status = task.status ?? ''

    if (status === 'Fail' || status === 'failed') {
      throw new Error(task.base_resp?.status_msg ?? '视频任务失败')
    }

    if (status === 'Success' || status === 'succeeded') {
      fileId = task.file_id
      break
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 70), 80)
    ctx.onProgress(percent, `生成中（${status || 'processing'}）`)
  }

  if (!fileId) throw new Error('视频任务超时')

  ctx.onProgress(90, '获取视频文件')

  const fileResponse = await httpFetch(
    `${baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
    { headers, signal: ctx.signal }
  )

  if (!fileResponse.ok) {
    const text = await fileResponse.text().catch(() => '')
    throw new Error(`获取文件失败 HTTP ${fileResponse.status}: ${text.slice(0, 200)}`)
  }

  const file = (await fileResponse.json()) as MiniMaxTask
  const url = file.file?.download_url ?? file.file?.backup_download_url
  if (!url) throw new Error('文件接口没有返回下载地址')

  return downloadVideo(url, ctx)
}

export async function generateVideoMinimax(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ImageRef[],
  ctx: AdapterContext,
  legacy: boolean
): Promise<ProviderOutput[]> {
  return legacy
    ? generateLegacy(model, provider, prompt, params, refs, ctx)
    : generateH3(model, provider, prompt, params, refs, ctx)
}
