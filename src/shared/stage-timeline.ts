import type {
  CameraKeyframe,
  StageCamera,
  StageEasing,
  StageShot,
  StageVec3
} from './stage-schema'

export interface SampledCamera {
  position: StageVec3
  target: StageVec3
  fov: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function easingProgress(
  progress: number,
  easing: StageEasing = 'linear'
): number {
  const t = clamp(progress, 0, 1)
  if (easing === 'easeIn') return t * t * t
  if (easing === 'easeOut') {
    const inverse = 1 - t
    return 1 - inverse * inverse * inverse
  }
  if (easing === 'easeInOut') {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2
  }
  return t
}

function lerpVec(a: StageVec3, b: StageVec3, t: number): StageVec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ]
}

function sampleKeyframe(key: CameraKeyframe): SampledCamera {
  return {
    position: [...key.position],
    target: [...key.target],
    fov: key.fov
  }
}

/**
 * 按时间采样镜头相机：
 * - 无关键帧时使用机位静态状态
 * - 关键帧之间线性插值位置/注视点/FOV，缓动作用于段内进度
 */
export function sampleCameraTrack(
  camera: StageCamera,
  shot: Pick<StageShot, 'durationMs' | 'cameraTrack'>,
  timeMs: number
): SampledCamera {
  const fallback: SampledCamera = {
    position: [...camera.position],
    target: [...camera.target],
    fov: camera.fov
  }

  const track = [...(shot.cameraTrack ?? [])].sort(
    (a, b) => a.timeMs - b.timeMs
  )
  if (track.length === 0) return fallback
  if (track.length === 1) return sampleKeyframe(track[0])

  const time = clamp(timeMs, 0, shot.durationMs)
  if (time <= track[0].timeMs) return sampleKeyframe(track[0])
  const last = track[track.length - 1]
  if (time >= last.timeMs) return sampleKeyframe(last)

  for (let index = 0; index < track.length - 1; index += 1) {
    const from = track[index]
    const to = track[index + 1]
    if (time < from.timeMs || time > to.timeMs) continue

    const span = to.timeMs - from.timeMs
    const raw = span <= 0 ? 1 : (time - from.timeMs) / span
    const progress = easingProgress(raw, from.easing)
    return {
      position: lerpVec(from.position, to.position, progress),
      target: lerpVec(from.target, to.target, progress),
      fov: from.fov + (to.fov - from.fov) * progress
    }
  }

  return fallback
}
