import { z } from 'zod'

export const TIMELINE_SCHEMA_VERSION = 1

/** 一帧 @60fps 的长度，片段不能短于它 */
export const MIN_CLIP_MS = 1000 / 60
/** 图片片段首次放入时间线时的默认时长 */
export const DEFAULT_IMAGE_DURATION_MS = 5000
/** 文字片段首次放入时间线时的默认时长 */
export const DEFAULT_TEXT_DURATION_MS = 4000
/** 转场默认时长 */
export const DEFAULT_TRANSITION_MS = 500
/** 转场最短时长 */
export const MIN_TRANSITION_MS = 100
/** 单条时间线最多片段数 */
export const MAX_CLIPS = 5000
/** 单条时间线最多轨道数 */
export const MAX_TRACKS = 50

export const timelineTrackKindSchema = z.enum(['video', 'audio', 'subtitle'])

export const timelineClipKindSchema = z.enum([
  'video',
  'image',
  'audio',
  'text',
  'layer',
  'transition'
])

export const timelineMediaRefSchema = z.object({
  /** project：项目内相对路径；global：全局资产库内相对路径 */
  scope: z.enum(['project', 'global']),
  path: z.string().min(1).max(2000),
  /** 来源画布节点，便于上游更新时提示 */
  nodeId: z.string().max(120).optional(),
  outputId: z.string().max(120).optional(),
  kind: z.enum(['video', 'image', 'audio'])
})

export const clipTransformSchema = z.object({
  scale: z.number().min(0.01).max(20).default(1),
  /** 相对画幅宽度的比例 */
  offsetX: z.number().min(-10).max(10).default(0),
  /** 相对画幅高度的比例 */
  offsetY: z.number().min(-10).max(10).default(0),
  rotation: z.number().min(-360).max(360).default(0),
  stretchX: z.number().min(0.01).max(10).default(1),
  stretchY: z.number().min(0.01).max(10).default(1)
})

export const clipCropSchema = z.object({
  left: z.number().min(0).max(1).default(0),
  top: z.number().min(0).max(1).default(0),
  right: z.number().min(0).max(1).default(0),
  bottom: z.number().min(0).max(1).default(0)
})

export const clipFilterSchema = z.object({
  brightness: z.number().min(0).max(2).default(1),
  contrast: z.number().min(0).max(2).default(1),
  saturation: z.number().min(0).max(2).default(1),
  blur: z.number().min(0).max(20).default(0),
  grayscale: z.number().min(0).max(1).default(0),
  sepia: z.number().min(0).max(1).default(0),
  hueRotate: z.number().min(-180).max(180).default(0),
  invert: z.number().min(0).max(1).default(0),
  vignette: z.number().min(0).max(1).default(0)
})

export const textStrokeSchema = z.object({
  color: z.string().max(50),
  width: z.number().min(0).max(50)
})

export const textShadowSchema = z.object({
  color: z.string().max(50),
  blur: z.number().min(0).max(100),
  offsetX: z.number().min(-100).max(100),
  offsetY: z.number().min(-100).max(100)
})

export const textBackgroundSchema = z.object({
  color: z.string().max(50),
  padding: z.number().min(0).max(200),
  radius: z.number().min(0).max(200)
})

export const textStyleSchema = z.object({
  content: z.string().max(10000),
  fontFamily: z.string().max(200).default('Arial'),
  /** 画幅像素，不是屏幕像素 */
  fontSize: z.number().min(1).max(1000).default(64),
  color: z.string().max(50).default('#ffffff'),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  align: z.enum(['left', 'center', 'right']).default('center'),
  stroke: textStrokeSchema.optional(),
  shadow: textShadowSchema.optional(),
  background: textBackgroundSchema.optional()
})

export const clipKeyPropertySchema = z.enum([
  'position',
  'scale',
  'rotation',
  'opacity',
  'volume'
])

export const clipKeySchema = z.object({
  property: clipKeyPropertySchema,
  /** 0-1，片段内比例 */
  at: z.number().min(0).max(1),
  value: z.union([z.number(), z.object({ x: z.number(), y: z.number() })]),
  ease: z
    .enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'bezier'])
    .default('linear'),
  /** cubic-bezier 控制点 x1,y1,x2,y2 */
  bezier: z
    .tuple([
      z.number().min(0).max(1),
      z.number().min(-0.5).max(1.5),
      z.number().min(0).max(1),
      z.number().min(-0.5).max(1.5)
    ])
    .optional()
})

