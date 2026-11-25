import type { GeneratedAsset } from './generation'

export interface AspectRatioValue {
  width: number
  height: number
  value: number
}

/**
 * 解析宽高比，支持 16:9、4/5、2.35:1、4x5 等写法。
 * 比例限制在 1:20 到 20:1，避免裁切出无法正常编码的极端画面。
 */
export function parseAspectRatio(input: string): AspectRatioValue | null {
  const match =
    /^\s*(\d+(?:\.\d+)?)\s*[:/xX×*]\s*(\d+(?:\.\d+)?)\s*$/.exec(input)
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }

  const value = width / height
  if (value < 0.05 || value > 20) return null
  return { width, height, value }
}

export interface CenterCropRect {
  x: number
  y: number
  width: number
  height: number
}

/** 按目标比例计算居中裁切区域，宽高向下取偶以适配 H.264。 */
export function centerCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: number
): CenterCropRect {
  let width: number
  let height: number

  if (sourceWidth / sourceHeight > targetRatio) {
    height = sourceHeight
    width = Math.round(sourceHeight * targetRatio)
  } else {
    width = sourceWidth
    height = Math.round(sourceWidth / targetRatio)
  }

  width = Math.max(2, Math.floor(width / 2) * 2)
  height = Math.max(2, Math.floor(height / 2) * 2)

  return {
    x: Math.max(0, Math.floor((sourceWidth - width) / 2)),
    y: Math.max(0, Math.floor((sourceHeight - height) / 2)),
    width,
    height
  }
}

export interface AudioPeaksRequest {
  path: string
  scope?: 'project' | 'global'
  buckets?: number
}

export interface GridSplitRequest {
  path: string
  rows: number
  cols: number
}

export interface GridSplitResult {
  assets: GeneratedAsset[]
}

export interface StitchRequest {
  paths: string[]
  cols: number
  rows: number
  ratio: '16:9' | '9:16' | '1:1' | '4:3'
  outputWidth?: number
}

export interface StitchResult {
  asset: GeneratedAsset
}

export type FrameMode = 'first' | 'last' | 'current'

export interface ExtractFrameRequest {
  path: string
  mode: FrameMode
  time?: number
}

export interface ExtractFrameResult {
  asset: GeneratedAsset
  duration: number
  time: number
}

export type StemMode = 'vocal' | 'background'

export type SplitAvMode = 'av' | StemMode

export interface SplitAvRequest {
  path: string
}

export interface SplitAvResult {
  video: GeneratedAsset
  audio: GeneratedAsset | null
}

export interface StemTaskRequest {
  path: string
  mode: StemMode
  /** 源节点类型；音频节点即使内嵌封面也不生成无声视频 */
  sourceKind?: 'video' | 'audio'
  /** 仅用于完成通知和占位节点标题 */
  title?: string
}

export interface StemTaskResult {
  video: GeneratedAsset | null
  audio: GeneratedAsset
}

export type StemTaskStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled'

export interface StemTaskEvent {
  taskId: string
  status: StemTaskStatus
  percent?: number
  message?: string
  queuePosition?: number
  result?: StemTaskResult
  error?: string
}

export interface StemTaskStartResult {
  taskId: string
  queuePosition: number
}

export interface CropVideoRequest {
  path: string
  ratio: string
}

export interface CropVideoResult {
  asset: GeneratedAsset
}

export interface AudioTrimRequest {
  path: string
  scope?: 'project' | 'global'
  start: number
  end: number
}

export interface AudioTrimResult {
  asset: GeneratedAsset
}

export interface AudioSpeedRequest {
  path: string
  scope?: 'project' | 'global'
  rate: number
}

export interface AudioSpeedResult {
  asset: GeneratedAsset
}

export interface MediaProbe {
  width?: number
  height?: number
  duration?: number
  fps?: number
  hasAudio: boolean
  videoCodec?: string
  pixFmt?: string
  audioCodec?: string
  audioSampleRate?: number
  audioChannels?: number
}

export interface SubtitleRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropImageRequest {
  path: string
  ratio: string
}

export interface CropImageResult {
  asset: GeneratedAsset
}

export interface CropImageRectRequest {
  path: string
  x: number
  y: number
  width: number
  height: number
}

export interface RemoveSubtitlesRequest {
  path: string
  x: number
  y: number
  width: number
  height: number
}

export interface RemoveSubtitlesResult {
  asset: GeneratedAsset
}

export interface TrimVideoRequest {
  path: string
  start: number
  end: number
}

export interface TrimVideoResult {
  asset: GeneratedAsset
}


export interface DepthCaptureRequest {
  path: string
  quality?: 'fast' | 'standard' | 'long'
  fps?: number
}

export interface DepthCaptureResult {
  asset: GeneratedAsset
  width: number
  height: number
  duration: number
  frames: number
}

export type DepthTaskStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled'

export interface DepthTaskEvent {
  taskId: string
  status: DepthTaskStatus
  percent?: number
  message?: string
  result?: DepthCaptureResult
  error?: string
}

export interface DepthTaskStartResult {
  taskId: string
}

export type VisionTaskKind =
  | 'matte-image'
  | 'layer-split'
  | 'inpaint-image'
  | 'matte-video'
  | 'repair-video'

export interface VisionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface VisionTaskRequest {
  kind: VisionTaskKind
  path: string
  scope?: 'project' | 'global'
  /** inpaint-image 使用，PNG data URL，透明区域表示需要修复 */
  mask?: string
  /** repair-video / matte-image / layer-split 使用，坐标基于原图像素 */
  rect?: VisionRect
}

export type VisionTaskStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled'

export interface VisionTaskResult {
  kind: VisionTaskKind
  asset?: GeneratedAsset
  background?: GeneratedAsset
  width?: number
  height?: number
  frames?: number
}

export interface VisionTaskEvent {
  taskId: string
  status: VisionTaskStatus
  percent?: number
  message?: string
  result?: VisionTaskResult
  error?: string
}

export interface VisionTaskStartResult {
  taskId: string
}
