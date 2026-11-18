import type { SceneDraft } from './scene-draft'

export interface DepthStats {
  width: number
  height: number
  /** 地平线在画面中的纵向位置，0 = 顶部，1 = 底部 */
  horizonY?: number
  /** 地面区域开始的位置，0 = 顶部，1 = 底部 */
  groundY?: number
  /** 深度中位数（米），用于粗略尺度 */
  medianDepth?: number
}

export interface CalibratedScene {
  camera: {
    heightM: number
    pitchDeg: number
    fovDeg: number
  }
  /** 相对尺度；1 表示按默认世界尺寸 */
  scale: number
  confidence: 'high' | 'medium' | 'low'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function calibrateScene(
  draft: SceneDraft,
  depth: DepthStats
): CalibratedScene {
  const fovDeg = clamp(draft.camera.fovHintDeg ?? 50, 20, 90)

  const horizonY =
    draft.camera.horizonY ??
    depth.horizonY ??
    (draft.camera.heightHint === 'high' ? 0.35 : 0.45)

  const heightM =
    draft.camera.heightHint === 'floor'
      ? 0.4
      : draft.camera.heightHint === 'high'
        ? 2.4
        : 1.6

  const pitchDeg = clamp((0.5 - horizonY) * 60, -30, 30)

  const medianDepth =
    typeof depth.medianDepth === 'number' && depth.medianDepth > 0
      ? depth.medianDepth
      : null
  const scale = medianDepth
    ? clamp(5 / medianDepth, 0.3, 3)
    : 1

  const confidence =
    draft.camera.horizonY !== undefined &&
    draft.camera.fovHintDeg !== undefined
      ? 'high'
      : depth.horizonY !== undefined
        ? 'medium'
        : 'low'

  return {
    camera: { heightM, pitchDeg, fovDeg },
    scale,
    confidence
  }
}
