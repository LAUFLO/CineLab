export type UpdateState =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

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
  canCheck: boolean
}

export interface UpdateApi {
  getState(): Promise<UpdateStatus>
  check(): Promise<UpdateStatus>
  download(): Promise<UpdateStatus>
  install(): Promise<void>
  onEvent(callback: (status: UpdateStatus) => void): () => void
}
