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
  /** 主要剧情线 id 或名称 */
  primaryLine?: string
  /** 共用该段落的其它剧情线 */
  sharedLines?: string[]
  /** 结构角色，例如 铺垫 / 冲突 / 高潮 / 解决 */
  structureRole?: string
  /** 景别，例如 特写 / 中景 / 远景 */
  shotSize?: string
  /** 机位 / 摄影机角度 */
  cameraAngle?: string
  /** 运镜方式 */
  cameraMove?: string
  /** 光线与色彩 */
  lighting?: string
  /** 画面内容描述 */
  visualDescription?: string
  /** 可直接用于生成的画面提示词 */
  imagePrompt?: string
  /** 人声 / 对白 */
  voiceOver?: string
  /** 音乐 / 音效 */
  musicCue?: string
  /** 该分镜的代表帧（相对项目根） */
  coverFile?: string
}

export interface FilmStudyMacroAnalysis {
  overallStructure?: string
  narrativeStrategy?: string
  rhythmPattern?: string
  informationStrategy?: string
  coreCreativeIntent?: string
  writingLessons?: string[]
}

export interface FilmStudyStoryLine {
  id: string
  title: string
  subtitle?: string
  description?: string
}

export interface FilmStudyAudiencePoint {
  id: string
  time: number
  intensity: number
  valence?: number
  emotionType: string
  rhythmRole?: string
  title: string
  description?: string
}

export interface FilmStudySubtitle {
  startTime: number
  endTime: number
  text: string
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
  macroAnalysis?: FilmStudyMacroAnalysis
  storyLines?: FilmStudyStoryLine[]
  audienceCurvePoints?: FilmStudyAudiencePoint[]
  subtitles?: FilmStudySubtitle[]
  /** 自动分镜使用的模型标识 */
  analysisModel?: string
  /** 自动分镜完成时间 */
  autoAnalyzedAt?: string
  aiImportedAt?: string
  createdAt: string
  updatedAt: string
}

export interface FilmStudyOutputOptions {
  storyboard?: boolean
  sheet?: boolean
  /** 动态切片：每个镜头截取一段视频 */
  motion?: boolean
  /** 提取整条音轨作为 BGM 参考 */
  music?: boolean
}

export interface FilmStudyAutoRequest {
  nodeId: string
  path: string
  scope?: AssetScope
  sourceName?: string
  sourceNodeId?: string
  /** 0 表示自动镜头检测，其余为固定间隔秒数 */
  interval?: number
  modelKey?: string
  outputs?: FilmStudyOutputOptions
}

export interface FilmStudyAutoAsset {
  path: string
  kind: 'video' | 'audio'
  title?: string
  duration?: number
  width?: number
  height?: number
  fps?: number
  hasAudio?: boolean
}

export interface FilmStudyAutoResult {
  cancelled?: boolean
  study?: FilmStudy
  /** 实际生成的分镜数量 */
  shotCount?: number
  /** 是否使用了镜头检测 */
  usedShotDetection?: boolean
  /** 是否完成 AI 描述 */
  analyzed?: boolean
  /** AI 失败时保留基础分镜 */
  analysisError?: string
  /** 动态切片（按分镜顺序） */
  motionClips?: FilmStudyAutoAsset[]
  /** 提取的整条音轨 */
  music?: FilmStudyAutoAsset
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
