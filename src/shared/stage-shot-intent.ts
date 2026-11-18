import type {
  ActionTrack,
  CameraKeyframe,
  DirectorStageDoc,
  StageCameraAim,
  StageCameraDistance,
  StageCameraHeight,
  StageCameraRelation,
  StageShot,
  StageShotIntentKey,
  StageVec3
} from './stage-schema'
import { easingProgress } from './stage-timeline'

export interface StageShotSolveResult {
  track: CameraKeyframe[]
  notes: string[]
}

const DISTANCE_M: Record<StageCameraDistance, number> = {
  close: 1.5,
  medium: 2.5,
  far: 4
}
const HEIGHT_M: Record<StageCameraHeight, number> = {
  floor: 0.4,
  low: 0.9,
  eye: 1.6,
  high: 2.4,
  crane: 3.2
}
const AIM_H: Record<StageCameraAim, number> = {
  feet: 0.25,
  body: 1.2,
  face: 1.7
}
const RELATION_DEG: Record<
  Exclude<StageCameraRelation, 'over_shoulder' | 'hold'>,
  number
> = {
  front: 0,
  front_side: 45,
  side: 90,
  back_side: 135,
  behind: 160
}

const DEG = Math.PI / 180
const DEFAULT_FOV = 50
const MAX_GROUP = 8
const MAX_KEYS = 100
const MAX_DISTANCE_M = 12
const MIN_DISTANCE_M = 1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec(a: StageVec3, b: StageVec3, t: number): StageVec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function direction(yaw: number): StageVec3 {
  return [Math.sin(yaw), 0, -Math.cos(yaw)]
}

function rotateY(v: StageVec3, radians: number): StageVec3 {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return [v[0] * cos - v[2] * sin, 0, v[0] * sin + v[2] * cos]
}

interface ActionSample {
  position?: StageVec3
  rotation?: StageVec3
}

function sampleActionTrack(
  track: ActionTrack | undefined,
  timeMs: number
): ActionSample | null {
  if (!track || track.keys.length === 0) return null
  const keys = [...track.keys].sort((a, b) => a.timeMs - b.timeMs)
  if (timeMs <= keys[0].timeMs) return keys[0]
  const last = keys[keys.length - 1]
  if (timeMs >= last.timeMs) return last

  for (let index = 0; index < keys.length - 1; index += 1) {
    const from = keys[index]
    const to = keys[index + 1]
    if (timeMs < from.timeMs || timeMs > to.timeMs) continue
    const span = to.timeMs - from.timeMs
    const raw = span <= 0 ? 1 : (timeMs - from.timeMs) / span
    const progress = easingProgress(raw, from.easing)
    return {
      position:
        from.position && to.position
          ? lerpVec(from.position, to.position, progress)
          : (from.position ?? to.position),
      rotation:
        from.rotation && to.rotation
          ? lerpVec(from.rotation, to.rotation, progress)
          : (from.rotation ?? to.rotation)
    }
  }
  return last
}

interface SubjectPose {
  id: string
  position: StageVec3
  yaw: number
}

function subjectPose(
  doc: DirectorStageDoc,
  shot: StageShot,
  id: string,
  timeMs: number
): SubjectPose | null {
  const object = doc.objects.find((item) => item.id === id)
  if (!object) return null

  const track = shot.actionTracks?.find((item) => item.objectId === id)
  const current = sampleActionTrack(track, timeMs)
  const position = current?.position ?? object.transform.position

  let yaw = current?.rotation?.[1] ?? object.transform.rotation[1] ?? 0
  if (!current?.rotation && track) {
    const before = sampleActionTrack(track, Math.max(0, timeMs - 100))
    const after = sampleActionTrack(track, timeMs + 100)
    if (before?.position && after?.position) {
      const dx = after.position[0] - before.position[0]
      const dz = after.position[2] - before.position[2]
      if (Math.hypot(dx, dz) > 0.01) {
        yaw = Math.atan2(dx, -dz)
      }
    }
  }

  return { id, position, yaw }
}

interface Framing {
  position: StageVec3
  target: StageVec3
}

function aimPoint(pose: SubjectPose, aim: StageCameraAim): StageVec3 {
  return [pose.position[0], pose.position[1] + AIM_H[aim], pose.position[2]]
}

