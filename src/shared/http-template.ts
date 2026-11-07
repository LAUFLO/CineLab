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
}
