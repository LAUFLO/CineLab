

export type StageVec3 = [number, number, number]

export type StageAspect = '16:9' | '9:16' | '1:1'

export type StageEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

export type CameraTrackSmoothing = 'linear' | 'hermite'

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
  /** 来源：手工或自动分镜 */
  source?: 'manual' | 'auto'
}

export interface CameraKeyframe {
  timeMs: number
  position: StageVec3
  target: StageVec3
  fov: number
  easing?: StageEasing
  /** 关键帧来源：路径生成或手动捕获；缺省按 manual 解释。 */
  source?: 'path' | 'manual'
}

export const STAGE_PATH_KINDS = ['camera', 'object', 'follow'] as const
export type StagePathKind = (typeof STAGE_PATH_KINDS)[number]

export const STAGE_PATH_TARGET_MODES = ['ahead', 'fixed', 'follow'] as const
export type StagePathTargetMode = (typeof STAGE_PATH_TARGET_MODES)[number]

export interface StagePathPoint {
  position: StageVec3
}

export interface StagePathTimeKey {
  /** 归一化路径弧长 0..1 */
  at: number
  timeMs: number
  easing?: StageEasing
}

export interface StagePath {
  id: string
  name?: string
  kind: StagePathKind
  objectId?: string
  points: StagePathPoint[]
  timeKeys?: StagePathTimeKey[]
  closed?: boolean
  smooth?: number
  color?: string
  visible?: boolean
  /** 整体高度偏移 */
  height?: number
  /** 相机路径 look-ahead 距离（米） */
  lookAhead?: number
  targetMode?: StagePathTargetMode
  /** 对象路径沿切线朝向 */
  faceTangent?: boolean
  /** 朝向偏移（弧度） */
  rotationOffset?: number
  createdAt: string
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

export type StageCameraRelation =
  | 'front'
  | 'front_side'
  | 'side'
  | 'back_side'
  | 'behind'
  | 'over_shoulder'
  | 'hold'

export type StageCameraDistance = 'close' | 'medium' | 'far'
export type StageCameraHeight = 'floor' | 'low' | 'eye' | 'high' | 'crane'
export type StageCameraAim = 'feet' | 'body' | 'face'
export type StageShotFraming = 'single' | 'two_shot' | 'group'

export interface StageShotIntentKey {
  timeMs: number
  subjectIds: string[]
  framing: StageShotFraming
  relation: StageCameraRelation
  side?: 'left' | 'right'
  towardId?: string
  distance?: StageCameraDistance
  height?: StageCameraHeight
  aim?: StageCameraAim
  angleOffsetDeg?: number
  fovDeg?: number
  still?: boolean
}

export interface StageShotIntent {
  version: 1
  keys: StageShotIntentKey[]
}

export interface StageShot {
  id: string
  name?: string
  cameraId: string
  durationMs: number
  aspect: StageAspect
  cameraTrack?: CameraKeyframe[]
  actionTracks?: ActionTrack[]
  paths?: StagePath[]
  /** 关键帧插值模式；缺省按 'hermite' 解释。 */
  cameraSmoothing?: CameraTrackSmoothing
  /** 语义镜头；存在时 cameraTrack 由求解器生成。 */
  intent?: StageShotIntent
  /** 求解器写入的时间戳。 */
  intentSolvedAt?: string
  /** 台词或画面说明；导出时作字幕与镜头表备注。 */
  caption?: string
  /** 来源：手工或自动分镜 */
  source?: 'manual' | 'auto'
}

/** 成片编排的一条 entry；shotId 可重复，表示复用同一镜头 */
export interface StageProgramEntry {
  shotId: string
  /** 成片时间轴起点（ms）；缺省接在上一条之后 */
  startMs?: number
  /** 重叠时播哪条；越大越优先，默认 0 */
  front?: number
}

export interface StageProgram {
  version: 1
  entries: StageProgramEntry[]
}

export interface StageLightingOverride {
  background?: string
  exposure?: number
  /** 天气效果；仅 rain / snow 有粒子实现 */
  weather?: 'rain' | 'snow'
  ambient?: { color?: string; intensity?: number }
  hemi?: { sky?: string; ground?: string; intensity?: number }
  sun?: {
    color?: string
    intensity?: number
    position?: [number, number, number]
  }
  fill?: {
    color?: string
    intensity?: number
    position?: [number, number, number]
  }
  fog?: { color?: string; near?: number; far?: number }
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
  /** 成片编排；缺省时按 shots 数组顺序串行。 */
  program?: StageProgram
  /** 手调光照；缺省使用日戏基础光照。 */
  lighting?: StageLightingOverride
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
  'kneel',
  'crouch',
  'fallen',
  'armsCrossed',
  'wave',
  'point',
  'walk',
  'run',
  'sitDown',
  'standUp',
  'bow',
  'nod',
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
  maxPathsPerShot: 20,
  maxPathPoints: 200,
  maxPathTimeKeys: 32,
  maxProgramEntries: 200,
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
    background: { kind: 'color', value: '#242428' },
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
  if (
    camera.source !== undefined &&
    camera.source !== 'manual' &&
    camera.source !== 'auto'
  ) {
    errors.push(`${path}.source 无效`)
  }
}

export function validateStagePath(
  value: unknown,
  durationMs: number,
  objectIds: Set<string>
): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['路径必须是对象']
  if (!isNonEmptyString(value.id, STAGE_LIMITS.maxNameLength)) {
    errors.push('路径 id 无效')
  }
  if (
    value.name !== undefined &&
    !isNonEmptyString(value.name, STAGE_LIMITS.maxNameLength)
  ) {
    errors.push('路径名称无效')
  }
  if (!STAGE_PATH_KINDS.includes(value.kind as StagePathKind)) {
    errors.push('路径类型无效')
  }
  if (value.kind === 'object' || value.kind === 'follow') {
    if (typeof value.objectId !== 'string' || !objectIds.has(value.objectId)) {
      errors.push('路径绑定的对象不存在')
    }
  }
  if (!Array.isArray(value.points)) {
    errors.push('路径点必须是数组')
  } else {
    if (value.points.length < 2) errors.push('路径至少需要 2 个点')
    if (value.points.length > STAGE_LIMITS.maxPathPoints) {
      errors.push('路径点过多')
    }
    value.points.forEach((point, index) => {
      if (!isRecord(point) || !isVec3(point.position)) {
        errors.push(`路径点 ${index + 1} 位置无效`)
      }
    })
  }
  if (value.timeKeys !== undefined) {
    if (!Array.isArray(value.timeKeys)) {
      errors.push('路径时间节点必须是数组')
    } else {
      if (value.timeKeys.length > STAGE_LIMITS.maxPathTimeKeys) {
        errors.push('路径时间节点过多')
      }
      let previousAt = -1
      let previousTime = -1
      value.timeKeys.forEach((key, index) => {
        if (!isRecord(key)) {
          errors.push(`路径时间节点 ${index + 1} 无效`)
          return
        }
        if (!isFiniteNumber(key.at) || key.at < 0 || key.at > 1) {
          errors.push(`路径时间节点 ${index + 1}.at 必须在 0-1 之间`)
        } else if (key.at <= previousAt) {
          errors.push(`路径时间节点 ${index + 1}.at 必须递增`)
        } else {
          previousAt = key.at
        }
        if (
          !isFiniteNumber(key.timeMs) ||
          key.timeMs < 0 ||
          key.timeMs > durationMs
        ) {
          errors.push(`路径时间节点 ${index + 1}.timeMs 超出镜头时长`)
        } else if (key.timeMs <= previousTime) {
          errors.push(`路径时间节点 ${index + 1}.timeMs 必须递增`)
        } else {
          previousTime = key.timeMs
        }
        if (
          key.easing !== undefined &&
          !STAGE_EASINGS.includes(key.easing as StageEasing)
        ) {
          errors.push(`路径时间节点 ${index + 1}.easing 无效`)
        }
      })
    }
  }
  if (value.closed !== undefined && typeof value.closed !== 'boolean') {
    errors.push('路径 closed 无效')
  }
  if (
    value.smooth !== undefined &&
    (!isFiniteNumber(value.smooth) || value.smooth < 0 || value.smooth > 1)
  ) {
    errors.push('路径 smooth 必须在 0-1 之间')
  }
  if (
    value.color !== undefined &&
    (!isNonEmptyString(value.color, 40) || !/^#[0-9a-f]{6}$/i.test(value.color))
  ) {
    errors.push('路径颜色无效')
  }
  if (value.visible !== undefined && typeof value.visible !== 'boolean') {
    errors.push('路径 visible 无效')
  }
  if (value.height !== undefined && !isFiniteNumber(value.height)) {
    errors.push('路径 height 无效')
  }
  if (
    value.lookAhead !== undefined &&
    (!isFiniteNumber(value.lookAhead) || value.lookAhead < 0.1 || value.lookAhead > 50)
  ) {
    errors.push('路径 lookAhead 必须在 0.1-50 之间')
  }
  if (
    value.targetMode !== undefined &&
    !STAGE_PATH_TARGET_MODES.includes(value.targetMode as StagePathTargetMode)
  ) {
    errors.push('路径 targetMode 无效')
  }
  if (value.faceTangent !== undefined && typeof value.faceTangent !== 'boolean') {
    errors.push('路径 faceTangent 无效')
  }
  if (value.rotationOffset !== undefined && !isFiniteNumber(value.rotationOffset)) {
    errors.push('路径 rotationOffset 无效')
  }
  if (!isNonEmptyString(value.createdAt, 80)) {
    errors.push('路径 createdAt 无效')
  }
  return errors
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
  if (shot.caption !== undefined && !isNonEmptyString(shot.caption, 500)) {
    errors.push(`${path}.caption 无效`)
  }
  if (
    shot.source !== undefined &&
    shot.source !== 'manual' &&
    shot.source !== 'auto'
  ) {
    errors.push(`${path}.source 无效`)
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
        if (
          key.source !== undefined &&
          key.source !== 'path' &&
          key.source !== 'manual'
        ) {
          errors.push(`${keyPath}.source 无效`)
        }
      })
    }
  }

  if (shot.paths !== undefined) {
    if (!Array.isArray(shot.paths)) {
      errors.push(`${path}.paths 必须是数组`)
    } else if (shot.paths.length > STAGE_LIMITS.maxPathsPerShot) {
      errors.push(`${path}.paths 数量过多`)
    } else {
      const duration = isFiniteNumber(shot.durationMs)
        ? shot.durationMs
        : STAGE_LIMITS.maxDurationMs
      const seen = new Set<string>()
      shot.paths.forEach((item, index) => {
        const itemPath = `${path}.paths[${index}]`
        if (!isRecord(item)) {
          errors.push(`${itemPath} 必须是对象`)
          return
        }
        for (const message of validateStagePath(item, duration, objectIds)) {
          errors.push(`${itemPath}: ${message}`)
        }
        if (typeof item.id === 'string') {
          if (seen.has(item.id)) errors.push(`${itemPath}.id 重复`)
          seen.add(item.id)
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

function validateProgram(
  value: unknown,
  shotIds: Set<string>,
  errors: string[]
): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    errors.push('program 必须是对象')
    return
  }
  if (value.version !== 1) {
    errors.push('program.version 必须是 1')
  }
  if (!Array.isArray(value.entries)) {
    errors.push('program.entries 必须是数组')
    return
  }
  if (value.entries.length > STAGE_LIMITS.maxProgramEntries) {
    errors.push(
      `program.entries 不能超过 ${STAGE_LIMITS.maxProgramEntries} 条`
    )
  }
  value.entries.forEach((entry, index) => {
    const path = `program.entries[${index}]`
    if (!isRecord(entry)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    if (typeof entry.shotId !== 'string' || !shotIds.has(entry.shotId)) {
      errors.push(`${path}.shotId 不存在`)
    }
    if (
      entry.startMs !== undefined &&
      (!isFiniteNumber(entry.startMs) || entry.startMs < 0)
    ) {
      errors.push(`${path}.startMs 必须是非负有限数字`)
    }
    if (
      entry.front !== undefined &&
      (!isFiniteNumber(entry.front) ||
        !Number.isInteger(entry.front) ||
        entry.front < 0 ||
        entry.front > 1_000_000)
    ) {
      errors.push(`${path}.front 必须是 0-1000000 的整数`)
    }
  })
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

  validateProgram(value.program, shotIds, errors)

  return errors
}

export function isStageDoc(value: unknown): value is DirectorStageDoc {
  return validateStageDoc(value).length === 0
}
