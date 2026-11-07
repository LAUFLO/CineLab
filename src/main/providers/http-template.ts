import type { HttpTemplateMode } from '@shared/http-template'
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

interface VideoRef {
  dataUrl: string
  mime: string
}

interface TemplateContext {
  prompt: string
  model: ModelDef
  params: Record<string, unknown>
  refs: ImageRef[]
  video?: VideoRef
  mode: HttpTemplateMode
  baseUrl: string
  taskId?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`
}

function refsOfMode(refs: ImageRef[], video?: VideoRef): HttpTemplateMode {
  if (video) return 'video'
  if (refs.some((ref) => ref.role === 'firstFrame' || ref.role === 'lastFrame')) {
    return 'keyframe'
  }
  if (refs.some((ref) => ref.role === 'reference')) return 'reference'
  if (refs.length > 0) return 'image'
  return 'text'
}

function refValue(key: string, refs: ImageRef[]): unknown {
  if (key === 'refs.firstFrame') {
    return refs.find((ref) => ref.role === 'firstFrame')?.dataUrl
  }
  if (key === 'refs.lastFrame') {
    return refs.find((ref) => ref.role === 'lastFrame')?.dataUrl
  }
  if (key === 'refs.frames') {
    return refs
      .filter((ref) => ref.role === 'firstFrame' || ref.role === 'lastFrame')
      .map((ref) => ref.dataUrl)
  }
  if (key === 'refs.images') {
    const references = refs.filter((ref) => ref.role === 'reference')
    return (references.length > 0 ? references : refs).map((ref) => ref.dataUrl)
  }
  return undefined
}

function tokenValue(token: string, context: TemplateContext): unknown {
  if (token === 'prompt') return context.prompt
  if (token === 'model') return context.model.remoteModel
  if (token === 'mode') return context.mode
  if (token === 'taskId') return context.taskId
  if (token === 'baseUrl') return context.baseUrl
  if (token === 'video.dataUrl') return context.video?.dataUrl
  if (token === 'video.mime') return context.video?.mime
  if (token === 'video.base64') {
    return context.video?.dataUrl.replace(/^data:[^;]+;base64,/, '')
  }
  if (token.startsWith('params.')) {
    return context.params[token.slice('params.'.length)]
  }
  if (token.startsWith('refs.')) {
    return refValue(token, context.refs)
  }
  return undefined
}

function replaceValue(value: unknown, context: TemplateContext): unknown {
  if (typeof value === 'string') {
    const exact = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(value)
    if (exact) return tokenValue(exact[1], context)

    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token: string) => {
      const next = tokenValue(token, context)
      return next === undefined || next === null ? '' : String(next)
    })
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceValue(item, context))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceValue(item, context)
      ])
    )
  }

  return value
}

function omitEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => omitEmpty(item))
      .filter(
        (item) =>
          item !== undefined &&
          item !== null &&
          item !== '' &&
          !(Array.isArray(item) && item.length === 0)
      )
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const next = omitEmpty(item)
      if (next === undefined || next === null || next === '') continue
      if (Array.isArray(next) && next.length === 0) continue
      result[key] = next
    }
    return result
  }

  return value
}

function getPath(source: unknown, path: string): unknown {
  if (!path) return source

  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  let current = source
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      current = current[Number(part)]
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

async function downloadOutput(
  value: unknown,
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  if (typeof value !== 'string' || !value) {
    throw new Error('接口没有返回视频地址')
  }

  if (value.startsWith('data:')) {
    const mime = /^data:([^;]+)/.exec(value)?.[1] ?? 'video/mp4'
    const base64 = value.split(',')[1] ?? ''
    return [{ data: Buffer.from(base64, 'base64'), mime }]
  }

  ctx.onProgress(92, '下载视频')

  let response: Response | null = null
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      const current = await fetch(value, { signal: ctx.signal })
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

function parseDataUrl(
  value: string,
  index: number
): { blob: Blob; filename: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value)
  if (!match) return null

  const mime = match[1]
  const ext = mime.startsWith('video/')
    ? mime === 'video/webm'
      ? 'webm'
      : mime === 'video/quicktime'
        ? 'mov'
        : 'mp4'
    : mime === 'image/jpeg'
      ? 'jpg'
      : mime === 'image/webp'
        ? 'webp'
        : 'png'
  return {
    blob: new Blob([Buffer.from(match[2], 'base64')], { type: mime }),
    filename: `upload-${index}.${ext}`
  }
}

function buildMultipart(body: unknown): FormData {
  const form = new FormData()
  let fileIndex = 0

  const append = (key: string, value: unknown): void => {
    if (value === undefined || value === null || value === '') return

    if (typeof value === 'string' && value.startsWith('data:')) {
      const parsed = parseDataUrl(value, fileIndex)
      fileIndex += 1
      if (parsed) form.append(key, parsed.blob, parsed.filename)
      return
    }

    if (Array.isArray(value)) {
      for (const item of value) append(key, item)
      return
    }

    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(
        value as Record<string, unknown>
      )) {
        append(key ? `${key}[${childKey}]` : childKey, childValue)
      }
      return
    }

    form.append(key, String(value))
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      append(key, value)
    }
  } else {
    append('body', body)
  }

  return form
}

export async function generateVideoHttpTemplate(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ImageRef[],
  video: VideoRef | undefined,
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  const template = model.template
  if (!template) throw new Error('该模型没有配置 http-template')

  const baseUrl = normalizeBaseUrl(provider.baseUrl)
  const mode = template.mode ?? refsOfMode(refs, video)
  const context: TemplateContext = {
    prompt,
    model,
    params,
    refs,
    ...(video ? { video } : {}),
    mode,
    baseUrl
  }

  const submitPath = typeof template.submit.path === 'string'
    ? template.submit.path
    : template.submit.path[mode] ??
      template.submit.path.image ??
      template.submit.path.text

  if (!submitPath) {
    throw new Error(`http-template 没有配置 ${mode} 模式的提交路径`)
  }

  const bodyTemplate =
    template.submit.bodyByMode?.[mode] ?? template.submit.body
  let body = bodyTemplate === undefined
    ? undefined
    : replaceValue(bodyTemplate, context)
  if (template.submit.omitEmpty) body = omitEmpty(body)

  const multipart = template.submit.contentType === 'multipart'
  const authHeader = template.auth?.header ?? 'Authorization'
  const baseHeaders: Record<string, string> = {
    ...(multipart ? {} : { 'Content-Type': 'application/json' }),
    ...(template.auth?.headers ?? {}),
    ...(template.submit.headers ?? {})
  }
  if (provider.apiKey) {
    baseHeaders[authHeader] = `${template.auth?.prefix ?? 'Bearer '}${provider.apiKey}`
  }
  const headers = mergeHeaders(baseHeaders, provider.headers)
  if (multipart) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-type') delete headers[key]
    }
  }

  ctx.onProgress(5, '提交任务')

  const submitBody: BodyInit | undefined =
    body === undefined
      ? undefined
      : multipart
        ? buildMultipart(body)
        : JSON.stringify(body)

  const submit = await fetch(joinUrl(baseUrl, submitPath), {
    method: template.submit.method ?? 'POST',
    headers,
    ...(submitBody === undefined ? {} : { body: submitBody }),
    signal: ctx.signal
  })

  if (!submit.ok) {
    const text = await submit.text().catch(() => '')
    throw new Error(`HTTP ${submit.status}: ${text.slice(0, 400)}`)
  }

  const contentType = submit.headers.get('content-type') ?? ''
  if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
    return [
      {
        data: Buffer.from(await submit.arrayBuffer()),
        mime: contentType.split(';')[0]
      }
    ]
  }

  const submitted = (await submit.json()) as unknown
  const taskId = getPath(submitted, template.poll.taskIdPath)
  if (typeof taskId !== 'string' && typeof taskId !== 'number') {
    throw new Error('接口没有返回任务 ID')
  }

  context.taskId = String(taskId)
  ctx.onProgress(10, '任务已创建，等待生成')

  const interval = template.poll.intervalMs ?? 2000
  const maxAttempts = template.poll.maxAttempts ?? 180
  const successValues = template.poll.successValues ?? [
    'completed',
    'succeed',
    'success',
    'succeeded'
  ]
  const failValues = template.poll.failValues ?? ['failed', 'error', 'cancelled']
  let consecutiveErrors = 0

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(interval, ctx.signal)

    let polled: unknown

    try {
      const pollPath = String(replaceValue(template.poll.path, context))
      const pollHeaders = mergeHeaders(
        {
          ...headers,
          ...(template.poll.headers ?? {})
        },
        provider.headers
      )

      const response = await fetch(joinUrl(baseUrl, pollPath), {
        method: template.poll.method ?? 'GET',
        headers: pollHeaders,
        signal: ctx.signal
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`查询任务失败 HTTP ${response.status}: ${text.slice(0, 200)}`)
      }

      polled = await response.json()
      consecutiveErrors = 0
    } catch (error) {
      consecutiveErrors += 1
      if (consecutiveErrors >= 5) throw error
      ctx.onProgress(10, `查询失败，重试中（${consecutiveErrors}/5）`)
      continue
    }

    const status = template.poll.statusPath
      ? String(getPath(polled, template.poll.statusPath) ?? '')
      : ''

    if (status && failValues.includes(status)) {
      throw new Error(String(getPath(polled, 'error.message') ?? `任务失败：${status}`))
    }

    const result = getPath(polled, template.poll.resultPath)
    const done = template.poll.statusPath
      ? successValues.includes(status)
      : result !== undefined

    if (done && result !== undefined) {
      if (template.poll.download === false && typeof result === 'string') {
        return [{ data: Buffer.alloc(0), mime: 'video/mp4', text: result }]
      }
      return downloadOutput(result, ctx)
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 70), 80)
    ctx.onProgress(percent, `生成中（${status || 'processing'}）`)
  }

  throw new Error('视频任务超时')
}
