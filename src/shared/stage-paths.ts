import type {
  ActionKeyframe,
  ActionTrack,
  CameraKeyframe,
  StageCamera,
  StageEasing,
  StageObject,
  StagePath,
  StagePathTimeKey,
  StageVec3
} from './stage-schema'
import { easingProgress } from './stage-timeline'

const EPSILON = 1e-6

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function vecLerp(a: StageVec3, b: StageVec3, t: number): StageVec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function vecAdd(a: StageVec3, b: StageVec3): StageVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vecScale(a: StageVec3, scale: number): StageVec3 {
  return [a[0] * scale, a[1] * scale, a[2] * scale]
}

function vecDistance(a: StageVec3, b: StageVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function normalizeVec(a: StageVec3): StageVec3 {
  const length = Math.hypot(a[0], a[1], a[2])
  if (length < EPSILON) return [0, 0, 1]
  return [a[0] / length, a[1] / length, a[2] / length]
}

function catmullRom(
  p0: StageVec3,
  p1: StageVec3,
  p2: StageVec3,
  p3: StageVec3,
  t: number
): StageVec3 {
  const t2 = t * t
  const t3 = t2 * t
  const component = (index: 0 | 1 | 2): number =>
    0.5 *
    (2 * p1[index] +
      (-p0[index] + p2[index]) * t +
      (2 * p0[index] - 5 * p1[index] + 4 * p2[index] - p3[index]) * t2 +
      (-p0[index] + 3 * p1[index] - 3 * p2[index] + p3[index]) * t3)
  return [component(0), component(1), component(2)]
}

export function smoothPath(
  points: StageVec3[],
  smooth = 0.5,
  closed = false
): StageVec3[] {
  if (points.length < 2) return points.map((point) => [...point] as StageVec3)
  const blend = clamp(smooth, 0, 1)
  if (blend <= 0) {
    const copy = points.map((point) => [...point] as StageVec3)
    if (closed) copy.push([...points[0]] as StageVec3)
    return copy
  }

  const source = points
  const count = closed ? points.length : points.length - 1
  const samplesPerSegment = 6
  const result: StageVec3[] = []
  const get = (index: number): StageVec3 => {
    if (closed) {
      return source[((index % source.length) + source.length) % source.length]
    }
    return source[clamp(index, 0, source.length - 1)]
  }

  for (let index = 0; index < count; index += 1) {
    const p0 = get(index - 1)
    const p1 = get(index)
    const p2 = get(index + 1)
    const p3 = get(index + 2)
    for (let sample = 0; sample < samplesPerSegment; sample += 1) {
      const t = sample / samplesPerSegment
      const curved = catmullRom(p0, p1, p2, p3, t)
      result.push(vecLerp(p1, curved, blend))
    }
  }
  result.push(closed ? [...points[0]] as StageVec3 : [...points[points.length - 1]] as StageVec3)
  return result
}

export function pathLength(points: StageVec3[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += vecDistance(points[index - 1], points[index])
  }
  return total
}

export function positionAtT(points: StageVec3[], at: number): StageVec3 {
  if (points.length === 0) return [0, 0, 0]
  if (points.length === 1) return [...points[0]]
  const total = pathLength(points)
  if (total < EPSILON) return [...points[0]]
  const target = clamp(at, 0, 1) * total
  let travelled = 0
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const segment = vecDistance(start, end)
    if (segment < EPSILON) continue
    if (travelled + segment >= target) {
      return vecLerp(start, end, (target - travelled) / segment)
    }
    travelled += segment
  }
  return [...points[points.length - 1]]
}

export function tangentAtT(points: StageVec3[], at: number): StageVec3 {
  if (points.length < 2) return [0, 0, 1]
  const epsilon = 0.002
  const before = positionAtT(points, clamp(at - epsilon, 0, 1))
  const after = positionAtT(points, clamp(at + epsilon, 0, 1))
  return normalizeVec([
    after[0] - before[0],
    after[1] - before[1],
    after[2] - before[2]
  ])
}

