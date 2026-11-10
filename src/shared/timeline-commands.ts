import {
  DEFAULT_IMAGE_DURATION_MS,
  DEFAULT_TEXT_DURATION_MS,
  MIN_CLIP_MS,
  clipEnd,
  createClip,
  createTrack,
  mainTrackId,
  newClipId,
  type TimelineBackground,
  type TimelineClip,
  type TimelineDoc,
  type TimelineMarker,
  type TimelineTrack,
  type TimelineVideoSettings
} from './timeline-schema'
import {
  type ClipMove,
  type EditMode,
  type TimeRange,
  closeGaps,
  cutRange,
  insertClips,
  moveClips,
  normalizeClips,
  removeClips,
  removeRanges,
  splitAt,
  splitClips,
  trimClip
} from './timeline-edit'

export type { ClipMove, EditMode, TimeRange }

export type TimelineCommand =
  | { op: 'addClip'; clip: TimelineClip }
  | { op: 'addClips'; clips: TimelineClip[] }
  | {
      op: 'addClipsInSequence'
      clips: TimelineClip[]
      trackId: string
      atMs: number
      mode?: EditMode
    }
  | { op: 'moveClips'; moves: ClipMove[]; mode?: EditMode }
  | { op: 'trimClip'; clipId: string; edge: 'start' | 'end'; deltaMs: number; ripple?: boolean }
  | { op: 'splitClips'; clipIds: string[]; atMs: number }
  | { op: 'splitAt'; trackId: string; atMs: number }
  | { op: 'removeClips'; clipIds: string[]; ripple?: boolean }
  | {
      op: 'removeRanges'
      ranges: TimeRange[]
      ripple?: boolean
      trackIds?: string[]
    }
  | { op: 'updateClip'; clipId: string; patch: Partial<TimelineClip> }
  | { op: 'setClipSpeed'; clipId: string; speed: number }
  | { op: 'setClipTransform'; clipId: string; transform: Partial<NonNullable<TimelineClip['transform']>> }
  | { op: 'detachAudio'; clipId: string }
  | { op: 'addTrack'; track: TimelineTrack }
  | { op: 'removeTrack'; trackId: string }
  | {
      op: 'setTrackFlag'
      trackId: string
      flag: 'visible' | 'muted' | 'locked'
      value: boolean
    }
  | { op: 'setTimelineVideo'; video: TimelineVideoSettings }
  | { op: 'setTimelineBackground'; background: TimelineBackground }
  | { op: 'setLinkage'; linkage: boolean }
  | { op: 'closeGaps'; trackId: string }
  | { op: 'addMarker'; marker: TimelineMarker }
  | { op: 'removeMarker'; markerId: string }
  | { op: 'batch'; commands: TimelineCommand[]; label?: string }

/** 应用一条命令，返回新文档；入参不被修改 */
export function applyCommand(
  doc: TimelineDoc,
  command: TimelineCommand,
  now: string = new Date().toISOString()
): TimelineDoc {
  const wasEmpty = doc.clips.length === 0
  const next = structuredClone(doc)
  applyInPlace(next, command)
  normalizeClips(next)
  matchCanvasToFirstClip(next, wasEmpty)
  next.updatedAt = now
  return next
}

/** 依次应用多条命令，只克隆一次；AI 的批量操作走这里 */
export function applyCommands(
  doc: TimelineDoc,
  commands: TimelineCommand[],
  now: string = new Date().toISOString()
): TimelineDoc {
  const wasEmpty = doc.clips.length === 0
  const next = structuredClone(doc)
  for (const command of commands) applyInPlace(next, command)
  normalizeClips(next)
  matchCanvasToFirstClip(next, wasEmpty)
  next.updatedAt = now
  return next
}

/**
 * 时间线原本为空时，按第一个视频/图片素材的比例匹配画幅。
 * 只在仍是默认 16:9 时生效，避免覆盖用户手动设置的画幅。
 */
function matchCanvasToFirstClip(doc: TimelineDoc, wasEmpty: boolean): void {
  if (!wasEmpty || doc.clips.length === 0) return
  if (doc.video.width !== 1920 || doc.video.height !== 1080) return

  const clip = doc.clips.find(
    (item) =>
      (item.kind === 'video' || item.kind === 'image') &&
      item.media?.width &&
      item.media?.height
  )
  if (!clip?.media?.width || !clip.media.height) return

  const ratio = clip.media.width / clip.media.height
  if (ratio >= 1.9) {
    doc.video.width = 2560
    doc.video.height = 1080
  } else if (ratio >= 1.45) {
    doc.video.width = 1920
    doc.video.height = 1080
  } else if (ratio >= 1.15) {
    doc.video.width = 1440
    doc.video.height = 1080
  } else if (ratio >= 0.88) {
    doc.video.width = 1080
    doc.video.height = 1080
  } else if (ratio >= 0.72) {
    doc.video.width = 1080
    doc.video.height = 1440
  } else {
    doc.video.width = 1080
    doc.video.height = 1920
  }
}

