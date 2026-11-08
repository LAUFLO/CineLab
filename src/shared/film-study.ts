import type { AssetScope } from './asset-schema'

export interface FilmStudyFrame {
  index: number
  time: number
  /** 相对项目根的图片路径 */
  file: string
  note?: string
}

export interface FilmStudySegment {
  id: string
  startTime: number
  endTime: number
  title: string
  type: string
  segmentFunction?: string
  keyBeats?: string
  creativeIntent?: string
  techniques?: string
  audienceExperience?: string
  notes?: string
}

export interface FilmStudySummary {
  studyId: string
  frameCount: number
  segmentCount: number
  interval: number
  duration: number
  fps: number
}

export interface FilmStudy {
  schemaVersion: 1
  id: string
  sourceNodeId: string
  sourcePath: string
  sourceScope?: AssetScope
  sourceName: string
  duration: number
  fps: number
  frameInterval: number
  frames: FilmStudyFrame[]
  segments: FilmStudySegment[]
  createdAt: string
  updatedAt: string
}

export interface FilmStudyExtractRequest {
  nodeId: string
  path: string
  scope?: AssetScope
  interval: number
  maxFrames?: number
  sourceName?: string
  sourceNodeId?: string
}

export interface FilmStudyExtractResult {
  cancelled?: boolean
  summary?: FilmStudySummary
}

export interface FilmStudyExportResult {
  path?: string
  canceled?: boolean
}

export interface FilmStudyProgress {
  nodeId: string
  studyId?: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  percent: number
  current?: number
  total?: number
  message?: string
  error?: string
  frameCount?: number
  interval?: number
  duration?: number
  fps?: number
}
