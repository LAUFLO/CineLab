import type { TransitionIn } from './timeline-schema'

export interface TransitionState {
  progress: number
  incomingAlpha: number
  outgoingAlpha: number
  blackAlpha: number
}

/**
 * 计算片段头部转场的混合权重。
 * - fade：上一片段与当前片段交叉淡化
 * - dip-black：先淡到黑，再从黑淡入
 */
export function transitionState(
  transition: TransitionIn | undefined,
  localMs: number
): TransitionState | null {
  if (!transition || transition.durationMs <= 0) return null
  if (localMs < 0 || localMs >= transition.durationMs) return null

  const progress = Math.min(1, Math.max(0, localMs / transition.durationMs))

  if (transition.type === 'fade') {
    return {
      progress,
      incomingAlpha: progress,
      outgoingAlpha: 1 - progress,
      blackAlpha: 0
    }
  }

  return {
    progress,
    incomingAlpha: progress < 0.5 ? 0 : (progress - 0.5) * 2,
    outgoingAlpha: progress < 0.5 ? 1 - progress * 2 : 0,
    blackAlpha: 1 - Math.abs(progress * 2 - 1)
  }
}