function trackOf(doc: TimelineDoc, trackId: string): TimelineTrack | undefined {
  return doc.tracks.find((track) => track.id === trackId)
}

function applyInPlace(doc: TimelineDoc, command: TimelineCommand): void {
  switch (command.op) {
    case 'addClip':
      addOne(doc, command.clip)
      return

    case 'addClips':
      for (const clip of command.clips) addOne(doc, clip)
      return

    case 'addClipsInSequence': {
      const mode = command.mode ?? 'insert'
      if (mode === 'insert') {
        insertClips(doc, command.trackId, command.atMs, command.clips)
      } else {
        // 覆盖：先挖掉目标区间，再按顺序贴上去
        const total = command.clips.reduce((sum, clip) => sum + clip.durationMs, 0)
        cutRange(doc, command.trackId, command.atMs, command.atMs + total)
        let cursor = command.atMs
        for (const clip of command.clips) {
          clip.trackId = command.trackId
          clip.startMs = cursor
          if (!clip.id) clip.id = newClipId()
          doc.clips.push(clip)
          cursor += clip.durationMs
        }
      }
      return
    }

    case 'moveClips':
      moveClips(doc, command.moves, command.mode ?? 'insert')
      return

    case 'trimClip':
      trimClip(doc, command.clipId, command.edge, command.deltaMs, command.ripple ?? false)
      return

    case 'splitClips':
      splitClips(doc, command.clipIds, command.atMs)
      return

    case 'splitAt':
      splitAt(doc, command.trackId, command.atMs)
      return

    case 'removeClips':
      removeClips(doc, command.clipIds, command.ripple ?? isMainRipple(doc, command.clipIds))
      return

    case 'removeRanges':
      removeRanges(doc, command.ranges, command.ripple ?? true, command.trackIds)
      return

    case 'updateClip': {
      const clip = doc.clips.find((item) => item.id === command.clipId)
      if (!clip) return
      const patch = command.patch
      if (patch.id !== undefined && patch.id !== clip.id) return
      Object.assign(clip, patch, { id: clip.id })
      return
    }

    case 'setClipSpeed': {
      const clip = doc.clips.find((item) => item.id === command.clipId)
      if (!clip) return
      const speed = Math.min(10, Math.max(0.1, command.speed))
      const ratio = clip.speed / speed
      clip.speed = speed
      clip.durationMs = Math.max(MIN_CLIP_MS, clip.durationMs * ratio)
      return
    }

    case 'setClipTransform': {
      const clip = doc.clips.find((item) => item.id === command.clipId)
      if (!clip) return
      clip.transform = { ...(clip.transform ?? defaultTransform()), ...command.transform }
      return
    }

    case 'detachAudio':
      detachAudio(doc, command.clipId)
      return

    case 'addTrack': {
      if (doc.tracks.length >= 50) return
      if (doc.tracks.some((track) => track.id === command.track.id)) return
      doc.tracks.push(command.track)
      return
    }

    case 'removeTrack': {
      if (doc.tracks.length <= 1) return
      if (command.trackId === mainTrackId(doc)) return
      doc.tracks = doc.tracks.filter((track) => track.id !== command.trackId)
      doc.clips = doc.clips.filter((clip) => clip.trackId !== command.trackId)
      return
    }

    case 'setTrackFlag': {
      const track = trackOf(doc, command.trackId)
      if (!track) return
      track[command.flag] = command.value
      return
    }

    case 'setTimelineVideo':
      doc.video = command.video
      return

    case 'setTimelineBackground':
      doc.background = command.background
      return

    case 'setLinkage':
      doc.linkage = command.linkage
      return

    case 'closeGaps':
      closeGaps(doc, command.trackId)
      return

    case 'addMarker': {
      if (doc.markers.length >= 500) return
      if (doc.markers.some((marker) => marker.id === command.marker.id)) return
      doc.markers.push(command.marker)
      doc.markers.sort((a, b) => a.atMs - b.atMs)
      return
    }

    case 'removeMarker':
      doc.markers = doc.markers.filter((marker) => marker.id !== command.markerId)
      return

    case 'batch':
      for (const inner of command.commands) applyInPlace(doc, inner)
      return
  }
}

