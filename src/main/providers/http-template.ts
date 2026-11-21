import { createHmac } from 'node:crypto'
import { httpFetch } from './http'
import type {
  HttpTemplate,
  HttpTemplateCondition,
  HttpTemplateConditionalField,
  HttpTemplateMode,
  HttpTemplateMultipart,
  HttpTemplatePoll
} from '@shared/http-template'
import type { ModelDef } from '@shared/provider-schema'
import type { VideoOperationOptions } from '@shared/generation'
import type {
  AdapterContext,
  ProviderOutput,
  ProviderRuntime
} from './openai-compat'
import { sleep } from './retry'
import { mergeHeaders } from './headers'
import { replaceTemplateVariables } from '@shared/template-vars'
import { dataUrlToBase64 } from './media'

export interface ImageRef {
  dataUrl: string
  role: string
  /** 统一载荷中的纯 base64；省略时从 dataUrl 兼容提取 */
  base64?: string
  /** 统一载荷中的 MIME */
  mime?: string
  /** 省略时按图片处理，兼容旧调用 */
  media?: 'image' | 'audio'
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
  provider: ProviderRuntime
  video?: VideoRef
  videoOptions?: VideoOperationOptions
  mode: HttpTemplateMode
  baseUrl: string
  taskId?: string
  /** PNG data URL，透明区域表示需要编辑 */
  mask?: string
  /** $map 当前项 */
  item?: ImageRef
  /** 签名上下文 */
  method?: string
  path?: string
  timestamp?: string
  bodyText?: string
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

function frameRef(
  role: 'firstFrame' | 'lastFrame',
  refs: ImageRef[]
): ImageRef | undefined {
  return refs.find((ref) => ref.role === role)
}

function refBase64(ref: ImageRef | undefined): string | undefined {
  if (!ref) return undefined
  return ref.base64 ?? dataUrlToBase64(ref.dataUrl)
}

function refValue(key: string, refs: ImageRef[]): unknown {
  if (key === 'refs.firstFrame') {
    return refBase64(frameRef('firstFrame', refs))
  }
  if (key === 'refs.firstFrameDataUrl') {
    return frameRef('firstFrame', refs)?.dataUrl
  }
  if (key === 'refs.firstFrameMime') {
    return frameRef('firstFrame', refs)?.mime
  }
  if (key === 'refs.lastFrame') {
    return refBase64(frameRef('lastFrame', refs))
  }
  if (key === 'refs.lastFrameDataUrl') {
    return frameRef('lastFrame', refs)?.dataUrl
  }
  if (key === 'refs.lastFrameMime') {
    return frameRef('lastFrame', refs)?.mime
  }
  if (key === 'refs.frames') {
    return refs
      .filter(
        (ref) =>
          ref.media !== 'audio' &&
          (ref.role === 'firstFrame' || ref.role === 'lastFrame')
      )
      .map((ref) => ref.dataUrl)
  }
  if (key === 'refs.subject') {
    return refs.find((ref) => ref.role === 'subject')?.dataUrl
  }
  if (key === 'refs.subjects') {
    return refs
      .filter((ref) => ref.role === 'subject')
      .map((ref) => ref.dataUrl)
  }
  if (key === 'refs.style') {
    return refs.find((ref) => ref.role === 'style')?.dataUrl
  }
  if (key === 'refs.styles') {
    return refs.filter((ref) => ref.role === 'style').map((ref) => ref.dataUrl)
  }
  if (key === 'refs.images') {
    const references = refs.filter(
      (ref) =>
        ref.media !== 'audio' &&
        (ref.role === 'reference' ||
          ref.role === 'subject' ||
          ref.role === 'style' ||
          ref.role === 'source')
    )
    return (references.length > 0
      ? references
      : refs.filter(
          (ref) => ref.media !== 'audio' && ref.role !== 'mask'
        )
    ).map((ref) => ref.dataUrl)
  }
  if (key === 'refs.audio') {
    return refs.find((ref) => ref.media === 'audio')?.dataUrl
  }
  if (key === 'refs.audios') {
    return refs
      .filter((ref) => ref.media === 'audio')
      .map((ref) => ref.dataUrl)
  }
  return undefined
}

/** 供测试与模板调试使用：解析 refs.* 变量的当前语义 */
export function resolveTemplateRef(
  key: string,
  refs: ImageRef[]
): unknown {
  return refValue(key, refs)
}

function tokenValue(token: string, context: TemplateContext): unknown {
  if (token === 'prompt') return context.prompt
  if (token === 'model') return context.model.remoteModel
  if (token === 'mode') return context.mode
  if (token === 'taskId') return context.taskId
  if (token === 'baseUrl') return context.baseUrl
  if (token === 'method') return context.method
  if (token === 'path') return context.path
  if (token === 'timestamp') return context.timestamp
  if (token === 'body') return context.bodyText
  if (token === 'provider.baseUrl') return context.provider.baseUrl
  if (token === 'provider.apiKey') return context.provider.apiKey
  if (token === 'provider.secretKey') return context.provider.secretKey
  if (token.startsWith('item.')) {
    const key = token.slice('item.'.length) as keyof ImageRef
    return context.item ? context.item[key] : undefined
  }
  if (token === 'video.dataUrl') return context.video?.dataUrl
  if (token === 'video.mime') return context.video?.mime
  if (token === 'video.base64') {
    return context.video?.dataUrl.replace(/^data:[^;]+;base64,/, '')
  }
  if (token === 'video.start') return context.videoOptions?.range?.start
  if (token === 'video.end') return context.videoOptions?.range?.end
  if (token === 'video.duration') return context.videoOptions?.duration
  if (token === 'video.direction') return context.videoOptions?.direction
  if (token === 'video.operation') return context.videoOptions?.operation
  if (token === 'refs.mask') return context.mask
  if (token.startsWith('params.')) {
    return context.params[token.slice('params.'.length)]
  }
  if (token.startsWith('refs.')) {
    return refValue(token, context.refs)
  }
  return undefined
}

interface MapValue {
  $map: string
  $as: unknown
}

function isMapValue(value: unknown): value is MapValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.$map === 'string' && record.$as !== undefined
}

