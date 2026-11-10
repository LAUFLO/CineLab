export type StageVec3 = [number, number, number]

export type StageAspect = '16:9' | '9:16' | '1:1'

export type StageEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export type StageObjectType =
  | 'human'
  | 'box'
  | 'sphere'
  | 'plane'
  | 'gltf'
  | 'crowd'

export type StageBackgroundKind = 'color' | 'panorama' | 'model'

export interface StageTransform {
  position: StageVec3
  rotation: StageVec3
  scale: StageVec3
}

export interface StageObject {
  id: string
  type: StageObjectType
  name: string
  transform: StageTransform
  pose?: string
  color?: string
  visible?: boolean
  parentId?: string
  /** gltf 资源的项目内相对路径 */
  assetPath?: string
  /** 群众阵列数量；仅 crowd 使用 */
  count?: number
}

export interface StageCamera {
  id: string
  name: string
  position: StageVec3
  target: StageVec3
  fov: number
  aspect?: StageAspect
}

export interface CameraKeyframe {
  timeMs: number
  position: StageVec3
  target: StageVec3
  fov: number
  easing?: StageEasing
}

export interface ActionKeyframe {
  timeMs: number
  position?: StageVec3
  rotation?: StageVec3
  pose?: string
  easing?: StageEasing
}

export interface ActionTrack {
  objectId: string
  keys: ActionKeyframe[]
}

export interface StageShot {
  id: string
  name?: string
  cameraId: string
  durationMs: number
  aspect: StageAspect
  cameraTrack?: CameraKeyframe[]
  actionTracks?: ActionTrack[]
}

export interface StageBackground {
  kind: StageBackgroundKind
  value: string
}

export interface DirectorStageDoc {
  version: 1
  stageId: string
  name: string
  background: StageBackground
  objects: StageObject[]
  cameras: StageCamera[]
  shots: StageShot[]
  activeCameraId?: string
  updatedAt: string
}

export interface PreviewOptions {
  resolution: '720p' | '1080p'
  fps: 24 | 30
  format: 'mp4'
}

export const DEFAULT_PREVIEW_OPTIONS: PreviewOptions = {
  resolution: '720p',
  fps: 24,
  format: 'mp4'
}

export const STAGE_ASPECTS: StageAspect[] = ['16:9', '9:16', '1:1']
export const STAGE_EASINGS: StageEasing[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut'
]
export const STAGE_OBJECT_TYPES: StageObjectType[] = [
  'human',
  'box',
  'sphere',
  'plane',
  'gltf',
  'crowd'
]

export const STAGE_POSE_PRESETS = [
  'stand',
  'sit',
  'walk',
  'run',
  'kneel',
  'reach',
  'confront',
  'lookBack'
] as const

export type StagePosePreset = (typeof STAGE_POSE_PRESETS)[number]

export const STAGE_LIMITS = {
  maxObjects: 500,
  maxCameras: 24,
  maxShots: 100,
  maxCameraTrackKeys: 100,
  maxActionTrackKeys: 500,
  maxDurationMs: 15_000,
  maxNameLength: 100,
  maxStageNameLength: 200
} as const

export const DEFAULT_STAGE_TRANSFORM: StageTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
}

export function createStageId(prefix = 'stage'): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${suffix}`
}

export function createStageDoc(
  stageId = createStageId(),
  name = '未命名场景'
): DirectorStageDoc {
  return {
    version: 1,
    stageId,
    name,
    background: { kind: 'color', value: '#1a1a1a' },
    objects: [],
    cameras: [],
    shots: [],
    updatedAt: new Date().toISOString()
  }
}

export function cloneStageDoc(doc: DirectorStageDoc): DirectorStageDoc {
  return structuredClone(doc)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isVec3(value: unknown): value is StageVec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => isFiniteNumber(item))
  )
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  )
}

function validateTransform(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是变换对象`)
    return
  }
  for (const key of ['position', 'rotation', 'scale'] as const) {
    if (!isVec3(value[key])) {
      errors.push(`${path}.${key} 必须是 3 个有限数字`)
    }
  }
}

function validateCameraFields(
  camera: Record<string, unknown>,
  path: string,
  errors: string[]
): void {
  if (!isNonEmptyString(camera.name, STAGE_LIMITS.maxNameLength)) {
    errors.push(`${path}.name 无效`)
  }
  if (!isVec3(camera.position)) {
    errors.push(`${path}.position 必须是 3 个有限数字`)
  }
  if (!isVec3(camera.target)) {
    errors.push(`${path}.target 必须是 3 个有限数字`)
  }
  if (
    !isFiniteNumber(camera.fov) ||
    camera.fov < 10 ||
    camera.fov > 120
  ) {
    errors.push(`${path}.fov 必须在 10-120 之间`)
  }
  if (
    camera.aspect !== undefined &&
    !STAGE_ASPECTS.includes(camera.aspect as StageAspect)
  ) {
    errors.push(`${path}.aspect 无效`)
  }
}

