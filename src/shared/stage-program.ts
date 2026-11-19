import type {
  DirectorStageDoc,
  StageProgramEntry
} from './stage-schema'

export interface ProgramSegment {
  shotId: string
  startMs: number
  endMs: number
  front: number
  entryIndex: number
}

export interface ProgramTimeline {
  segments: ProgramSegment[]
  durationMs: number
}

function resolveEntries(
  doc: Pick<DirectorStageDoc, 'shots' | 'program'>
): StageProgramEntry[] {
  const entries = doc.program?.entries
  if (entries && entries.length > 0) return entries
  return doc.shots.map((shot) => ({ shotId: shot.id }))
}

export function buildProgramTimeline(
  doc: Pick<DirectorStageDoc, 'shots' | 'program'>
): ProgramTimeline {
  const shots = new Map(doc.shots.map((shot) => [shot.id, shot] as const))
  const segments: ProgramSegment[] = []
  let cursor = 0

  for (const [entryIndex, entry] of resolveEntries(doc).entries()) {
    const shot = shots.get(entry.shotId)
    if (!shot) continue
    const duration = Math.max(0, Math.round(shot.durationMs))
    if (duration <= 0) continue
    const startMs =
      entry.startMs !== undefined && Number.isFinite(entry.startMs)
        ? Math.max(0, Math.round(entry.startMs))
        : cursor
    const endMs = startMs + duration
    segments.push({
      shotId: entry.shotId,
      startMs,
      endMs,
      front: entry.front ?? 0,
      entryIndex
    })
    cursor = Math.max(cursor, endMs)
  }

  const durationMs = segments.reduce(
    (max, segment) => Math.max(max, segment.endMs),
    0
  )
  return { segments, durationMs }
}

export function programAt(
  timeline: ProgramTimeline,
  timeMs: number
): ProgramSegment | undefined {
  if (!Number.isFinite(timeMs)) return undefined
  let current: ProgramSegment | undefined
  for (const segment of timeline.segments) {
    if (timeMs < segment.startMs || timeMs >= segment.endMs) continue
    if (
      !current ||
      segment.front > current.front ||
      (segment.front === current.front &&
        segment.entryIndex > current.entryIndex)
    ) {
      current = segment
    }
  }
  return current
}

/** 取样片段内部时间；返回 undefined 表示该时刻没有镜头（黑场）。 */
export function segmentShotTime(
  timeline: ProgramTimeline,
  timeMs: number
): { segment: ProgramSegment; shotTimeMs: number } | undefined {
  const segment = programAt(timeline, timeMs)
  if (!segment) return undefined
  return {
    segment,
    shotTimeMs: Math.max(0, timeMs - segment.startMs)
  }
}

export function formatTimecode(ms: number, fps: number): string {
  const safeFps = Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 24
  const totalFrames = Math.max(0, Math.round((ms / 1000) * safeFps))
  const frames = totalFrames % safeFps
  const totalSeconds = Math.floor(totalFrames / safeFps)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`
}