export const transitionInSchema = z.object({
  type: z.enum([
    'fade',
    'dip-black',
    'wipe-left',
    'wipe-right',
    'slide-left',
    'slide-right',
    'zoom-in'
  ]),
  durationMs: z.number().min(MIN_TRANSITION_MS).max(10000)
})

export const audioFxSchema = z.object({
  denoise: z.boolean().default(false),
  enhanceVoice: z.boolean().default(false),
  loudness: z.boolean().default(false),
  voiceEffect: z
    .enum(['none', 'chipmunk', 'robot', 'telephone'])
    .default('none')
})

export const timelineClipSchema = z.object({
  id: z.string().min(1).max(120),
  trackId: z.string().min(1).max(120),
  kind: timelineClipKindSchema,
  name: z.string().max(200).default(''),

  // 时间（毫秒整数）
  startMs: z.number().min(0),
  durationMs: z.number().min(1),
  sourceStartMs: z.number().min(0).default(0),
  speed: z.number().min(0.1).max(10).default(1),

  media: timelineMediaRefSchema.optional(),

  // 画面
  transform: clipTransformSchema.optional(),
  opacity: z.number().min(0).max(1).default(1),
  blend: z
    .enum(['normal', 'multiply', 'screen', 'add', 'lighten', 'darken'])
    .default('normal'),
  crop: clipCropSchema.optional(),
  filter: clipFilterSchema.optional(),

  // 声音
  volume: z.number().min(0).max(4).default(1),
  fadeInMs: z.number().min(0).default(0),
  fadeOutMs: z.number().min(0).default(0),
  muted: z.boolean().default(false),
  preservePitch: z.boolean().default(true),
  audioFx: audioFxSchema.optional(),

  // 文字 / 字幕
  text: textStyleSchema.optional(),

  // 转场（作用于片头）
  transitionIn: transitionInSchema.optional(),

  // 关键帧
  keys: z.array(clipKeySchema).max(1000).default([])
})

export const timelineTrackSchema = z.object({
  id: z.string().min(1).max(120),
  kind: timelineTrackKindSchema,
  name: z.string().max(200),
  visible: z.boolean().default(true),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  height: z.number().min(40).max(120).optional()
})

export const timelineMarkerSchema = z.object({
  id: z.string().min(1).max(120),
  atMs: z.number().min(0),
  durationMs: z.number().min(0).optional(),
  label: z.string().max(200).default(''),
  color: z.string().max(50).optional()
})

export const timelineVideoSchema = z.object({
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(4320),
  fps: z.number().min(1).max(120),
  colorSpace: z.literal('sdr').default('sdr')
})

export const timelineBackgroundSchema = z.object({
  type: z.enum(['none', 'color', 'image']).default('none'),
  color: z.string().max(50).optional(),
  path: z.string().max(2000).optional()
})

export const timelineDocSchema = z.object({
  schemaVersion: z.literal(TIMELINE_SCHEMA_VERSION),
  id: z.string().min(1).max(120),
  name: z.string().max(200),
  video: timelineVideoSchema,
  background: timelineBackgroundSchema.default({ type: 'none' }),
  tracks: z.array(timelineTrackSchema).min(1).max(MAX_TRACKS),
  clips: z.array(timelineClipSchema).max(MAX_CLIPS),
  markers: z.array(timelineMarkerSchema).max(500).default([]),
  linkage: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string()
})

export type TimelineTrackKind = z.infer<typeof timelineTrackKindSchema>
export type TimelineClipKind = z.infer<typeof timelineClipKindSchema>
export type TimelineMediaRef = z.infer<typeof timelineMediaRefSchema>
export type ClipTransform = z.infer<typeof clipTransformSchema>
export type ClipCrop = z.infer<typeof clipCropSchema>
export type ClipFilter = z.infer<typeof clipFilterSchema>
export type TextStyle = z.infer<typeof textStyleSchema>
export type ClipKey = z.infer<typeof clipKeySchema>
export type ClipKeyProperty = z.infer<typeof clipKeyPropertySchema>
export type TransitionIn = z.infer<typeof transitionInSchema>
export type AudioFxSettings = z.infer<typeof audioFxSchema>
export type TimelineClip = z.infer<typeof timelineClipSchema>
export type TimelineTrack = z.infer<typeof timelineTrackSchema>
export type TimelineMarker = z.infer<typeof timelineMarkerSchema>
export type TimelineVideoSettings = z.infer<typeof timelineVideoSchema>
export type TimelineBackground = z.infer<typeof timelineBackgroundSchema>
export type TimelineDoc = z.infer<typeof timelineDocSchema>

