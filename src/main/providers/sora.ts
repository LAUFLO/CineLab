import { httpFetch } from './http'
import type { ModelDef } from '@shared/provider-schema'
import { mergeHeaders } from './headers'
import { sleep } from './retry'
import { applyModelRequestBody, applyModelRequestForm } from './model-body'
import type {
  AdapterContext,
  ProviderOutput,
  ProviderRuntime
} from './openai-compat'

interface ImageRef {
  dataUrl: string
  role: string
}

interface SoraTask {
  id?: string
  task_id?: string
  status?: string
  progress?: number
  video_url?: string
  error?: { message?: string } | string | null
  metadata?: {
    url?: string
    generation_status?: string
    error?: { message?: string } | string | null
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function taskIdOf(task: SoraTask): string | undefined {
  return task.id ?? task.task_id
}

function parseDataUrl(
  value: string,
  index: number
): { blob: Blob; filename: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value)
  if (!match) return null

  const mime = match[1]
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
  return {
    blob: new Blob([Buffer.from(match[2], 'base64')], { type: mime }),
    filename: `reference-${index}.${ext}`
  }
}

function errorMessage(task: SoraTask): string {
  if (typeof task.error === 'string') return task.error
  if (task.error?.message) return task.error.message
  if (typeof task.metadata?.error === 'string') return task.metadata.error
  if (task.metadata?.error?.message) return task.metadata.error.message
  return `任务状态：${task.status ?? 'unknown'}`
}

/**
 * OpenAI Sora 风格视频：提交任务 -> 轮询状态 -> 从 content 端点下载。
 * 不使用响应里的 video_url，因为它可能指向只认上游 Key 的域名；
 * 统一用 provider.baseUrl + /videos/{id}/content，保证走同一鉴权链。
 */
export async function generateVideoSora(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ImageRef[],
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
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
    prompt
  }

  if (params.duration !== undefined) {
    body.seconds = String(Number(params.duration))
  }

  applyModelRequestBody(body, model, { prompt, params, refs })

  ctx.onProgress(5, '提交视频任务')

  const submitPath = `${baseUrl}/videos`
  let submit: Response

  if (refs.length > 0) {
    // 官方 Sora 接口把参考图作为 multipart 文件接收
    const form = new FormData()
    form.append('model', model.remoteModel)
    form.append('prompt', prompt)
    if (body.seconds !== undefined) form.append('seconds', String(body.seconds))
    if (body.size !== undefined) form.append('size', String(body.size))

    const parsed = parseDataUrl(refs[0].dataUrl, 0)
    if (parsed) form.append('input_reference', parsed.blob, parsed.filename)
    applyModelRequestForm(form, model, { prompt, params, refs })

    const multipartHeaders = { ...headers }
    for (const key of Object.keys(multipartHeaders)) {
      if (key.toLowerCase() === 'content-type') delete multipartHeaders[key]
    }

    submit = await httpFetch(submitPath, {
      method: 'POST',
      headers: multipartHeaders,
      body: form,
      signal: ctx.signal
    })

    if (!submit.ok) {
      const status = submit.status
      const text = await submit.text().catch(() => '')
      const referenceError =
        (status === 400 || status === 415) &&
        /input_reference|content[-_ ]?type|multipart|reference/i.test(text)

      if (!referenceError) {
        throw new Error(`HTTP ${status}: ${text.slice(0, 400)}`)
      }

      if (!parsed) {
        throw new Error(`HTTP ${status}: ${text.slice(0, 400)}`)
      }

      // 部分中转只接受 JSON 里的 data URL，回退到 JSON 提交
      ctx.onProgress(8, '参考图表单不被支持，改用 JSON 提交')
      const fallback = {
        ...body,
        input_reference: refs[0].dataUrl
      }
      submit = await httpFetch(submitPath, {
        method: 'POST',
        headers,
        body: JSON.stringify(fallback),
        signal: ctx.signal
      })
    }
  } else {
    submit = await httpFetch(submitPath, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctx.signal
    })
  }

  if (!submit.ok) {
    const text = await submit.text().catch(() => '')
    throw new Error(`HTTP ${submit.status}: ${text.slice(0, 400)}`)
  }

  const created = (await submit.json()) as SoraTask
  const taskId = taskIdOf(created)
  if (!taskId) throw new Error('接口没有返回任务 ID')

  ctx.onProgress(10, '任务已创建，等待生成')

  const interval = 3000
  const maxAttempts = 200
  let consecutiveErrors = 0

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(interval, ctx.signal)

    let task: SoraTask

    try {
      const poll = await httpFetch(
        `${baseUrl}/videos/${encodeURIComponent(taskId)}`,
        { headers, signal: ctx.signal }
      )

      if (!poll.ok) {
        const text = await poll.text().catch(() => '')
        throw new Error(
          `查询任务失败 HTTP ${poll.status}: ${text.slice(0, 200)}`
        )
      }

      task = (await poll.json()) as SoraTask
      consecutiveErrors = 0
    } catch (error) {
      consecutiveErrors += 1
      if (consecutiveErrors >= 5) throw error
      ctx.onProgress(10, `查询失败，重试中（${consecutiveErrors}/5）`)
      continue
    }

    if (task.status === 'failed' || task.status === 'cancelled') {
      throw new Error(errorMessage(task))
    }

    if (task.status === 'completed') {
      ctx.onProgress(92, '下载视频')

      const download = await httpFetch(
        `${baseUrl}/videos/${encodeURIComponent(taskId)}/content`,
        { headers, signal: ctx.signal }
      )

      if (!download.ok) {
        throw new Error(`下载视频失败：HTTP ${download.status}`)
      }

      const mime =
        download.headers.get('content-type')?.split(';')[0] ?? 'video/mp4'
      return [{ data: Buffer.from(await download.arrayBuffer()), mime }]
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 80), 90)
    ctx.onProgress(percent, `生成中（${task.status ?? 'processing'}）`)
  }

  throw new Error('视频任务超时')
}
