import {
  MIN_CLIP_MS,
  clipEnd,
  clipsOfTrack,
  mainTrackId,
  newClipId,
  type TimelineClip,
  type TimelineDoc
} from './timeline-schema'

export type EditMode = 'insert' | 'overwrite'

function trackOf(doc: TimelineDoc, trackId: string) {
  return doc.tracks.find((track) => track.id === trackId) ?? null
}

function lockedTrack(doc: TimelineDoc, trackId: string): boolean {
  return trackOf(doc, trackId)?.locked === true
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 把轨道上 atMs 之后（含）的片段整体平移 deltaMs */
export function rippleShift(
  doc: TimelineDoc,
  trackId: string,
  fromMs: number,
  deltaMs: number,
  exclude?: ReadonlySet<string>
): void {
  if (deltaMs === 0 || lockedTrack(doc, trackId)) return
  for (const clip of doc.clips) {
    if (clip.trackId !== trackId) continue
    if (exclude?.has(clip.id)) continue
    if (clip.startMs >= fromMs) clip.startMs = Math.max(0, clip.startMs + deltaMs)
  }
}

/** 在 atMs 处切开轨道上的片段（如果 atMs 落在片段内部） */
export function splitAt(doc: TimelineDoc, trackId: string, atMs: number): void {
  const hits = clipsOfTrack(doc, trackId).filter(
    (clip) => atMs > clip.startMs && atMs < clipEnd(clip)
  )
  if (hits.length === 0) return
  splitClips(
    doc,
    hits.map((clip) => clip.id),
    atMs
  )
}

/** 插入模式：把 atMs 之后的片段后移，再按顺序放入 */
export function insertClips(
  doc: TimelineDoc,
  trackId: string,
  atMs: number,
  incoming: TimelineClip[]
): void {
  if (incoming.length === 0 || lockedTrack(doc, trackId)) return
  // 切分和 ripple 必须使用同一个整数时间点；浮点 atMs 会让尾部起点取整后
  // 小于 fromMs，ripple 就漏掉刚切出来的尾部片段。
  const insertAt = Math.max(0, Math.round(atMs))
  splitAt(doc, trackId, insertAt)
  const total = incoming.reduce((sum, clip) => sum + clip.durationMs, 0)
  rippleShift(doc, trackId, insertAt, total)

  let cursor = insertAt
  for (const clip of incoming) {
    clip.trackId = trackId
    clip.startMs = cursor
    if (!clip.id) clip.id = newClipId()
    doc.clips.push(clip)
    cursor += clip.durationMs
  }
}

/** 覆盖模式：裁掉目标区间内的已有片段，再放入新片段 */
export function overwriteClips(
  doc: TimelineDoc,
  trackId: string,
  atMs: number,
  incoming: TimelineClip[]
): void {
  if (incoming.length === 0 || lockedTrack(doc, trackId)) return
  const total = incoming.reduce((sum, clip) => sum + clip.durationMs, 0)
  cutRange(doc, trackId, atMs, atMs + total)

  let cursor = atMs
  for (const clip of incoming) {
    clip.trackId = trackId
    clip.startMs = cursor
    if (!clip.id) clip.id = newClipId()
    doc.clips.push(clip)
    cursor += clip.durationMs
  }
}

/** 在轨道上挖掉 [fromMs, toMs)：完全覆盖的删除，部分重叠的裁剪 */
export function cutRange(doc: TimelineDoc, trackId: string, fromMs: number, toMs: number): void {
  if (lockedTrack(doc, trackId) || toMs <= fromMs) return
  const next: TimelineClip[] = []

  for (const clip of doc.clips) {
    if (clip.trackId !== trackId) {
      next.push(clip)
      continue
    }
    const end = clipEnd(clip)
    if (end <= fromMs || clip.startMs >= toMs) {
      next.push(clip)
      continue
    }
    const head = fromMs - clip.startMs
    const tail = end - toMs

    if (head > 0) {
      const kept = { ...clip, durationMs: head }
      next.push(kept)
    }
    if (tail > 0) {
      const kept = {
        ...clip,
        id: head > 0 ? newClipId() : clip.id,
        startMs: toMs,
        durationMs: tail,
        sourceStartMs: clip.sourceStartMs + (toMs - clip.startMs) * clip.speed,
        transitionIn: head > 0 ? undefined : clip.transitionIn
      }
      next.push(kept)
    }
  }

  doc.clips = next
}

export interface TimeRange {
  startMs: number
  endMs: number
}

/**
 * 删除若干时间区间，并默认闭合空隙。
 * 按轨道独立处理，同一轨道从后往前删，避免前移影响尚未处理的区间坐标。
 */
export function removeRanges(
  doc: TimelineDoc,
  ranges: TimeRange[],
  ripple = true,
  trackIds?: string[]
): void {
  const normalized = ranges
    .map((range) => ({
      startMs: Math.max(0, Math.round(Math.min(range.startMs, range.endMs))),
      endMs: Math.max(0, Math.round(Math.max(range.startMs, range.endMs)))
    }))
    .filter((range) => range.endMs > range.startMs)
    .sort((a, b) => a.startMs - b.startMs)

  if (normalized.length === 0) return

  const targets = trackIds
    ? doc.tracks.filter((track) => trackIds.includes(track.id) && !track.locked)
    : doc.tracks.filter((track) => !track.locked)

  for (const track of targets) {
    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      const { startMs, endMs } = normalized[index]
      cutRange(doc, track.id, startMs, endMs)
      if (ripple) rippleShift(doc, track.id, endMs, -(endMs - startMs))
    }
  }
}

