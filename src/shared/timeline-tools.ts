import type { TimelineCommand } from './timeline-commands'
import type { TimeRange } from './timeline-edit'
import { docDurationMs, formatTimecode } from './timeline-layout'
import {
  clipEnd,
  mainTrackId,
  newMarkerId,
  type TimelineDoc
} from './timeline-schema'

export interface TimelinePlan {
  title: string
  summary: string
  commands: TimelineCommand[]
  warnings: string[]
  /** 计划删除的总时长，便于 UI 显示影响 */
  removedMs: number
  /** 实际参与处理的区间数量 */
  rangeCount: number
}

export interface RemoveSilenceOptions {  /** 静音两端保留的缓冲，避免切掉呼吸声 */
  paddingMs?: number
  /** 短于该值的区间不处理 */
  minDurationMs?: number
  /** 是否闭合空隙，默认 true */
  ripple?: boolean
  /** 限定轨道；不传时处理全部未锁定轨道 */
  trackIds?: string[]
}

function mergeTimeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs)
  const merged: TimeRange[] = []

  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, range.endMs)
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

/**
 * 把检测到的静音区间转成一条可撤销的时间线计划。
 * 输入区间使用时间线绝对毫秒；计划只生成命令，不修改文档。
 */
export function buildRemoveSilencePlan(
  doc: TimelineDoc,
  ranges: TimeRange[],
  options: RemoveSilenceOptions = {}
): TimelinePlan {
  const paddingMs = Math.max(0, Math.round(options.paddingMs ?? 120))
  const minDurationMs = Math.max(0, Math.round(options.minDurationMs ?? 400))
  const totalMs = Math.max(0, docDurationMs(doc))
  const adjusted: TimeRange[] = []

  for (const range of ranges) {
    const rawStart = Math.min(range.startMs, range.endMs)
    const rawEnd = Math.max(range.startMs, range.endMs)
    const startMs = Math.max(
      0,
      Math.min(totalMs, Math.round(rawStart) + paddingMs)
    )
    const endMs = Math.max(
      0,
      Math.min(totalMs, Math.round(rawEnd) - paddingMs)
    )
    if (endMs - startMs < minDurationMs) continue
    adjusted.push({ startMs, endMs })
  }

  const merged = mergeTimeRanges(adjusted)
  const warnings: string[] = []
  const locked = doc.tracks
    .filter((track) => track.locked)
    .map((track) => track.name)
  if (locked.length > 0) {
    warnings.push(`已跳过锁定轨道：${locked.join('、')}`)
  }

  if (merged.length === 0) {
    return {
      title: '删静音',
      summary: '没有检测到可删除的静音区间',
      commands: [],
      warnings,
      removedMs: 0,
      rangeCount: 0
    }
  }

  const removedMs = merged.reduce(
    (sum, range) => sum + (range.endMs - range.startMs),
    0
  )
  const afterMs = Math.max(0, totalMs - removedMs)
  const fps = doc.video.fps

  return {
    title: '删静音',
    summary: `将删除 ${merged.length} 段静音，共 ${(removedMs / 1000).toFixed(
      1
    )} 秒，时长 ${formatTimecode(totalMs, fps)} → ${formatTimecode(
      afterMs,
      fps
    )}`,
    commands: [
      {
        op: 'removeRanges',
        ranges: merged,
        ripple: options.ripple ?? true,
        trackIds: options.trackIds
      }
    ],
    warnings,
    removedMs,
    rangeCount: merged.length
  }
}

function emptyPlan(
  title: string,
  summary: string,
  warnings: string[] = []
): TimelinePlan {
  return {
    title,
    summary,
    commands: [],
    warnings,
    removedMs: 0,
    rangeCount: 0
  }
}

function uniqueSorted(points: number[]): number[] {
  return [...new Set(points.map((point) => Math.round(point)))]
    .filter((point) => Number.isFinite(point))
    .sort((a, b) => a - b)
}

export interface SplitByShotsOptions {
  /** 两个镜头之间的最小间隔 */
  minShotMs?: number
  /** 片段首尾不切的缓冲 */
  edgePaddingMs?: number
}

