import type {
  CameraKeyframe,
  CameraTrackSmoothing,
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

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function hermite(
  from: number,
  to: number,
  fromTangent: number,
  toTangent: number,
  u: number,
  dtSeconds: number
): number {
  const u2 = u * u
  const u3 = u2 * u
  return (
    (2 * u3 - 3 * u2 + 1) * from +
    (u3 - 2 * u2 + u) * fromTangent * dtSeconds +
    (-2 * u3 + 3 * u2) * to +
    (u3 - u2) * toTangent * dtSeconds
  )
}

function keyAxis(
  key: CameraKeyframe,
  axis: 'position' | 'target',
  component: number
): number {
  return key[axis][component]
}

function tangentAt(
  track: CameraKeyframe[],
  index: number,
  axis: 'position' | 'target',
  component: number
): number {
  const current = track[index]
  const previous = track[index - 1]
  const next = track[index + 1]

  if (previous && next) {
    const span = (next.timeMs - previous.timeMs) / 1000
    if (span <= 0) return 0
    return (
      (keyAxis(next, axis, component) - keyAxis(previous, axis, component)) /
      span
    )
  }
  if (next) {
    const span = (next.timeMs - current.timeMs) / 1000
    if (span <= 0) return 0
    return (
      (keyAxis(next, axis, component) - keyAxis(current, axis, component)) /
      span
    )
  }
  if (previous) {
    const span = (current.timeMs - previous.timeMs) / 1000
    if (span <= 0) return 0
    return (
      (keyAxis(current, axis, component) - keyAxis(previous, axis, component)) /
      span
    )
  }
  return 0
}

function sampleKeyframe(key: CameraKeyframe): SampledCamera {
  return {
    position: [...key.position],
    target: [...key.target],
    fov: key.fov
  }
}

function sampleLinear(track: CameraKeyframe[], time: number): SampledCamera {
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
  return sampleKeyframe(track[track.length - 1])
}

function sampleHermite(track: CameraKeyframe[], time: number): SampledCamera {
  for (let index = 0; index < track.length - 1; index += 1) {
    const from = track[index]
    const to = track[index + 1]
    if (time < from.timeMs || time > to.timeMs) continue

    const dtSeconds = (to.timeMs - from.timeMs) / 1000
    if (dtSeconds <= 0) return sampleKeyframe(from)
    const u = clamp((time - from.timeMs) / (to.timeMs - from.timeMs), 0, 1)

    const position = [0, 1, 2].map((component) =>
      hermite(
        from.position[component],
        to.position[component],
        tangentAt(track, index, 'position', component),
        tangentAt(track, index + 1, 'position', component),
        u,
        dtSeconds
      )
    ) as StageVec3
    const target = [0, 1, 2].map((component) =>
      hermite(
        from.target[component],
        to.target[component],
        tangentAt(track, index, 'target', component),
        tangentAt(track, index + 1, 'target', component),
        u,
        dtSeconds
      )
    ) as StageVec3
    const fov = from.fov + (to.fov - from.fov) * smoothstep(u)

    return { position, target, fov }
  }
  return sampleKeyframe(track[track.length - 1])
}

/**
 * 在时间轴上采样相机。
 * - 无关键帧：使用机位静态状态
 * - 关键帧之间：默认 Hermite（速度连续），显式 linear 时保留旧 easing 行为
 */
export function sampleCameraTrack(
  camera: StageCamera,
  shot: Pick<StageShot, 'durationMs' | 'cameraTrack' | 'cameraSmoothing'>,
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

  const smoothing: CameraTrackSmoothing =
    shot.cameraSmoothing ?? 'hermite'
  return smoothing === 'linear'
    ? sampleLinear(track, time)
    : sampleHermite(track, time)
}
