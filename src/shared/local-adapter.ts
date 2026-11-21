export type LocalAdapterStatusKind = 'loading' | 'ready' | 'error'

export interface LocalAdapterStatus {
  id: string
  version: string
  type: 'config' | 'template' | 'code'
  dir: string
  status: LocalAdapterStatusKind
  error?: string
  modelCount: number
  models: Array<{ id: string; name: string }>
  updatedAt: string
}
