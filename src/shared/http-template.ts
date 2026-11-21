export type HttpTemplateMode = 'text' | 'image' | 'keyframe' | 'reference' | 'video'

export interface HttpTemplateAuth {
  header?: string
  prefix?: string
  headers?: Record<string, string>
}

export interface HttpTemplateSubmit {
  method?: string
  path: string | Partial<Record<HttpTemplateMode, string>>
  headers?: Record<string, string>
  /** json（默认）或 multipart；multipart 时 body 中的 data URL 会自动转成文件 */
  contentType?: 'json' | 'multipart'
  body?: unknown
  bodyByMode?: Partial<Record<HttpTemplateMode, unknown>>
  omitEmpty?: boolean
}

export interface HttpTemplatePoll {
  method?: string
  path: string
  headers?: Record<string, string>
  taskIdPath: string
  statusPath?: string
  successValues?: string[]
  failValues?: string[]
  resultPath: string
  intervalMs?: number
  maxAttempts?: number
  download?: boolean
}

export interface HttpTemplate {
  auth?: HttpTemplateAuth
  submit: HttpTemplateSubmit
  poll: HttpTemplatePoll
  mode?: HttpTemplateMode
  /** 同步接口：提交响应直接包含结果，不走轮询 */
  sync?: boolean
  /** 接口返回完整视频（full）还是新增片段（segment），默认 full */
  videoResult?: 'full' | 'segment'
}

const LEGACY_KEYFRAME_VARIABLE =
  /\{\{\s*refs\.(?:firstFrame|lastFrame)\s*\}\}/

export const LEGACY_KEYFRAME_VARIABLE_WARNING =
  '变量含义已变：{{refs.firstFrame}} / {{refs.lastFrame}} 现在是纯 base64；需要 data URL 请改用 {{refs.firstFrameDataUrl}} / {{refs.lastFrameDataUrl}}。'

/** 检测模板或 extraBody 里是否还在使用旧的首尾帧变量语义 */
export function hasLegacyKeyframeVariables(text: string): boolean {
  return LEGACY_KEYFRAME_VARIABLE.test(text)
}