function singleFraming(
  subject: SubjectPose,
  key: StageShotIntentKey,
  toward: SubjectPose | null,
  fov: number,
  notes: string[]
): Framing {
  const aim = key.aim ?? 'body'
  const height = key.height ?? 'eye'
  const distance = DISTANCE_M[key.distance ?? 'medium']
  const sideSign = key.side === 'left' ? -1 : 1
  const offset = (key.angleOffsetDeg ?? 0) * DEG

  if (key.relation === 'over_shoulder') {
    const lookAt = toward ?? subject
    if (!toward) notes.push('过肩镜头没有找到看向的对象，已改为拍主体正面。')
    const angle = subject.yaw + Math.PI + sideSign * 0.25 + offset
    const position = direction(angle).map(
      (value, axis) =>
        axis === 1
          ? HEIGHT_M[height]
          : subject.position[axis] + value * distance
    ) as StageVec3
    return { position, target: aimPoint(lookAt, aim) }
  }

  const relationDeg =
    key.relation === 'hold' ? 0 : RELATION_DEG[key.relation]
  const angle = subject.yaw + sideSign * relationDeg * DEG + offset
  const position = direction(angle).map(
    (value, axis) =>
      axis === 1
        ? HEIGHT_M[height]
        : subject.position[axis] + value * distance
  ) as StageVec3
  return { position, target: aimPoint(subject, aim) }
}

function twoShotFraming(
  subjects: SubjectPose[],
  key: StageShotIntentKey,
  fov: number,
  notes: string[]
): Framing {
  const [first, second] = subjects
  const aim = key.aim ?? 'body'
  const height = key.height ?? 'eye'
  const base = DISTANCE_M[key.distance ?? 'medium']

  const mid: StageVec3 = [
    (first.position[0] + second.position[0]) / 2,
    (first.position[1] + second.position[1]) / 2,
    (first.position[2] + second.position[2]) / 2
  ]
  const dx = second.position[0] - first.position[0]
  const dz = second.position[2] - first.position[2]
  const width = Math.hypot(dx, dz)
  const normal: StageVec3 =
    width > 1e-6 ? [-dz / width, 0, dx / width] : [1, 0, 0]
  const sideSign = key.side === 'left' ? 1 : -1
  const angle = (key.angleOffsetDeg ?? 0) * DEG
  const rotated = rotateY(normal, angle)

  const fitDistance =
    ((width + 1) / (2 * Math.tan((fov * DEG) / 2))) * 1.2
  const distance = clamp(
    Math.max(base, fitDistance, MIN_DISTANCE_M),
    MIN_DISTANCE_M,
    MAX_DISTANCE_M
  )
  if (fitDistance > base + 0.05) {
    notes.push(
      `两人间距约 ${width.toFixed(1)} 米，已把机位拉远到 ${distance.toFixed(1)} 米，保证两人都在画面内。`
    )
  }

  const position: StageVec3 = [
    mid[0] + rotated[0] * distance * sideSign,
    HEIGHT_M[height],
    mid[2] + rotated[2] * distance * sideSign
  ]
  return { position, target: aimPoint({ ...first, position: mid }, aim) }
}

function groupFraming(
  subjects: SubjectPose[],
  key: StageShotIntentKey,
  fov: number,
  notes: string[]
): Framing {
  const aim = key.aim ?? 'body'
  const height = key.height ?? 'eye'
  const base = DISTANCE_M[key.distance ?? 'medium']
  const center: StageVec3 = [
    subjects.reduce((sum, item) => sum + item.position[0], 0) /
      subjects.length,
    subjects.reduce((sum, item) => sum + item.position[1], 0) /
      subjects.length,
    subjects.reduce((sum, item) => sum + item.position[2], 0) /
      subjects.length
  ]
  const radius = Math.max(
    ...subjects.map((item) =>
      Math.hypot(
        item.position[0] - center[0],
        item.position[2] - center[2]
      )
    ),
    0.5
  )
  const fitDistance =
    ((2 * radius + 1) / (2 * Math.tan((fov * DEG) / 2))) * 1.2
  const distance = clamp(
    Math.max(base, fitDistance, MIN_DISTANCE_M),
    MIN_DISTANCE_M,
    MAX_DISTANCE_M
  )
  if (fitDistance > base + 0.05) {
    notes.push(
      `群体范围约 ${(radius * 2).toFixed(1)} 米，已把机位拉远到 ${distance.toFixed(1)} 米。`
    )
  }

  const angle = (key.angleOffsetDeg ?? 0) * DEG
  const offset = direction(angle)
  const position: StageVec3 = [
    center[0] + offset[0] * distance,
    HEIGHT_M[height],
    center[2] + offset[2] * distance
  ]
  return { position, target: aimPoint({ ...subjects[0], position: center }, aim) }
}

