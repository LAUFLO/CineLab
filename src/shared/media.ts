import type { GeneratedAsset } from './generation'

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

export interface MediaProbe {
  width?: number
  height?: number
  duration?: number
  fps?: number
  hasAudio: boolean
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