export function pathPointsWithHeight(path: StagePath): StageVec3[] {
  const offset = path.height ?? 0
  return path.points.map((point) => [
    point.position[0],
    point.position[1] + offset,
    point.position[2]
  ])
}

export function smoothPathPoints(path: StagePath): StageVec3[] {
  return smoothPath(pathPointsWithHeight(path), path.smooth ?? 0.5, path.closed)
}

export function normalizeTimeKeys(
  path: StagePath,
  durationMs: number
): StagePathTimeKey[] {
  const duration = Math.max(1, durationMs)
  const source = [...(path.timeKeys ?? [])]
    .filter(
      (key) =>
        Number.isFinite(key.at) &&
        Number.isFinite(key.timeMs) &&
        key.at >= 0 &&
        key.at <= 1
    )
    .map((key) => ({
      at: clamp(key.at, 0, 1),
      timeMs: clamp(key.timeMs, 0, duration),
      easing: key.easing,
      _hadAt: true
    }))
    .sort((a, b) => a.at - b.at)

  if (source.length < 2) {
    return [
      { at: 0, timeMs: 0, easing: 'linear' },
      { at: 1, timeMs: duration, easing: 'linear' }
    ]
  }

  if (source[0].at > EPSILON) source.unshift({ at: 0, timeMs: 0, easing: 'linear', _hadAt: true })
  if (source[source.length - 1].at < 1 - EPSILON) {
    source.push({ at: 1, timeMs: duration, easing: 'linear', _hadAt: true })
  }

  let previousAt = -1
  let previousTime = -1
  return source.map((key, index) => {
    const at = Math.max(key.at, previousAt + 0.0001, index === 0 ? 0 : key.at)
    previousAt = Math.min(1, at)
    let timeMs = Math.max(key.timeMs, previousTime + 1)
    if (index === source.length - 1) timeMs = Math.max(timeMs, duration)
    timeMs = Math.max(0, Math.min(duration, timeMs))
    previousTime = timeMs
    return {
      at: previousAt,
      timeMs,
      ...(key.easing ? { easing: key.easing } : {})
    }
  })
}

export function atForTime(
  timeKeys: StagePathTimeKey[],
  timeMs: number,
  durationMs: number
): { at: number; easing: StageEasing } {
  const duration = Math.max(1, durationMs)
  const time = clamp(timeMs, 0, duration)
  if (timeKeys.length < 2) return { at: clamp(time / duration, 0, 1), easing: 'linear' }
  if (time <= timeKeys[0].timeMs) {
    return { at: timeKeys[0].at, easing: timeKeys[0].easing ?? 'linear' }
  }
  for (let index = 0; index < timeKeys.length - 1; index += 1) {
    const from = timeKeys[index]
    const to = timeKeys[index + 1]
    if (time < from.timeMs || time > to.timeMs) continue
    const span = to.timeMs - from.timeMs
    const progress = span <= 0 ? 1 : (time - from.timeMs) / span
    const eased = easingProgress(progress, from.easing)
    return {
      at: lerp(from.at, to.at, eased),
      easing: from.easing ?? 'linear'
    }
  }
  return {
    at: timeKeys[timeKeys.length - 1].at,
    easing: timeKeys[timeKeys.length - 1].easing ?? 'linear'
  }
}

function sampleTimes(
  timeKeys: StagePathTimeKey[],
  maxSamples: number
): number[] {
  const times: number[] = []
  for (let index = 0; index < timeKeys.length - 1; index += 1) {
    const from = timeKeys[index].timeMs
    const to = timeKeys[index + 1].timeMs
    const steps = 8
    for (let step = 0; step < steps; step += 1) {
      times.push(lerp(from, to, step / steps))
    }
  }
  times.push(timeKeys[timeKeys.length - 1].timeMs)
  const unique = [...new Set(times.map((time) => Math.round(time)))]
  unique.sort((a, b) => a - b)
  if (unique.length <= maxSamples) return unique

  const reduced: number[] = []
  for (let index = 0; index < maxSamples; index += 1) {
    const position = Math.round((index * (unique.length - 1)) / (maxSamples - 1))
    reduced.push(unique[position])
  }
  return [...new Set(reduced)]
}

