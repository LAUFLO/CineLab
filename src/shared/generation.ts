import type { AssetScope } from './asset-schema'

export type OutputKind = 'image' | 'video' | 'audio' | 'text'

export type ReferenceRole = 'firstFrame' | 'lastFrame' | 'reference'

export interface ReferenceInput {
  path: string
  role: ReferenceRole
  /** 省略时按项目内相对路径解析 */
  scope?: AssetScope
}

export interface GeneratedAsset {
  id: string
  path: string
  kind: OutputKind
  createdAt: string
  model: string
  width?: number
  height?: number
  duration?: number
  fps?: number
  hasAudio?: boolean
  text?: string
}

export interface GenerateRequest {
  nodeId: string
  modelKey: string
  prompt: string
  params: Record<string, unknown>
  negativePrompt?: string
  refs?: ReferenceInput[]
}

export type GenerationEvent =
  | { type: 'queued'; nodeId: string; runId: string }
  | {
      type: 'progress'
      nodeId: string
      runId: string
      percent: number
      message?: string
    }
  | { type: 'done'; nodeId: string; runId: string; assets: GeneratedAsset[] }
  | { type: 'error'; nodeId: string; runId: string; message: string }
  | { type: 'cancelled'; nodeId: string; runId: string }

export interface GenerateHandle {
  runId: string
}
