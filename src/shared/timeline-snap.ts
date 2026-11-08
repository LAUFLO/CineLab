import { clipEnd, type TimelineDoc } from './timeline-schema'

/** 在阈值内吸附到最近的目标，否则原样返回 */
export function snapValue(value: number, targets: number[], threshold: number): number {
  let best = value
  let bestDistance = threshold
  for (const target of targets) {
    const distance = Math.abs(value - target)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = target
    }
  }
  return best
}

/** 吸附目标：0、播放头、同轨其他片段的头尾 */
export function snapTargets(
  doc: TimelineDoc,
  trackId: string,
  excludeClipId: string | null,
  playheadMs: number
): number[] {
  const targets = [0, Math.max(0, playheadMs)]
  for (const clip of doc.clips) {
    if (clip.trackId !== trackId || clip.id === excludeClipId) continue
    targets.push(clip.startMs, clipEnd(clip))
  }
  return targets
}