function validateShot(
  shot: Record<string, unknown>,
  path: string,
  cameraIds: Set<string>,
  objectIds: Set<string>,
  errors: string[]
): void {
  if (!isNonEmptyString(shot.id, STAGE_LIMITS.maxNameLength)) {
    errors.push(`${path}.id 无效`)
  }
  if (
    shot.name !== undefined &&
    !isNonEmptyString(shot.name, STAGE_LIMITS.maxNameLength)
  ) {
    errors.push(`${path}.name 无效`)
  }
  if (typeof shot.cameraId !== 'string' || !cameraIds.has(shot.cameraId)) {
    errors.push(`${path}.cameraId 不存在`)
  }
  if (
    !isFiniteNumber(shot.durationMs) ||
    shot.durationMs < 1 ||
    shot.durationMs > STAGE_LIMITS.maxDurationMs
  ) {
    errors.push(
      `${path}.durationMs 必须在 1-${STAGE_LIMITS.maxDurationMs} 之间`
    )
  }
  if (!STAGE_ASPECTS.includes(shot.aspect as StageAspect)) {
    errors.push(`${path}.aspect 无效`)
  }

  if (shot.cameraTrack !== undefined) {
    if (!Array.isArray(shot.cameraTrack)) {
      errors.push(`${path}.cameraTrack 必须是数组`)
    } else if (shot.cameraTrack.length > STAGE_LIMITS.maxCameraTrackKeys) {
      errors.push(`${path}.cameraTrack 关键帧过多`)
    } else {
      const duration = isFiniteNumber(shot.durationMs)
        ? shot.durationMs
        : STAGE_LIMITS.maxDurationMs
      shot.cameraTrack.forEach((key, index) => {
        const keyPath = `${path}.cameraTrack[${index}]`
        if (!isRecord(key)) {
          errors.push(`${keyPath} 必须是对象`)
          return
        }
        if (
          !isFiniteNumber(key.timeMs) ||
          key.timeMs < 0 ||
          key.timeMs > duration
        ) {
          errors.push(`${keyPath}.timeMs 超出镜头时长`)
        }
        if (!isVec3(key.position)) errors.push(`${keyPath}.position 无效`)
        if (!isVec3(key.target)) errors.push(`${keyPath}.target 无效`)
        if (!isFiniteNumber(key.fov) || key.fov < 10 || key.fov > 120) {
          errors.push(`${keyPath}.fov 必须在 10-120 之间`)
        }
        if (
          key.easing !== undefined &&
          !STAGE_EASINGS.includes(key.easing as StageEasing)
        ) {
          errors.push(`${keyPath}.easing 无效`)
        }
      })
    }
  }

  if (shot.actionTracks !== undefined) {
    if (!Array.isArray(shot.actionTracks)) {
      errors.push(`${path}.actionTracks 必须是数组`)
    } else {
      shot.actionTracks.forEach((track, index) => {
        const trackPath = `${path}.actionTracks[${index}]`
        if (!isRecord(track)) {
          errors.push(`${trackPath} 必须是对象`)
          return
        }
        if (
          typeof track.objectId !== 'string' ||
          !objectIds.has(track.objectId)
        ) {
          errors.push(`${trackPath}.objectId 不存在`)
        }
        if (!Array.isArray(track.keys)) {
          errors.push(`${trackPath}.keys 必须是数组`)
          return
        }
        if (track.keys.length > STAGE_LIMITS.maxActionTrackKeys) {
          errors.push(`${trackPath}.keys 关键帧过多`)
        }
        const duration = isFiniteNumber(shot.durationMs)
          ? shot.durationMs
          : STAGE_LIMITS.maxDurationMs
        track.keys.forEach((key, keyIndex) => {
          const keyPath = `${trackPath}.keys[${keyIndex}]`
          if (!isRecord(key)) {
            errors.push(`${keyPath} 必须是对象`)
            return
          }
          if (
            !isFiniteNumber(key.timeMs) ||
            key.timeMs < 0 ||
            key.timeMs > duration
          ) {
            errors.push(`${keyPath}.timeMs 超出镜头时长`)
          }
          if (key.position !== undefined && !isVec3(key.position)) {
            errors.push(`${keyPath}.position 无效`)
          }
          if (key.rotation !== undefined && !isVec3(key.rotation)) {
            errors.push(`${keyPath}.rotation 无效`)
          }
          if (
            key.pose !== undefined &&
            !isNonEmptyString(key.pose, STAGE_LIMITS.maxNameLength)
          ) {
            errors.push(`${keyPath}.pose 无效`)
          }
          if (
            key.easing !== undefined &&
            !STAGE_EASINGS.includes(key.easing as StageEasing)
          ) {
            errors.push(`${keyPath}.easing 无效`)
          }
        })
      })
    }
  }
}