function addOne(doc: TimelineDoc, clip: TimelineClip): void {
  const track = trackOf(doc, clip.trackId)
  if (!track || track.locked) return
  if (!clip.id) clip.id = newClipId()
  const existing = doc.clips.find((item) => item.id === clip.id)
  if (existing) return
  doc.clips.push(clip)
}

function isMainRipple(doc: TimelineDoc, clipIds: string[]): boolean {
  const main = mainTrackId(doc)
  if (!main) return false
  return clipIds.some((id) => doc.clips.find((clip) => clip.id === id)?.trackId === main)
}

function defaultTransform(): NonNullable<TimelineClip['transform']> {
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    stretchX: 1,
    stretchY: 1
  }
}

/** 把视频片段的声音拆到音频轨；视频片段本身静音 */
function detachAudio(doc: TimelineDoc, clipId: string): void {
  const source = doc.clips.find((clip) => clip.id === clipId)
  if (!source || source.kind !== 'video' || !source.media) return

  const audioTrack =
    doc.tracks.find((track) => track.kind === 'audio' && !track.locked) ??
    createTrack('audio', 'A1')
  if (!doc.tracks.some((track) => track.id === audioTrack.id)) doc.tracks.push(audioTrack)

  const exists = doc.clips.find(
    (clip) =>
      clip.kind === 'audio' &&
      clip.media?.path === source.media?.path &&
      clip.startMs === source.startMs &&
      clip.durationMs === source.durationMs
  )
  if (exists) return

  const audio: TimelineClip = createClip({
    trackId: audioTrack.id,
    kind: 'audio',
    name: source.name ? `${source.name} · 音频` : '音频',
    startMs: source.startMs,
    durationMs: source.durationMs,
    sourceStartMs: source.sourceStartMs,
    speed: source.speed,
    media: { ...source.media, kind: 'video' }
  })
  audio.volume = source.volume
  audio.fadeInMs = source.fadeInMs
  audio.fadeOutMs = source.fadeOutMs

  source.muted = true
  doc.clips.push(audio)
}

/** 供 UI 使用的空命令构造器 */
export function imageClip(
  trackId: string,
  media: NonNullable<TimelineClip['media']>,
  name: string,
  startMs: number,
  durationMs = DEFAULT_IMAGE_DURATION_MS
): TimelineClip {
  return createClip({ trackId, kind: 'image', name, startMs, durationMs, media })
}

export function subtitleClip(
  trackId: string,
  content: string,
  startMs: number,
  durationMs = DEFAULT_TEXT_DURATION_MS
): TimelineClip {
  return createClip({
    trackId,
    kind: 'text',
    name: content.slice(0, 40),
    startMs,
    durationMs,
    text: {
      content,
      fontFamily: 'Arial',
      fontSize: 64,
      color: '#ffffff',
      bold: false,
      italic: false,
      align: 'center'
    }
  })
}

export function videoClip(
  trackId: string,
  media: NonNullable<TimelineClip['media']>,
  name: string,
  startMs: number,
  durationMs: number,
  sourceStartMs = 0,
  speed = 1
): TimelineClip {
  return createClip({
    trackId,
    kind: 'video',
    name,
    startMs,
    durationMs,
    sourceStartMs,
    speed,
    media
  })
}

/** 时间线摘要，给 AI 读 */
export interface TimelineSummary {
  durationMs: number
  video: { width: number; height: number; fps: number }
  tracks: { id: string; kind: string; name: string; clips: number }[]
  clips: {
    id: string
    trackId: string
    kind: string
    name: string
    startMs: number
    durationMs: number
    text?: string
  }[]
}

export function summarizeTimeline(doc: TimelineDoc): TimelineSummary {
  return {
    durationMs: doc.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0),
    video: { width: doc.video.width, height: doc.video.height, fps: doc.video.fps },
    tracks: doc.tracks.map((track) => ({
      id: track.id,
      kind: track.kind,
      name: track.name,
      clips: doc.clips.filter((clip) => clip.trackId === track.id).length
    })),
    clips: doc.clips
      .slice()
      .sort((a, b) => a.startMs - b.startMs)
      .map((clip) => ({
        id: clip.id,
        trackId: clip.trackId,
        kind: clip.kind,
        name: clip.name,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        text: clip.text?.content
      }))
  }
}
