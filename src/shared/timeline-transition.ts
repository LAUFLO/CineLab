import type { TransitionIn } from './timeline-schema'

export interface TransitionState {
  type: TransitionIn['type']
  progress: number
  incomingAlpha: number
  outgoingAlpha: number
  blackAlpha: number
}

/**
 * 计算片段头部转场的混合权重。
 * - fade：上一片段与当前片段交叉淡化
 * - dip-black：先淡到黑，再从黑淡入
 * - wipe / slide / zoom：渲染器按 type + progress 做擦除、位移或缩放
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
      type: 'fade',
      progress,
      incomingAlpha: progress,
      outgoingAlpha: 1 - progress,
      blackAlpha: 0
    }
  }

  if (transition.type === 'dip-black') {
    return {
      type: 'dip-black',
      progress,
      incomingAlpha: progress < 0.5 ? 0 : (progress - 0.5) * 2,
      outgoingAlpha: progress < 0.5 ? 1 - progress * 2 : 0,
      blackAlpha: 1 - Math.abs(progress * 2 - 1)
    }
  }

  if (transition.type === 'zoom-in') {
    return {
      type: 'zoom-in',
      progress,
      incomingAlpha: progress,
      outgoingAlpha: 1 - progress,
      blackAlpha: 0
    }
  }

  return {
    type: transition.type,
    progress,
    incomingAlpha: 1,
    outgoingAlpha: 1,
    blackAlpha: 0
  }
}