function refObjectsFor(path: string, refs: ImageRef[]): ImageRef[] {
  if (path === 'refs.frames') {
    return refs.filter(
      (ref) =>
        ref.media !== 'audio' &&
        (ref.role === 'firstFrame' || ref.role === 'lastFrame')
    )
  }
  if (path === 'refs.audios') return refs.filter((ref) => ref.media === 'audio')
  if (path === 'refs.subjects') {
    return refs.filter((ref) => ref.role === 'subject')
  }
  if (path === 'refs.styles') {
    return refs.filter((ref) => ref.role === 'style')
  }
  if (path === 'refs.images') {
    const references = refs.filter(
      (ref) =>
        ref.media !== 'audio' &&
        (ref.role === 'reference' ||
          ref.role === 'subject' ||
          ref.role === 'style' ||
          ref.role === 'source')
    )
    return references.length > 0
      ? references
      : refs.filter((ref) => ref.media !== 'audio' && ref.role !== 'mask')
  }
  return refs
}

function resolveMapValue(
  value: MapValue,
  context: TemplateContext
): unknown {
  return refObjectsFor(value.$map, context.refs).map((item) =>
    resolveTemplateValue(value.$as, { ...context, item })
  )
}

function resolveTemplateValue(
  value: unknown,
  context: TemplateContext
): unknown {
  if (isMapValue(value)) return resolveMapValue(value, context)
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, context))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveTemplateValue(item, context)
      ])
    )
  }
  return replaceTemplateVariables(value, (token) => tokenValue(token, context))
}

function matchesCondition(
  condition: HttpTemplateCondition,
  context: TemplateContext
): boolean {
  if (condition.mode && condition.mode !== context.mode) return false

  for (const [key, value] of Object.entries(condition.params ?? {})) {
    if (context.params[key] !== value) return false
  }

  for (const ref of condition.refs ?? []) {
    if (ref === 'video') {
      if (!context.video) return false
      continue
    }
    if (
      !context.refs.some(
        (item) => item.role === ref || item.media === ref
      )
    ) {
      return false
    }
  }

  return true
}