function framingFor(
  doc: DirectorStageDoc,
  shot: StageShot,
  key: StageShotIntentKey,
  timeMs: number,
  fov: number,
  notes: string[]
): Framing {
  const subjects = key.subjectIds
    .map((id) => subjectPose(doc, shot, id, timeMs))
    .filter((item): item is SubjectPose => item !== null)

  if (subjects.length === 0) {
    throw new Error('语义镜头的主体不存在')
  }

  if (key.framing === 'single') {
    const toward = key.towardId
      ? subjectPose(doc, shot, key.towardId, timeMs)
      : null
    return singleFraming(subjects[0], key, toward, fov, notes)
  }
  if (key.framing === 'two_shot') {
    return twoShotFraming(subjects.slice(0, 2), key, fov, notes)
  }
  return groupFraming(subjects.slice(0, MAX_GROUP), key, fov, notes)
}

function keyAtTime(
  keys: StageShotIntentKey[],
  timeMs: number
): StageShotIntentKey {
  let current = keys[0]
  for (const key of keys) {
    if (key.timeMs <= timeMs) current = key
    else break
  }
  return current
}

function validateKey(
  doc: DirectorStageDoc,
  key: StageShotIntentKey,
  index: number
): void {
  if (!Array.isArray(key.subjectIds) || key.subjectIds.length === 0) {
    throw new Error(`语义镜头第 ${index + 1} 个关键帧缺少主体`)
  }
  for (const id of key.subjectIds) {
    if (!doc.objects.some((object) => object.id === id)) {
      throw new Error(`语义镜头第 ${index + 1} 个关键帧的主体 ${id} 不存在`)
    }
  }
  if (key.framing === 'single' && key.subjectIds.length !== 1) {
    throw new Error('single 构图只能有 1 个主体')
  }
  if (key.framing === 'two_shot' && key.subjectIds.length !== 2) {
    throw new Error('two_shot 构图必须有 2 个主体')
  }
  if (
    key.framing === 'group' &&
    key.subjectIds.length < 2
  ) {
    throw new Error(`group 构图需要 2–${MAX_GROUP} 个主体`)
  }
  if (key.relation === 'over_shoulder') {
    if (!key.towardId) throw new Error('over_shoulder 需要 towardId')
    if (!doc.objects.some((object) => object.id === key.towardId)) {
      throw new Error(`over_shoulder 的 towardId ${key.towardId} 不存在`)
    }
  } else if (key.towardId) {
    throw new Error('towardId 只能用于 over_shoulder')
  }
}

export function solveStageShotIntent(
  doc: DirectorStageDoc,
  shot: StageShot,
  options: { maxKeys?: number } = {}
): StageShotSolveResult {
  const intent = shot.intent
  if (!intent || intent.keys.length === 0) {
    return { track: [], notes: ['这个镜头还没有语义关键帧。'] }
  }

  const keys = [...intent.keys].sort((a, b) => a.timeMs - b.timeMs)
  const notes: string[] = []
  keys.forEach((key, index) => validateKey(doc, key, index))
  keys.forEach((key) => {
    if (
      key.framing === 'group' &&
      key.subjectIds.length > MAX_GROUP
    ) {
      notes.push(`群体主体超过 ${MAX_GROUP} 个，只使用前 ${MAX_GROUP} 个。`)
    }
  })

  const camera = doc.cameras.find((item) => item.id === shot.cameraId)
  const baseFov = camera?.fov ?? DEFAULT_FOV
  const maxKeys = clamp(options.maxKeys ?? MAX_KEYS, 2, MAX_KEYS)
  const duration = shot.durationMs
  const stepSec = clamp(duration / 1000 / 90, 0.15, 0.5)
  const stepMs = stepSec * 1000

  const track: CameraKeyframe[] = []
  for (let timeMs = 0; timeMs <= duration + 1e-6; timeMs += stepMs) {
    const key = keyAtTime(keys, timeMs)
    const fov = key.fovDeg ?? baseFov
    const framing = framingFor(doc, shot, key, timeMs, fov, notes)
    track.push({
      timeMs: Math.round(timeMs),
      position: framing.position,
      target: framing.target,
      fov,
      easing: 'linear'
    })
  }

  if (track.length === 0 || track[track.length - 1].timeMs < duration) {
    const key = keyAtTime(keys, duration)
    const fov = key.fovDeg ?? baseFov
    const framing = framingFor(doc, shot, key, duration, fov, notes)
    track.push({
      timeMs: duration,
      position: framing.position,
      target: framing.target,
      fov,
      easing: 'linear'
    })
  }

  if (track.length > maxKeys) {
    const sampled: CameraKeyframe[] = []
    const stride = (track.length - 1) / (maxKeys - 1)
    for (let index = 0; index < maxKeys; index += 1) {
      sampled.push(track[Math.round(index * stride)])
    }
    track.length = 0
    track.push(...sampled)
  }

  return { track, notes: [...new Set(notes)] }
}