/** 把镜头切点转成对单个视频片段的切分计划 */
export function buildSplitByShotsPlan(
  doc: TimelineDoc,
  clipId: string,
  cutPointsMs: number[],
  options: SplitByShotsOptions = {}
): TimelinePlan {
  const clip = doc.clips.find((item) => item.id === clipId)
  if (!clip) return emptyPlan('按镜头切分', '找不到要切分的片段')

  const minShotMs = Math.max(0, Math.round(options.minShotMs ?? 500))
  const edgePaddingMs = Math.max(0, Math.round(options.edgePaddingMs ?? 100))
  const startMs = clip.startMs
  const endMs = clipEnd(clip)
  const candidates = uniqueSorted(cutPointsMs).filter(
    (point) =>
      point > startMs + edgePaddingMs && point < endMs - edgePaddingMs
  )

  const kept: number[] = []
  for (const point of candidates) {
    const last = kept[kept.length - 1]
    if (last !== undefined && point - last < minShotMs) continue
    kept.push(point)
  }
  if (kept.length > 0 && endMs - kept[kept.length - 1] < minShotMs) kept.pop()

  if (kept.length === 0) {
    return emptyPlan('按镜头切分', '没有检测到可用的镜头切点')
  }

  const commands: TimelineCommand[] = [...kept]
    .reverse()
    .map((atMs) => ({ op: 'splitClips', clipIds: [clip.id], atMs }))

  return {
    title: '按镜头切分',
    summary: `将在 ${kept.length} 个镜头切点切分「${
      clip.name || '视频'
    }」，生成 ${kept.length + 1} 段`,
    commands,
    warnings: [],
    removedMs: 0,
    rangeCount: kept.length
  }
}

export interface BeatMarkerOptions {
  label?: string
  color?: string
}

/** 把节拍点转成时间线标记 */
export function buildBeatMarkerPlan(
  doc: TimelineDoc,
  beatPointsMs: number[],
  options: BeatMarkerOptions = {}
): TimelinePlan {
  const totalMs = Math.max(0, docDurationMs(doc))
  const points = uniqueSorted(beatPointsMs).filter(
    (point) => point >= 0 && point <= totalMs
  )
  if (points.length === 0) {
    return emptyPlan('节拍标记', '没有检测到节拍')
  }

  const room = Math.max(0, 500 - doc.markers.length)
  if (room === 0) {
    return emptyPlan('节拍标记', '标记已达上限 500 个')
  }

  const limited = points.slice(0, room)
  const warnings =
    limited.length < points.length
      ? [`标记上限 500 个，已保留前 ${limited.length} 个节拍`]
      : []
  const commands: TimelineCommand[] = limited.map((atMs) => ({
    op: 'addMarker',
    marker: {
      id: newMarkerId(),
      atMs,
      label: options.label ?? '节拍',
      color: options.color ?? '#7bd88f'
    }
  }))

  return {
    title: '节拍标记',
    summary: `将写入 ${limited.length} 个节拍标记`,
    commands,
    warnings,
    removedMs: 0,
    rangeCount: limited.length
  }
}

export interface BeatSplitOptions {
  trackId?: string
  minGapMs?: number
}

/** 把节拍点转成主轨切分计划 */
export function buildBeatSplitPlan(
  doc: TimelineDoc,
  beatPointsMs: number[],
  options: BeatSplitOptions = {}
): TimelinePlan {
  const trackId = options.trackId ?? mainTrackId(doc)
  if (!trackId) return emptyPlan('节拍切分', '找不到主轨')
  const track = doc.tracks.find((item) => item.id === trackId)
  if (!track) return emptyPlan('节拍切分', '找不到目标轨道')
  if (track.locked) return emptyPlan('节拍切分', '目标轨道已锁定')

  const minGapMs = Math.max(0, Math.round(options.minGapMs ?? 250))
  const clips = doc.clips.filter((clip) => clip.trackId === trackId)
  const candidates = uniqueSorted(beatPointsMs).filter((point) =>
    clips.some((clip) => point > clip.startMs && point < clipEnd(clip))
  )

  const kept: number[] = []
  for (const point of candidates) {
    const last = kept[kept.length - 1]
    if (last !== undefined && point - last < minGapMs) continue
    kept.push(point)
  }

  if (kept.length === 0) {
    return emptyPlan('节拍切分', '没有检测到可用的节拍切点')
  }

  const commands: TimelineCommand[] = [...kept]
    .reverse()
    .map((atMs) => ({ op: 'splitAt', trackId, atMs }))

  return {
    title: '节拍切分',
    summary: `将在 ${kept.length} 个节拍点切分「${track.name}」`,
    commands,
    warnings: [],
    removedMs: 0,
    rangeCount: kept.length
  }
}
