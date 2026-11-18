import type { AssetScope } from './asset-schema'

export type OutputKind = 'image' | 'video' | 'audio' | 'text'

export type ReferenceMedia = 'image' | 'video' | 'audio'

export type ReferenceRole =
  | 'firstFrame'
  | 'lastFrame'
  | 'reference'
  | 'mask'
  | 'subject'
  | 'style'
  | 'source'

export interface VideoRange {
  start: number
  end: number
}

export interface VideoOperationOptions {
  operation: 'shot-retake' | 'element-replace' | 'extend'
  /** 片段重拍 / 元素替换的时间区间 */
  range?: VideoRange
  /** 续写新增时长（秒） */
  duration?: number
  /** 续写方向 */
  direction?: 'forward' | 'backward'
}

export interface ReferenceInput {
  path: string
  role: ReferenceRole
  /** 省略时按项目内相对路径解析 */
  scope?: AssetScope
  /** 参考媒体类型；省略时主进程按扩展名推断，兼容旧数据和 Agent 请求 */
  media?: ReferenceMedia
}

/** Seedream 图层拆分返回的边界框，[left, top, right, bottom] */
export type LayerBounds = [number, number, number, number]

export interface LayerBox {
  absolute?: LayerBounds
  normalized?: LayerBounds
}

export interface AssetLayer {
  /** 底图固定为 0，图层从 1 开始递增 */
  zIndex: number
  name?: string
  description?: string
  boundingBox?: LayerBox
}

export interface TextRecognitionStyle {
  similarFontFamily?: string
  foregroundColor?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  shadow?: boolean
  translucent?: boolean
}

export interface TextRecognitionRun {
  text: string
  style?: TextRecognitionStyle
}

export interface TextRecognitionLine {
  boundingBox?: LayerBox
  runs: TextRecognitionRun[]
}

export interface TextRecognition {
  text: string
  lines?: TextRecognitionLine[]
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
  /** 生成来源操作，例如 panorama */
  op?: string
  /** 图层拆分结果中的图层信息 */
  layer?: AssetLayer
  /** 规整文字图层的富文本 OCR 结果 */
  textRecognition?: TextRecognition
}

export interface GenerateRequest {
  nodeId: string
  modelKey: string
  prompt: string
  params: Record<string, unknown>
  negativePrompt?: string
  refs?: ReferenceInput[]
  /** 专用视频接口输入；仅 http-template / 视频编辑适配器使用 */
  video?: ReferenceInput
  /** 视频专用操作的区间、时长和方向 */
  videoOptions?: VideoOperationOptions
  /** PNG data URL，透明区域表示需要编辑；仅图片模型使用 */
  mask?: string
  /** 操作标识，随生成结果写回 OutputRef.op */
  op?: string
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
  | {
      type: 'error'
      nodeId: string
      runId: string
      message: string
      retryable?: boolean
    }
  | { type: 'cancelled'; nodeId: string; runId: string }

export interface GenerateHandle {
  runId: string
}
