import type { ModelDef } from '@shared/provider-schema'
import {
  createTemplateResolver,
  replaceTemplateVariables
} from '@shared/template-vars'

export interface ModelBodyRef {
  dataUrl: string
  role: string
  /** 省略时按图片处理，兼容旧调用 */
  media?: 'image' | 'audio'
}

export interface ModelBodyContext {
  prompt?: string
  params?: Record<string, unknown>
  refs?: ModelBodyRef[]
  /** PNG data URL，透明区域表示需要编辑 */
  mask?: string
}

function refValue(token: string, refs: ModelBodyRef[]): unknown {
  if (token === 'refs.firstFrame') {
    return refs.find((ref) => ref.role === 'firstFrame')?.dataUrl
  }
  if (token === 'refs.lastFrame') {
    return refs.find((ref) => ref.role === 'lastFrame')?.dataUrl
  }
  if (token === 'refs.frames') {
    return refs
      .filter(
        (ref) =>
          ref.media !== 'audio' &&
          (ref.role === 'firstFrame' || ref.role === 'lastFrame')
      )
      .map((ref) => ref.dataUrl)
  }
  if (token === 'refs.subject') {
    return refs.find((ref) => ref.role === 'subject')?.dataUrl
  }
  if (token === 'refs.subjects') {
    return refs
      .filter((ref) => ref.role === 'subject')
      .map((ref) => ref.dataUrl)
  }
  if (token === 'refs.style') {
    return refs.find((ref) => ref.role === 'style')?.dataUrl
  }
  if (token === 'refs.styles') {
    return refs
      .filter((ref) => ref.role === 'style')
      .map((ref) => ref.dataUrl)
  }
  if (token === 'refs.mask') {
    return refs.find((ref) => ref.role === 'mask')?.dataUrl
  }
  if (token === 'refs.image') {
    return refs.find(
      (ref) => ref.media !== 'audio' && ref.role !== 'mask'
    )?.dataUrl
  }
  if (token === 'refs.images') {
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
  if (token === 'refs.audio') {
    return refs.find((ref) => ref.media === 'audio')?.dataUrl
  }
  if (token === 'refs.audios') {
    return refs
      .filter((ref) => ref.media === 'audio')
      .map((ref) => ref.dataUrl)
  }
  return undefined
}

function resolverFor(model: ModelDef, context: ModelBodyContext) {
  const refs = context.refs ?? []
  const flat = createTemplateResolver({
    prompt: context.prompt,
    model: model.remoteModel,
    params: context.params ?? {},
    refs: {
      firstFrame: refValue('refs.firstFrame', refs),
      lastFrame: refValue('refs.lastFrame', refs),
      frames: refValue('refs.frames', refs),
      image: refValue('refs.image', refs),
      images: refValue('refs.images', refs),
      audio: refValue('refs.audio', refs),
      audios: refValue('refs.audios', refs),
      subject: refValue('refs.subject', refs),
      subjects: refValue('refs.subjects', refs),
      style: refValue('refs.style', refs),
      styles: refValue('refs.styles', refs),
      mask: context.mask ?? refValue('refs.mask', refs)
    }
  })

  return (token: string): unknown => {
    if (token.startsWith('refs.')) return refValue(token, refs)
    return flat(token)
  }
}

function resolveExtraBody(
  model: ModelDef,
  context: ModelBodyContext
): Record<string, unknown> | null {
  if (!model.extraBody || typeof model.extraBody !== 'object') return null

  const resolved = replaceTemplateVariables(
    model.extraBody,
    resolverFor(model, context)
  )

  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
    return null
  }
  return resolved as Record<string, unknown>
}

function omitKeys(model: ModelDef): string[] {
  return (model.omitBody ?? []).filter(
    (key): key is string => typeof key === 'string' && key.length > 0
  )
}

/**
 * 适配器构造完默认 JSON 请求体后调用：合并 extraBody，再删除 omitBody。
 * 返回同一个对象，方便链式使用。
 */
export function applyModelRequestBody<T extends Record<string, unknown>>(
  body: T,
  model: ModelDef,
  context: ModelBodyContext = {}
): T {
  const extra = resolveExtraBody(model, context)
  if (extra) {
    const target = body as Record<string, unknown>
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined) continue
      target[key] = value
    }
  }
  for (const key of omitKeys(model)) delete body[key]
  return body
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
    filename: `extra-${index}.${ext}`
  }
}

function appendFormValue(
  form: FormData,
  key: string,
  value: unknown,
  fileIndex: { value: number }
): void {
  if (value === undefined || value === null || value === '') return

  if (typeof value === 'string' && value.startsWith('data:')) {
    const parsed = parseDataUrl(value, fileIndex.value)
    fileIndex.value += 1
    if (parsed) form.append(key, parsed.blob, parsed.filename)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) appendFormValue(form, key, item, fileIndex)
    return
  }

  if (typeof value === 'object') {
    form.append(key, JSON.stringify(value))
    return
  }

  form.append(key, String(value))
}

/**
 * multipart 表单版本：extraBody 的原始字段直接追加为表单字段，
 * omitBody 从已有字段中删除（例如 Seedream 的 n）。
 */
export function applyModelRequestForm(
  form: FormData,
  model: ModelDef,
  context: ModelBodyContext = {}
): FormData {
  const extra = resolveExtraBody(model, context)
  if (extra) {
    const fileIndex = { value: 0 }
    for (const [key, value] of Object.entries(extra)) {
      appendFormValue(form, key, value, fileIndex)
    }
  }
  for (const key of omitKeys(model)) form.delete(key)
  return form
}