function applyConditionalFields(
  body: unknown,
  rules: HttpTemplateConditionalField[] | undefined,
  context: TemplateContext
): unknown {
  if (!rules || rules.length === 0) return body

  let next = body
  for (const rule of rules) {
    if (!matchesCondition(rule.when, context)) continue

    if (next === undefined) next = {}
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      if (rule.set || (rule.remove && rule.remove.length > 0)) {
        throw new Error('conditional 需要对象类型的请求体')
      }
      continue
    }

    const target = next as Record<string, unknown>
    for (const key of rule.remove ?? []) delete target[key]

    if (rule.set) {
      const resolved = resolveTemplateValue(rule.set, context)
      if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
        Object.assign(target, resolved)
      }
    }
  }

  return next
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
      const current = await httpFetch(value, { signal: ctx.signal })
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

function textOutputs(value: unknown): ProviderOutput[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => textOutputs(item))
  }
  if (typeof value === 'string') {
    return [{ data: Buffer.alloc(0), mime: 'video/mp4', text: value }]
  }
  return []
}

async function downloadOutputs(
  value: unknown,
  ctx: AdapterContext
): Promise<ProviderOutput[]> {
  if (Array.isArray(value)) {
    const outputs: ProviderOutput[] = []
    for (const item of value) {
      outputs.push(...(await downloadOutputs(item, ctx)))
    }
    return outputs
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const candidate =
      record.url ?? record.video_url ?? record.b64_json ?? record.base64
    if (typeof candidate === 'string') {
      return downloadOutputs(candidate, ctx)
    }
  }

  return downloadOutput(value, ctx)
}

function resultValues(
  polled: unknown,
  poll: HttpTemplatePoll
): unknown[] {
  if (poll.resultPaths && poll.resultPaths.length > 0) {
    return poll.resultPaths.map((path) => getPath(polled, path))
  }
  return [getPath(polled, poll.resultPath)]
}

function pollError(
  polled: unknown,
  poll: HttpTemplatePoll,
  status: string
): string {
  const message = poll.errorMessagePath
    ? getPath(polled, poll.errorMessagePath)
    : undefined
  const code = poll.errorPath ? getPath(polled, poll.errorPath) : undefined
  const fallback = getPath(polled, 'error.message')
  const value = message ?? code ?? fallback
  return value === undefined || value === null || value === ''
    ? `任务失败：${status}`
    : String(value)
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

interface FileCounter {
  index: number
}

function appendMultipartFormValue(
  form: FormData,
  key: string,
  value: unknown,
  counter: FileCounter
): void {
  if (value === undefined || value === null || value === '') return

  if (typeof value === 'string' && value.startsWith('data:')) {
    const parsed = parseDataUrl(value, counter.index)
    counter.index += 1
    if (parsed) form.append(key, parsed.blob, parsed.filename)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendMultipartFormValue(form, key, item, counter)
    }
    return
  }

  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      appendMultipartFormValue(
        form,
        key ? `${key}[${childKey}]` : childKey,
        childValue,
        counter
      )
    }
    return
  }

  form.append(key, String(value))
}

function buildMultipart(body: unknown): FormData {
  const form = new FormData()
  const counter = { index: 0 }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      appendMultipartFormValue(form, key, value, counter)
    }
  } else {
    appendMultipartFormValue(form, 'body', body, counter)
  }

  return form
}

function buildExplicitMultipart(
  spec: HttpTemplateMultipart,
  context: TemplateContext
): FormData {
  const form = new FormData()
  const counter = { index: 0 }

  const fields = resolveTemplateValue(spec.fields ?? {}, context)
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    for (const [key, value] of Object.entries(fields)) {
      appendMultipartFormValue(form, key, value, counter)
    }
  }

  for (const file of spec.files ?? []) {
    const source = String(resolveTemplateValue(file.source, context) ?? '')
    if (!source) continue
    const parsed = parseDataUrl(source, counter.index)
    counter.index += 1
    if (parsed) {
      form.append(file.field, parsed.blob, file.filename ?? parsed.filename)
    }
  }

  return form
}

