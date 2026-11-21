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
  /** 条件字段：按模式、参数或参考素材设置/删除顶层字段 */
  conditional?: HttpTemplateConditionalField[]
}

export interface HttpTemplateCondition {
  mode?: HttpTemplateMode
  /** 参数键值必须全部相等 */
  params?: Record<string, unknown>
  /** 每个值可以是 role（firstFrame 等）或 media（audio/image/video） */
  refs?: string[]
}

export interface HttpTemplateConditionalField {
  when: HttpTemplateCondition
  set?: Record<string, unknown>
  remove?: string[]
}

export interface HttpTemplatePoll {
  method?: string
  path: string
  headers?: Record<string, string>
  taskIdPath: string
  statusPath?: string
  successValues?: string[]
  failValues?: string[]
  /** 自定义状态映射；优先于 successValues / failValues */
  statusMap?: Record<string, 'success' | 'fail' | 'pending'>
  /** 失败时优先读取的错误码/错误消息路径 */
  errorPath?: string
  errorMessagePath?: string
  resultPath: string
  /** 多结果路径；存在时返回多个输出 */
  resultPaths?: string[]
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
