export type UpdateState =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export type UpdateFallbackKind = 'releases-page' | 'installer'

export interface UpdateFallback {
  kind: UpdateFallbackKind
  url: string
  /** 镜像域名或 'github'，用于界面提示来源 */
  source: string
  /** installer 场景下的文件名 */
  fileName?: string
}

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  latestVersion?: string
  releaseNotes?: string
  releaseDate?: string
  percent?: number
  transferred?: number
  total?: number
  error?: string
  fallback?: UpdateFallback
  canCheck: boolean
}

export interface UpdateApi {
  getState(): Promise<UpdateStatus>
  check(): Promise<UpdateStatus>
  download(): Promise<UpdateStatus>
  install(): Promise<void>
  openFallback(): Promise<void>
  onEvent(callback: (status: UpdateStatus) => void): () => void
}
