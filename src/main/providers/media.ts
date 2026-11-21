/**
 * 主进程统一的参考媒体载荷。
 *
 * 适配器只从这里取 data URL、纯 base64 和 MIME，不再各自切前缀或猜测格式。
 */
export interface LoadedRef {
  /** 完整 data URL，适合需要 URL 或 data URI 的字段 */
  dataUrl: string
  /** 去掉 data URL 前缀的纯 base64，适合 Kling / Agnes keyframe 等字段 */
  base64: string
  /** 小写 MIME；image/jpg 归一化为 image/jpeg */
  mime: string
  role: string
  media: 'image' | 'audio'
}

export interface LoadedRefInput {
  dataUrl: string
  mime: string
  role: string
  media: 'image' | 'audio'
}

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg'
}

export function normalizeMime(mime: string): string {
  const lower = mime.trim().toLowerCase()
  return MIME_ALIASES[lower] ?? lower
}

/** 从 data URL 取纯 base64；非 data URL（公网地址等）原样返回 */
export function dataUrlToBase64(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

export function toLoadedRef(input: LoadedRefInput): LoadedRef {
  return {
    dataUrl: input.dataUrl,
    base64: dataUrlToBase64(input.dataUrl),
    mime: normalizeMime(input.mime),
    role: input.role,
    media: input.media
  }
}
