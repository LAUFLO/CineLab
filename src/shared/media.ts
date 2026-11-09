import type { GeneratedAsset } from './generation'

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

export interface SplitAvRequest {
  path: string
}

export interface SplitAvResult {
  video: GeneratedAsset
  audio: GeneratedAsset | null
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
  | 'outpaint-image'
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
  /** outpaint-image 使用 */
  ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9'
  /** repair-video 使用，坐标基于原视频像素 */
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
