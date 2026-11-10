import type { StageAspect, StageShot } from './stage-schema'

export type StagePreviewResolution = '720p' | '1080p'

export interface StagePreviewSize {
  width: number
  height: number
}

/** H.264 要求宽高为偶数 */
function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

export function stagePreviewSize(
  aspect: StageAspect,
  resolution: StagePreviewResolution
): StagePreviewSize {
  if (aspect === '9:16') {
    return resolution === '1080p'
      ? { width: 1080, height: 1920 }
      : { width: 720, height: 1280 }
  }
  if (aspect === '1:1') {
    const base = resolution === '1080p' ? 1080 : 720
    return { width: base, height: base }
  }
  return resolution === '1080p'
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 }
}

export function stagePreviewFrameCount(
  durationMs: number,
  fps: number
): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1
  if (!Number.isFinite(fps) || fps <= 0) return 1
  return Math.max(1, Math.ceil((durationMs / 1000) * fps))
}

export function previewSizeForShot(
  shot: Pick<StageShot, 'aspect'>,
  resolution: StagePreviewResolution
): StagePreviewSize {
  return stagePreviewSize(shot.aspect, resolution)
}

export function evenSize(size: StagePreviewSize): StagePreviewSize {
  return { width: even(size.width), height: even(size.height) }
}
