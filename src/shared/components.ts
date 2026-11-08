export type ComponentKind =
  | 'depth-runtime'
  | 'depth-model'
  | 'vision-models'
  | 'whisper-runtime'
  | 'whisper-model'

export type ComponentState =
  | 'not-installed'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'installed'
  | 'paused'
  | 'error'

export interface ComponentManifest {
  version: number
  kind: ComponentKind
  platform: string
  size: number
  expandedSize: number
  sha256: string
  urls: string[]
  files: number
}

export interface ComponentStatus {
  kind: ComponentKind
  label: string
  state: ComponentState
  version?: number
  installedSize?: number
  receivedBytes?: number
  totalBytes?: number
  percent?: number
  message?: string
  error?: string
  path?: string
}

export interface ComponentEvent {
  kind: ComponentKind
  state: ComponentState
  percent?: number
  receivedBytes?: number
  totalBytes?: number
  message?: string
  error?: string
}

export interface ComponentInstallResult {
  kind: ComponentKind
  path: string
}