function signHeaders(
  template: HttpTemplate,
  context: TemplateContext,
  bodyText: string
): Record<string, string> {
  const sign = template.auth?.sign
  if (!sign) return {}
  if (sign.type !== 'hmac-sha256') {
    throw new Error(`不支持的签名类型：${sign.type}`)
  }

  const timestamp = String(Math.floor(Date.now() / 1000))
  const signingContext: TemplateContext = { ...context, timestamp, bodyText }
  const secret = String(resolveTemplateValue(sign.secret, signingContext) ?? '')
  if (!secret) throw new Error('签名密钥为空')

  const payload = String(
    resolveTemplateValue(sign.payload, signingContext) ?? ''
  )
  const digest = createHmac('sha256', secret)
    .update(payload)
    .digest(sign.encoding === 'base64' ? 'base64' : 'hex')

  return {
    [sign.header]: digest,
    ...(sign.timestampHeader ? { [sign.timestampHeader]: timestamp } : {})
  }
}

export async function generateVideoHttpTemplate(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: ImageRef[],
  video: VideoRef | undefined,
  videoOptions: VideoOperationOptions | undefined,
  ctx: AdapterContext,
  mask?: string
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
    provider,
    ...(video ? { video } : {}),
    ...(videoOptions ? { videoOptions } : {}),
    ...(mask ? { mask } : {}),
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
    : resolveTemplateValue(bodyTemplate, context)
  body = applyConditionalFields(body, template.submit.conditional, context)
  if (template.submit.omitEmpty) body = omitEmpty(body)

  const multipart =
    Boolean(template.submit.multipart) ||
    template.submit.contentType === 'multipart'
  const submitMethod = template.submit.method ?? 'POST'
  const bodyText = body === undefined ? '' : JSON.stringify(body)
  const signedHeaders = signHeaders(
    template,
    { ...context, method: submitMethod, path: submitPath },
    bodyText
  )

  const authHeader = template.auth?.header ?? 'Authorization'
  const baseHeaders: Record<string, string> = {
    ...(multipart ? {} : { 'Content-Type': 'application/json' }),
    ...(template.auth?.headers ?? {}),
    ...(template.submit.headers ?? {})
  }
  if (provider.apiKey) {
    baseHeaders[authHeader] = `${template.auth?.prefix ?? 'Bearer '}${provider.apiKey}`
  }
  Object.assign(baseHeaders, signedHeaders)
  const headers = mergeHeaders(baseHeaders, provider.headers)
  if (multipart) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-type') delete headers[key]
    }
  }

  ctx.onProgress(5, '提交任务')

  const submitBody: BodyInit | undefined = template.submit.multipart
    ? buildExplicitMultipart(template.submit.multipart, context)
    : body === undefined
      ? undefined
      : multipart
        ? buildMultipart(body)
        : JSON.stringify(body)

  const submit = await httpFetch(joinUrl(baseUrl, submitPath), {
    method: submitMethod,
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

  if (template.sync) {
    const values = (template.syncResultPath
      ? [getPath(submitted, template.syncResultPath)]
      : resultValues(submitted, template.poll)
    ).filter((value) => value !== undefined)
    if (values.length === 0) {
      throw new Error('接口没有返回结果地址')
    }
    if (template.poll.download === false) return textOutputs(values)
    return downloadOutputs(values, ctx)
  }

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
      const pollPath = String(resolveTemplateValue(template.poll.path, context))
      const pollHeaders = mergeHeaders(
        {
          ...headers,
          ...(template.poll.headers ?? {})
        },
        provider.headers
      )

      const response = await httpFetch(joinUrl(baseUrl, pollPath), {
        method: template.poll.method ?? 'GET',
        headers: pollHeaders,
        signal: ctx.signal
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`查询任务失败 HTTP ${response.status}: ${text.slice(0, 1000)}`)
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
    const mapped = status ? template.poll.statusMap?.[status] : undefined

    if (
      mapped === 'fail' ||
      (!template.poll.statusMap && status && failValues.includes(status))
    ) {
      throw new Error(pollError(polled, template.poll, status))
    }

    const values = resultValues(polled, template.poll).filter(
      (value) => value !== undefined
    )
    const done = template.poll.statusMap
      ? mapped === 'success'
      : template.poll.statusPath
        ? successValues.includes(status)
        : values.length > 0

    if (done && values.length > 0) {
      if (template.poll.download === false) return textOutputs(values)
      return downloadOutputs(values, ctx)
    }

    const percent = Math.min(10 + Math.round((attempt / 60) * 70), 80)
    ctx.onProgress(percent, `生成中（${status || 'processing'}）`)
  }

  throw new Error('视频任务超时')
}