export interface ClipMove {
  clipId: string
  startMs: number
  trackId: string
}

/** 移动片段；默认插入，overwrite 时覆盖目标区间 */
export function moveClips(doc: TimelineDoc, moves: ClipMove[], mode: EditMode = 'insert'): void {
  if (moves.length === 0) return
  const moving = new Set(moves.map((move) => move.clipId))
  const picked: { clip: TimelineClip; move: ClipMove }[] = []

  for (const move of moves) {
    const clip = doc.clips.find((item) => item.id === move.clipId)
    if (!clip) continue
    if (lockedTrack(doc, clip.trackId)) continue
    if (lockedTrack(doc, move.trackId)) continue
    picked.push({ clip, move })
  }
  if (picked.length === 0) return

  const linkageMoves = picked.map(({ clip, move }) => ({
    delta: Math.max(0, move.startMs) - clip.startMs,
    dependents:
      doc.linkage && clip.trackId === mainTrackId(doc)
        ? dependentsOf(doc, clip)
        : []
  }))

  // 先摘出来，避免移动过程中互相干扰
  doc.clips = doc.clips.filter((clip) => !moving.has(clip.id))

  // 磁性：原位置之后的片段前移，闭合被移走留下的空隙
  for (const { clip } of picked) {
    if (lockedTrack(doc, clip.trackId)) continue
    rippleShift(doc, clip.trackId, clipEnd(clip), -clip.durationMs)
  }

  // 按目标位置从大到小放入，避免后放的目标被先放的目标挤动
  const placed = new Set<string>()
  const ordered = [...picked].sort((a, b) => b.move.startMs - a.move.startMs)
  for (const { clip, move } of ordered) {
    if (lockedTrack(doc, move.trackId)) continue
    if (mode === 'insert') {
      splitAt(doc, move.trackId, move.startMs)
      rippleShift(doc, move.trackId, move.startMs, clip.durationMs, placed)
    } else {
      cutRange(doc, move.trackId, move.startMs, move.startMs + clip.durationMs)
    }
    clip.trackId = move.trackId
    clip.startMs = Math.max(0, move.startMs)
    doc.clips.push(clip)
    placed.add(clip.id)
  }

  for (const item of linkageMoves) {
    if (item.delta === 0) continue
    for (const dependent of item.dependents) {
      if (moving.has(dependent.id)) continue
      const current = doc.clips.find((clip) => clip.id === dependent.id)
      if (!current || lockedTrack(doc, current.trackId)) continue
      current.startMs = Math.max(0, current.startMs + item.delta)
    }
  }

  normalizeClips(doc)
}

/** 裁剪片段头部或尾部 */
export function trimClip(
  doc: TimelineDoc,
  clipId: string,
  edge: 'start' | 'end',
  deltaMs: number,
  ripple = false
): void {
  const clip = doc.clips.find((item) => item.id === clipId)
  if (!clip || lockedTrack(doc, clip.trackId)) return

  if (edge === 'start') {
    const minDelta = -clip.sourceStartMs / Math.max(clip.speed, 0.1)
    const maxDelta = clip.durationMs - MIN_CLIP_MS
    const delta = clamp(deltaMs, minDelta, maxDelta)
    if (delta === 0) return
    const dependents =
      doc.linkage && clip.trackId === mainTrackId(doc)
        ? dependentsOf(doc, clip)
        : []
    clip.startMs = Math.max(0, clip.startMs + delta)
    clip.sourceStartMs = Math.max(0, clip.sourceStartMs + delta * clip.speed)
    clip.durationMs = Math.max(MIN_CLIP_MS, clip.durationMs - delta)
    for (const dependent of dependents) {
      if (lockedTrack(doc, dependent.trackId)) continue
      dependent.startMs = Math.max(0, dependent.startMs + delta)
    }
    if (ripple) rippleShift(doc, clip.trackId, clip.startMs, -delta, new Set([clip.id]))
    return
  }

  const minDelta = MIN_CLIP_MS - clip.durationMs
  const delta = Math.max(deltaMs, minDelta)
  if (delta === 0) return
  clip.durationMs += delta
  if (ripple) rippleShift(doc, clip.trackId, clipEnd(clip), delta, new Set([clip.id]))
}

