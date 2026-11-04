export type OutputKind = 'image' | 'video' | 'audio' | 'text'

export interface GeneratedAsset {
  id: string
  path: string
  kind: OutputKind
  createdAt: string
  model: string
  width?: number
  height?: number
}

export interface GenerateRequest {
  nodeId: string
  modelKey: string
  prompt: string
  params: Record<string, unknown>
  negativePrompt?: string
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