export function simplifyPathPoints(
  points: StageVec3[],
  max = 16
): StageVec3[] {
  if (points.length <= max) return points.map((point) => [...point] as StageVec3)
  const result: StageVec3[] = []
  for (let index = 0; index < max; index += 1) {
    const position = Math.round((index * (points.length - 1)) / (max - 1))
    result.push([...points[position]] as StageVec3)
  }
  return result
}

export interface CameraTrackFromPathArgs {
  path: StagePath
  camera: StageCamera
  durationMs: number
  followPath?: StagePath
  followObjectPosition?: (timeMs: number) => StageVec3 | null
  maxKeys?: number
}

export function cameraTrackFromPath(
  args: CameraTrackFromPathArgs
): CameraKeyframe[] {
  const { path, camera, durationMs } = args
  const points = smoothPathPoints(path)
  const total = pathLength(points)
  const followPoints = args.followPath ? smoothPathPoints(args.followPath) : null
  const timeKeys = normalizeTimeKeys(path, durationMs)
  const times = sampleTimes(timeKeys, args.maxKeys ?? 100)
  const lookAhead = clamp(path.lookAhead ?? 2, 0.1, 50)
  const targetMode = path.targetMode ?? 'ahead'

  return times.map((timeMs) => {
    const sampled = atForTime(timeKeys, timeMs, durationMs)
    const position = positionAtT(points, sampled.at)
    let target: StageVec3
    if (targetMode === 'fixed') {
      target = [...camera.target]
    } else if (targetMode === 'follow') {
      target =
        (followPoints ? positionAtT(followPoints, sampled.at) : null) ??
        args.followObjectPosition?.(timeMs) ??
        [...camera.target]
    } else {
      const aheadAt = clamp(
        sampled.at + (total > EPSILON ? lookAhead / total : 0),
        0,
        1
      )
      target = positionAtT(points, aheadAt)
      if (vecDistance(position, target) < 0.01) {
        const tangent = tangentAtT(points, 1)
        target = vecAdd(position, vecScale(tangent, 0.2))
      }
    }
    return {
      timeMs,
      position,
      target,
      fov: camera.fov,
      easing: sampled.easing,
      source: 'path' as const
    }
  })
}

export function mergeCameraTrack(
  existing: CameraKeyframe[] | undefined,
  generated: CameraKeyframe[],
  keepManual = true
): CameraKeyframe[] {
  const manual = keepManual
    ? (existing ?? []).filter((key) => key.source !== 'path')
    : []
  const filteredGenerated = generated.filter(
    (key) =>
      !manual.some((manualKey) => Math.abs(manualKey.timeMs - key.timeMs) <= 16)
  )
  return [...filteredGenerated, ...manual].sort((a, b) => a.timeMs - b.timeMs)
}

export interface ActionTrackFromPathArgs {
  path: StagePath
  object: StageObject
  durationMs: number
  maxKeys?: number
}

export function actionTrackFromPath(
  args: ActionTrackFromPathArgs
): ActionTrack {
  const { path, object, durationMs } = args
  const points = smoothPathPoints(path)
  const timeKeys = normalizeTimeKeys(path, durationMs)
  const times = sampleTimes(timeKeys, args.maxKeys ?? 500)
  const faceTangent = path.faceTangent !== false
  const rotationOffset = path.rotationOffset ?? 0

  const keys: ActionKeyframe[] = times.map((timeMs) => {
    const sampled = atForTime(timeKeys, timeMs, durationMs)
    const position = positionAtT(points, sampled.at)
    if (!faceTangent) {
      return { timeMs, position, easing: sampled.easing }
    }
    const tangent = tangentAtT(points, sampled.at)
    const yaw = Math.atan2(tangent[0], tangent[2]) + rotationOffset
    return {
      timeMs,
      position,
      rotation: [object.transform.rotation[0], yaw, object.transform.rotation[2]],
      easing: sampled.easing
    }
  })

  return { objectId: path.objectId ?? object.id, keys }
}