/** 在 atMs 处切割；前半保留原 id，后半是新片段 */
export function splitClips(doc: TimelineDoc, clipIds: string[], atMs: number): void {
  const ids = new Set(clipIds)
  const targets = doc.clips.filter((clip) => ids.has(clip.id))
  const tails: TimelineClip[] = []

  for (const clip of targets) {
    if (lockedTrack(doc, clip.trackId)) continue
    if (atMs <= clip.startMs || atMs >= clipEnd(clip)) continue
    const headMs = atMs - clip.startMs
    const tailMs = clip.durationMs - headMs
    if (headMs < MIN_CLIP_MS || tailMs < MIN_CLIP_MS) continue

    const ratio = headMs / clip.durationMs
    const tail: TimelineClip = {
      ...clip,
      id: newClipId(),
      startMs: atMs,
      durationMs: tailMs,
      sourceStartMs: clip.sourceStartMs + headMs * clip.speed,
      transitionIn: undefined,
      keys: clip.keys
        .filter((key) => key.at > ratio)
        .map((key) => ({ ...key, at: (key.at - ratio) / (1 - ratio) }))
    }
    clip.durationMs = headMs
    clip.keys = clip.keys.filter((key) => key.at <= ratio)
    tails.push(tail)
  }

  for (const tail of tails) doc.clips.push(tail)
  normalizeClips(doc)
}

/** 删除片段；ripple 时闭合被删片段留下的空隙 */
export function removeClips(doc: TimelineDoc, clipIds: string[], ripple = false): void {
  const ids = new Set(clipIds)
  if (ids.size === 0) return

  const main = mainTrackId(doc)
  if (doc.linkage) {
    for (const clip of doc.clips) {
      if (!ids.has(clip.id) || clip.trackId !== main) continue
      for (const dependent of dependentsOf(doc, clip)) ids.add(dependent.id)
    }
  }

  const removed = doc.clips.filter((clip) => ids.has(clip.id) && !lockedTrack(doc, clip.trackId))
  if (removed.length === 0) return

  const removedIds = new Set(removed.map((clip) => clip.id))
  doc.clips = doc.clips.filter((clip) => !removedIds.has(clip.id))

  if (!ripple) return

  const byTrack = new Map<string, TimelineClip[]>()
  for (const clip of removed) {
    const list = byTrack.get(clip.trackId) ?? []
    list.push(clip)
    byTrack.set(clip.trackId, list)
  }
  for (const [trackId, list] of byTrack) {
    for (const clip of list.sort((a, b) => b.startMs - a.startMs)) {
      rippleShift(doc, trackId, clipEnd(clip), -clip.durationMs)
    }
  }
}

/** 闭合一条轨道上的全部空隙 */
export function closeGaps(doc: TimelineDoc, trackId: string): void {
  if (lockedTrack(doc, trackId)) return
  let cursor = 0
  for (const clip of clipsOfTrack(doc, trackId)) {
    clip.startMs = cursor
    cursor += clip.durationMs
  }
}

/** 主轨上的片段被移动或删除时，落在它区间内的其他轨片段 */
export function dependentsOf(doc: TimelineDoc, mainClip: TimelineClip): TimelineClip[] {
  return doc.clips.filter(
    (clip) =>
      clip.id !== mainClip.id &&
      clip.trackId !== mainClip.trackId &&
      clip.startMs >= mainClip.startMs &&
      clip.startMs < clipEnd(mainClip)
  )
}

/** linkage：主轨片段平移时，依附片段一起平移 */
export function linkageShift(doc: TimelineDoc, mainClip: TimelineClip, deltaMs: number): void {
  if (!doc.linkage || deltaMs === 0) return
  for (const clip of dependentsOf(doc, mainClip)) {
    if (lockedTrack(doc, clip.trackId)) continue
    clip.startMs = Math.max(0, clip.startMs + deltaMs)
  }
}

/** 修正负值、过短片段、悬空 trackId，并按轨道和起点排序 */
export function normalizeClips(doc: TimelineDoc): void {
  const trackIds = new Set(doc.tracks.map((track) => track.id))
  doc.clips = doc.clips.filter((clip) => trackIds.has(clip.trackId))
  for (const clip of doc.clips) {
    clip.startMs = Math.max(0, Math.round(clip.startMs))
    clip.durationMs = Math.max(MIN_CLIP_MS, Math.round(clip.durationMs))
    clip.sourceStartMs = Math.max(0, Math.round(clip.sourceStartMs))
  }
  doc.clips.sort((a, b) => {
    if (a.trackId !== b.trackId) return a.trackId.localeCompare(b.trackId)
    return a.startMs - b.startMs
  })
}
