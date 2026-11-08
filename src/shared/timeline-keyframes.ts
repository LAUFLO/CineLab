import type { ClipKey, TimelineClip } from './timeline-schema'

export interface EvaluatedClip {
  position: { x: number; y: number }
  scale: number
  rotation: number
  opacity: number
  volume: number
}

export type KeyEase = ClipKey['ease']

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function easeValue(t: number, ease: KeyEase): number {
  switch (ease) {
    case 'ease-in':
      return t * t
    case 'ease-out':
      return 1 - (1 - t) * (1 - t)
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
    default:
      return t
  }
}

function keysFor(clip: TimelineClip, property: ClipKey['property']): ClipKey[] {
  return clip.keys
    .filter((key) => key.property === property)
    .sort((a, b) => a.at - b.at)
}

function numberAt(
  clip: TimelineClip,
  property: ClipKey['property'],
  at: number,
  fallback: number
): number {
  const keys = keysFor(clip, property)
  if (keys.length === 0) return fallback

  const first = keys[0]
  if (at <= first.at) {
    return typeof first.value === 'number' ? first.value : fallback
  }

  const last = keys[keys.length - 1]
  if (at >= last.at) {
    return typeof last.value === 'number' ? last.value : fallback
  }

  for (let index = 0; index < keys.length - 1; index += 1) {
    const current = keys[index]
    const next = keys[index + 1]
    if (at < current.at || at > next.at) continue
    if (typeof current.value !== 'number' || typeof next.value !== 'number') {
      return fallback
    }
    const span = next.at - current.at
    const t = span <= 0 ? 1 : easeValue((at - current.at) / span, next.ease)
    return current.value + (next.value - current.value) * t
  }

  return fallback
}

function positionAt(
  clip: TimelineClip,
  at: number
): { x: number; y: number } {
  const keys = keysFor(clip, 'position')
  const fallback = {
    x: clip.transform?.offsetX ?? 0,
    y: clip.transform?.offsetY ?? 0
  }
  if (keys.length === 0) return fallback

  const valueOf = (key: ClipKey | undefined): { x: number; y: number } | null =>
    key && typeof key.value === 'object' ? key.value : null

  const first = keys[0]
  const firstValue = valueOf(first)
  if (at <= first.at) return firstValue ?? fallback

  const last = keys[keys.length - 1]
  const lastValue = valueOf(last)
  if (at >= last.at) return lastValue ?? fallback

  for (let index = 0; index < keys.length - 1; index += 1) {
    const current = keys[index]
    const next = keys[index + 1]
    if (at < current.at || at > next.at) continue
    const currentValue = valueOf(current)
    const nextValue = valueOf(next)
    if (!currentValue || !nextValue) return fallback
    const span = next.at - current.at
    const t = span <= 0 ? 1 : easeValue((at - current.at) / span, next.ease)
    return {
      x: currentValue.x + (nextValue.x - currentValue.x) * t,
      y: currentValue.y + (nextValue.y - currentValue.y) * t
    }
  }

  return fallback
}

/** 求片段在某一时刻的关键帧值；无关键帧时回退到静态属性 */
export function evaluateClipKeys(
  clip: TimelineClip,
  timeMs: number
): EvaluatedClip {
  const at = clamp01(
    clip.durationMs <= 0 ? 0 : (timeMs - clip.startMs) / clip.durationMs
  )

  return {
    position: positionAt(clip, at),
    scale: numberAt(clip, 'scale', at, clip.transform?.scale ?? 1),
    rotation: numberAt(clip, 'rotation', at, clip.transform?.rotation ?? 0),
    opacity: numberAt(clip, 'opacity', at, clip.opacity),
    volume: numberAt(clip, 'volume', at, clip.volume)
  }
}

/**
 * 生成 ffmpeg volume 表达式（线性分段）。
 * 导出音频使用；缓动在导出侧近似为线性。
 */
export function volumeExpression(clip: TimelineClip): string | null {
  const keys = keysFor(clip, 'volume').filter(
    (key): key is ClipKey & { value: number } => typeof key.value === 'number'
  )
  if (keys.length === 0) return null

  const durationSeconds = Math.max(0.001, clip.durationMs / 1000)
  const points = keys.map((key) => ({
    t: Math.min(durationSeconds, Math.max(0, key.at * durationSeconds)),
    v: Math.max(0, key.value)
  }))

  let expr = String(points[points.length - 1].v)
  for (let index = points.length - 1; index > 0; index -= 1) {
    const previous = points[index - 1]
    const current = points[index]
    const span = current.t - previous.t
    const segment =
      span <= 0
        ? String(current.v)
        : `(${previous.v}+(${current.v}-${previous.v})*(t-${previous.t})/${span})`
    expr = `if(lt(t,${current.t}),${segment},${expr})`
  }

  expr = `if(lt(t,${points[0].t}),${points[0].v},${expr})`
  return `if(lt(t,${durationSeconds}),${expr},${points[points.length - 1].v})`
}