/** 校验场景文档；返回空数组表示有效 */
export function validateStageDoc(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['场景文档必须是对象']
  if (value.version !== 1) errors.push('不支持的场景版本')
  if (!isNonEmptyString(value.stageId, STAGE_LIMITS.maxNameLength)) {
    errors.push('stageId 无效')
  }
  if (!isNonEmptyString(value.name, STAGE_LIMITS.maxStageNameLength)) {
    errors.push('场景名称无效')
  }
  if (!isRecord(value.background)) {
    errors.push('background 必须是对象')
  } else {
    if (
      !['color', 'panorama', 'model'].includes(
        String(value.background.kind)
      )
    ) {
      errors.push('background.kind 无效')
    }
    if (
      !isNonEmptyString(value.background.value, 2048)
    ) {
      errors.push('background.value 无效')
    }
  }

  for (const key of ['objects', 'cameras', 'shots'] as const) {
    if (!Array.isArray(value[key])) errors.push(`${key} 必须是数组`)
  }
  if (errors.length > 0) return errors

  const objects = value.objects as unknown[]
  const cameras = value.cameras as unknown[]
  const shots = value.shots as unknown[]

  if (objects.length > STAGE_LIMITS.maxObjects) errors.push('对象数量超过上限')
  if (cameras.length > STAGE_LIMITS.maxCameras) errors.push('机位数量超过上限')
  if (shots.length > STAGE_LIMITS.maxShots) errors.push('镜头数量超过上限')

  const objectIds = new Set<string>()
  objects.forEach((object, index) => {
    const path = `objects[${index}]`
    if (!isRecord(object)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    if (!isNonEmptyString(object.id, STAGE_LIMITS.maxNameLength)) {
      errors.push(`${path}.id 无效`)
    } else if (objectIds.has(object.id)) {
      errors.push(`${path}.id 重复`)
    } else {
      objectIds.add(object.id)
    }
    if (!STAGE_OBJECT_TYPES.includes(object.type as StageObjectType)) {
      errors.push(`${path}.type 无效`)
    }
    if (!isNonEmptyString(object.name, STAGE_LIMITS.maxNameLength)) {
      errors.push(`${path}.name 无效`)
    }
    validateTransform(object.transform, `${path}.transform`, errors)
    if (object.color !== undefined && !isNonEmptyString(object.color, 40)) {
      errors.push(`${path}.color 无效`)
    }
    if (
      object.count !== undefined &&
      (!isFiniteNumber(object.count) ||
        !Number.isInteger(object.count) ||
        object.count < 1 ||
        object.count > 100)
    ) {
      errors.push(`${path}.count 必须是 1-100 的整数`)
    }
  })

  objects.forEach((object, index) => {
    if (!isRecord(object)) return
    if (
      object.parentId !== undefined &&
      (typeof object.parentId !== 'string' ||
        !objectIds.has(object.parentId) ||
        object.parentId === object.id)
    ) {
      errors.push(`objects[${index}].parentId 无效`)
    }
  })

  const cameraIds = new Set<string>()
  cameras.forEach((camera, index) => {
    const path = `cameras[${index}]`
    if (!isRecord(camera)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    if (!isNonEmptyString(camera.id, STAGE_LIMITS.maxNameLength)) {
      errors.push(`${path}.id 无效`)
    } else if (cameraIds.has(camera.id)) {
      errors.push(`${path}.id 重复`)
    } else {
      cameraIds.add(camera.id)
    }
    validateCameraFields(camera, path, errors)
  })

  if (
    value.activeCameraId !== undefined &&
    (typeof value.activeCameraId !== 'string' ||
      !cameraIds.has(value.activeCameraId))
  ) {
    errors.push('activeCameraId 不存在')
  }

  const shotIds = new Set<string>()
  shots.forEach((shot, index) => {
    const path = `shots[${index}]`
    if (!isRecord(shot)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    if (typeof shot.id === 'string' && shotIds.has(shot.id)) {
      errors.push(`${path}.id 重复`)
    } else if (typeof shot.id === 'string') {
      shotIds.add(shot.id)
    }
    validateShot(shot, path, cameraIds, objectIds, errors)
  })

  return errors
}

export function isStageDoc(value: unknown): value is DirectorStageDoc {
  return validateStageDoc(value).length === 0
}
