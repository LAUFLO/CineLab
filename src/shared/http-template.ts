export type HttpTemplateMode = 'text' | 'image' | 'keyframe' | 'reference'

export interface HttpTemplateAuth {
  header?: string
  prefix?: string
  headers?: Record<string, string>
}

export interface HttpTemplateSubmit {
  method?: string
  path: string | Partial<Record<HttpTemplateMode, string>>
  headers?: Record<string, string>
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