export interface NewClipInput {
  trackId: string
  kind: TimelineClipKind
  name?: string
  startMs?: number
  durationMs?: number
  sourceStartMs?: number
  speed?: number
  media?: TimelineMediaRef
  text?: TextStyle
  transitionIn?: TransitionIn
}

let clipSequence = 0

/** 生成片段 id：时间戳 + 递增序号，同一毫秒内也不会重复 */
export function newClipId(): string {
  clipSequence += 1
  return `c${Date.now().toString(36)}${clipSequence.toString(36)}`
}

let trackSequence = 0

export function newTrackId(kind: TimelineTrackKind): string {
  trackSequence += 1
  const prefix = kind === 'video' ? 'v' : kind === 'audio' ? 'a' : 's'
  return `${prefix}${Date.now().toString(36)}${trackSequence.toString(36)}`
}

let markerSequence = 0

export function newMarkerId(): string {
  markerSequence += 1
  return `m${Date.now().toString(36)}${markerSequence.toString(36)}`
}

export function createClip(input: NewClipInput): TimelineClip {
  return timelineClipSchema.parse({
    id: newClipId(),
    trackId: input.trackId,
    kind: input.kind,
    name: input.name ?? '',
    startMs: input.startMs ?? 0,
    durationMs: input.durationMs ?? defaultDurationFor(input.kind),
    sourceStartMs: input.sourceStartMs ?? 0,
    speed: input.speed ?? 1,
    media: input.media,
    text: input.text,
    transitionIn: input.transitionIn,
    keys: []
  })
}

function defaultDurationFor(kind: TimelineClipKind): number {
  if (kind === 'image') return DEFAULT_IMAGE_DURATION_MS
  if (kind === 'text') return DEFAULT_TEXT_DURATION_MS
  return 1000
}

export function createTrack(
  kind: TimelineTrackKind,
  name: string,
  id?: string
): TimelineTrack {
  return timelineTrackSchema.parse({
    id: id ?? newTrackId(kind),
    kind,
    name,
    visible: true,
    muted: false,
    locked: false
  })
}

export interface NewTimelineInput {
  id: string
  name: string
  width?: number
  height?: number
  fps?: number
  tracks?: TimelineTrack[]
  clips?: TimelineClip[]
  now?: string
}

export function createTimeline(input: NewTimelineInput): TimelineDoc {
  const now = input.now ?? new Date().toISOString()
  const tracks =
    input.tracks ??
    [
      createTrack('subtitle', '字幕 1'),
      createTrack('video', 'V2'),
      createTrack('video', 'V1'),
      createTrack('audio', 'A1')
    ]
  return timelineDocSchema.parse({
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    video: {
      width: input.width ?? 1920,
      height: input.height ?? 1080,
      fps: input.fps ?? 30,
      colorSpace: 'sdr'
    },
    background: { type: 'none' },
    tracks,
    clips: input.clips ?? [],
    markers: [],
    linkage: true,
    createdAt: now,
    updatedAt: now
  })
}

/** 主轨：视频轨中最靠下的一条（V1）；没有视频轨时返回 null */
export function mainTrackId(doc: TimelineDoc): string | null {
  const videos = doc.tracks.filter((item) => item.kind === 'video')
  return videos.at(-1)?.id ?? null
}

export function clipsOfTrack(doc: TimelineDoc, trackId: string): TimelineClip[] {
  return doc.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startMs - b.startMs)
}

export function clipEnd(clip: Pick<TimelineClip, 'startMs' | 'durationMs'>): number {
  return clip.startMs + clip.durationMs
}

/** 时间线总时长：最晚片段结束点 */
export function timelineDurationMs(doc: TimelineDoc): number {
  return doc.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
}
