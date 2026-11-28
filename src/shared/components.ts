// 组件内部 kind 是持久化契约；depth-runtime 的实际职责已扩展为通用本地 AI 运行时，
// 为兼容已安装用户保留原名称，只在设置页显示为新名称。
export type ComponentKind =
  | 'depth-runtime'
  | 'depth-model'
  | 'vision-models'
  | 'whisper-runtime'
  | 'whisper-model'
  | 'stem-model'

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

export interface ComponentUpdateInfo {
  kind: ComponentKind
  latestVersion?: number
  latestSize?: number
  updateAvailable: boolean
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