function positionAtActionKeys(
  keys: ActionKeyframe[],
  timeMs: number
): { position?: StageVec3; rotation?: StageVec3 } {
  if (keys.length === 0) return {}
  const sorted = [...keys].sort((a, b) => a.timeMs - b.timeMs)
  if (timeMs <= sorted[0].timeMs) {
    return { position: sorted[0].position, rotation: sorted[0].rotation }
  }
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index]
    const to = sorted[index + 1]
    if (timeMs < from.timeMs || timeMs > to.timeMs) continue
    const span = to.timeMs - from.timeMs
    const progress = span <= 0 ? 1 : (timeMs - from.timeMs) / span
    return {
      position:
        from.position && to.position
          ? vecLerp(from.position, to.position, progress)
          : from.position ?? to.position,
      rotation:
        from.rotation && to.rotation
          ? vecLerp(from.rotation, to.rotation, progress)
          : from.rotation ?? to.rotation
    }
  }
  const last = sorted[sorted.length - 1]
  return { position: last.position, rotation: last.rotation }
}

export function mergeActionTrack(
  existing: ActionTrack | undefined,
  generated: ActionTrack
): ActionTrack {
  const poseKeys = (existing?.keys ?? []).filter(
    (key) => key.pose && (!key.position || !key.rotation)
  )
  if (poseKeys.length === 0) return generated

  const keys = [...generated.keys]
  for (const poseKey of poseKeys) {
    const nearest = keys.reduce<ActionKeyframe | null>((best, key) => {
      if (!best) return key
      return Math.abs(key.timeMs - poseKey.timeMs) <
        Math.abs(best.timeMs - poseKey.timeMs)
        ? key
        : best
    }, null)
    if (nearest && Math.abs(nearest.timeMs - poseKey.timeMs) <= 80) {
      nearest.pose = poseKey.pose
      continue
    }
    const sampled = positionAtActionKeys(keys, poseKey.timeMs)
    keys.push({
      timeMs: poseKey.timeMs,
      ...(sampled.position ? { position: sampled.position } : {}),
      ...(sampled.rotation ? { rotation: sampled.rotation } : {}),
      pose: poseKey.pose,
      ...(poseKey.easing ? { easing: poseKey.easing } : {})
    })
  }
  return { objectId: generated.objectId, keys: keys.sort((a, b) => a.timeMs - b.timeMs) }
}

export function poseOnlyActionTrack(
  existing: ActionTrack | undefined,
  objectId: string
): ActionTrack | null {
  const keys = (existing?.keys ?? []).filter((key) => key.pose)
  if (keys.length === 0) return null
  return { objectId, keys }
}

export function scalePathTimes(
  paths: StagePath[] | undefined,
  oldDurationMs: number,
  newDurationMs: number
): StagePath[] | undefined {
  if (!paths || paths.length === 0) return paths
  const oldDuration = Math.max(1, oldDurationMs)
  const newDuration = Math.max(1, newDurationMs)
  const ratio = newDuration / oldDuration
  return paths.map((path) => {
    if (!path.timeKeys || path.timeKeys.length === 0) return path
    let previous = -1
    const timeKeys = path.timeKeys.map((key) => {
      const timeMs = Math.min(
        newDuration,
        Math.max(previous + 1, Math.round(key.timeMs * ratio))
      )
      previous = timeMs
      return { ...key, timeMs }
    })
    return { ...path, timeKeys }
  })
}

export function pathColor(kind: StagePath['kind']): string {
  if (kind === 'object') return '#4ade80'
  if (kind === 'follow') return '#f59e0b'
  return '#60a5fa'
}
