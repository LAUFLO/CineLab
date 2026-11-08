import { clipEnd, type TimelineClip, type TimelineDoc } from './timeline-schema'

/** 100% = 整条片子刚好填满宽度 */
export const DEFAULT_ZOOM = 0.8
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const ZOOM_STEP = 1.6
/** 空时间线默认显示的时间跨度 */
export const EMPTY_VIEW_SPAN_MS = 30_000
/** 主刻度之间至少这么多像素 */
const MIN_MAJOR_PX = 80

/**
 * 一屏显示多少时间：zoom 越大，显示的越少。
 * totalMs 为 0 时按空时间线的 30 秒跨度计算。
 */
export function pxPerMs(totalMs: number, width: number, zoom: number): number {
  const span = totalMs > 0 ? totalMs / Math.max(zoom, 0.01) : EMPTY_VIEW_SPAN_MS / Math.max(zoom, 0.01)
  return width / Math.max(span, 1)
}

export function msToPx(ms: number, pxPerMsValue: number): number {
  return ms * pxPerMsValue
}

export function pxToMs(px: number, pxPerMsValue: number): number {
  return px / Math.max(pxPerMsValue, 1e-6)
}

/** 缩放后保持鼠标下的时间不变所需的滚动位置 */
export function scrollLeftForAnchor(
  anchorX: number,
  anchorMs: number,
  nextPxPerMs: number,
  leftInset = 0
): number {
  return Math.max(0, anchorMs * nextPxPerMs - (anchorX - leftInset))
}

export interface VisibleRange {
  startMs: number
  endMs: number
}

/** 当前视口对应的时间范围；leftInset 是左侧轨道头宽度 */
export function visibleRange(
  scrollLeft: number,
  viewportWidth: number,
  pxPerMsValue: number,
  leftInset = 0
): VisibleRange {
  const startMs = Math.max(0, (scrollLeft - leftInset) / Math.max(pxPerMsValue, 1e-6))
  const endMs = startMs + viewportWidth / Math.max(pxPerMsValue, 1e-6)
  return { startMs, endMs }
}

/** 只保留与可视区相交的片段 */
export function clipsInRange(clips: TimelineClip[], range: VisibleRange): TimelineClip[] {
  return clips.filter(
    (clip) => clip.startMs < range.endMs && clipEnd(clip) > range.startMs
  )
}

export interface RulerSteps {
  majorMs: number
  minorMs: number
  /** 主刻度是否落在帧上 */
  frameLevel: boolean
}

const STEP_CANDIDATES = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000,
  60_000, 120_000, 300_000, 600_000
]

/** 按当前像素密度选择刻度间隔 */
export function rulerSteps(pxPerMsValue: number, fps = 30): RulerSteps {
  const frameMs = 1000 / Math.max(fps, 1)
  const minMajorMs = MIN_MAJOR_PX / Math.max(pxPerMsValue, 1e-6)
  if (minMajorMs <= frameMs) {
    return { majorMs: frameMs, minorMs: frameMs / 5, frameLevel: true }
  }
  const majorMs =
    STEP_CANDIDATES.find((candidate) => candidate >= minMajorMs) ??
    STEP_CANDIDATES[STEP_CANDIDATES.length - 1]
  return {
    majorMs,
    minorMs: majorMs >= 1000 ? majorMs / 5 : majorMs / 2,
    frameLevel: majorMs <= frameMs + 0.001
  }
}

function pad(value: number): string {
  return String(Math.floor(value)).padStart(2, '0')
}

/** 00:05 / 01:30 / 01:02:30；帧级时带上帧号 00:05:12 */
export function formatTimecode(ms: number, fps = 30, withFrames = false): string {
  const total = Math.max(0, Math.round(ms))
  const totalSeconds = Math.floor(total / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (withFrames) {
    const frame = Math.floor(((total % 1000) / 1000) * fps)
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frame)}`
  }
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

/** 时间线总时长（毫秒） */
export function docDurationMs(doc: TimelineDoc): number {
  return doc.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
}
