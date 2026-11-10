import {
  DEFAULT_PREVIEW_OPTIONS,
  STAGE_ASPECTS,
  STAGE_EASINGS,
  STAGE_LIMITS,
  STAGE_OBJECT_TYPES,
  cloneStageDoc,
  type ActionTrack,
  type CameraKeyframe,
  type DirectorStageDoc,
  type PreviewOptions,
  type StageCamera,
  type StageObject,
  type StageShot,
  type StageTransform,
  type StageVec3
} from './stage-schema'

export type StageCommand =
  | { type: 'addObject'; object: StageObject }
  | { type: 'removeObject'; objectId: string }
  | {
      type: 'transformObject'
      objectId: string
      transform: Partial<StageTransform>
    }
  | { type: 'setPose'; objectId: string; pose: string }
  | { type: 'setColor'; objectId: string; color: string }
  | { type: 'setVisible'; objectId: string; visible: boolean }
  | { type: 'addCamera'; camera: StageCamera }
  | {
      type: 'updateCamera'
      cameraId: string
      patch: Partial<Omit<StageCamera, 'id'>>
    }
  | { type: 'removeCamera'; cameraId: string }
  | { type: 'addShot'; shot: StageShot }
  | {
      type: 'updateShot'
      shotId: string
      patch: Partial<Omit<StageShot, 'id'>>
    }
  | { type: 'removeShot'; shotId: string }
  | { type: 'setCameraTrack'; shotId: string; track: CameraKeyframe[] }
  | { type: 'setActionTrack'; shotId: string; track: ActionTrack }
  | { type: 'setActiveCamera'; cameraId: string | null }
  | { type: 'captureFrame'; cameraId: string; shotId?: string }
  | {
      type: 'renderPreview'
      shotId: string
      options?: PreviewOptions
    }

export type StageEffect =
  | { type: 'capture-frame'; cameraId: string; shotId?: string }
  | { type: 'render-preview'; shotId: string; options: PreviewOptions }

export interface StageChange {
  createdObjectIds: string[]
  updatedObjectIds: string[]
  deletedObjectIds: string[]
  createdCameraIds: string[]
  updatedCameraIds: string[]
  deletedCameraIds: string[]
  createdShotIds: string[]
  updatedShotIds: string[]
  deletedShotIds: string[]
  activeCameraChanged: boolean
}

export interface StageCommandResult {
  ok: boolean
  doc: DirectorStageDoc
  change: StageChange
  effects: StageEffect[]
  error?: string
}

export interface StageApplyResult extends StageCommandResult {
  applied: number
}

export function emptyStageChange(): StageChange {
  return {
    createdObjectIds: [],
    updatedObjectIds: [],
    deletedObjectIds: [],
    createdCameraIds: [],
    updatedCameraIds: [],
    deletedCameraIds: [],
    createdShotIds: [],
    updatedShotIds: [],
    deletedShotIds: [],
    activeCameraChanged: false
  }
}

function pushUnique(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id)
}

function mergeChange(target: StageChange, source: StageChange): void {
  for (const id of source.createdObjectIds) pushUnique(target.createdObjectIds, id)
  for (const id of source.updatedObjectIds) pushUnique(target.updatedObjectIds, id)
  for (const id of source.deletedObjectIds) pushUnique(target.deletedObjectIds, id)
  for (const id of source.createdCameraIds) pushUnique(target.createdCameraIds, id)
  for (const id of source.updatedCameraIds) pushUnique(target.updatedCameraIds, id)
  for (const id of source.deletedCameraIds) pushUnique(target.deletedCameraIds, id)
  for (const id of source.createdShotIds) pushUnique(target.createdShotIds, id)
  for (const id of source.updatedShotIds) pushUnique(target.updatedShotIds, id)
  for (const id of source.deletedShotIds) pushUnique(target.deletedShotIds, id)
  target.activeCameraChanged ||= source.activeCameraChanged
}

function fail(
  doc: DirectorStageDoc,
  error: string
): StageCommandResult {
  return { ok: false, doc, change: emptyStageChange(), effects: [], error }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isName(
  value: unknown,
  max: number = STAGE_LIMITS.maxNameLength
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max
  )
}

function isVec3(value: unknown): value is StageVec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => isFiniteNumber(item))
  )
}

function validateTransform(
  transform: Partial<StageTransform>
): string | null {
  for (const key of ['position', 'rotation', 'scale'] as const) {
    const value = transform[key]
    if (value !== undefined && !isVec3(value)) {
      return `${key} 必须是 3 个有限数字`
    }
  }
  return null
}

function validateCamera(camera: StageCamera): string | null {
  if (!isName(camera.id) || !isName(camera.name)) return '机位 ID 或名称无效'
  if (!isVec3(camera.position) || !isVec3(camera.target)) {
    return '机位位置和注视点必须是 3 个有限数字'
  }
  if (!isFiniteNumber(camera.fov) || camera.fov < 10 || camera.fov > 120) {
    return '机位 FOV 必须在 10-120 之间'
  }
  if (camera.aspect !== undefined && !STAGE_ASPECTS.includes(camera.aspect)) {
    return '机位画幅无效'
  }
  return null
}

function validateCameraTrack(
  track: CameraKeyframe[],
  durationMs: number
): string | null {
  if (!Array.isArray(track)) return 'cameraTrack 必须是数组'
  if (track.length > STAGE_LIMITS.maxCameraTrackKeys) {
    return '运镜关键帧过多'
  }
  for (const [index, key] of track.entries()) {
    if (
      !isFiniteNumber(key.timeMs) ||
      key.timeMs < 0 ||
      key.timeMs > durationMs
    ) {
      return `运镜关键帧 ${index + 1} 的时间超出镜头时长`
    }
    if (!isVec3(key.position) || !isVec3(key.target)) {
      return `运镜关键帧 ${index + 1} 的位置或注视点无效`
    }
    if (!isFiniteNumber(key.fov) || key.fov < 10 || key.fov > 120) {
      return `运镜关键帧 ${index + 1} 的 FOV 无效`
    }
    if (key.easing !== undefined && !STAGE_EASINGS.includes(key.easing)) {
      return `运镜关键帧 ${index + 1} 的缓动无效`
    }
  }
  return null
}

function validateActionTrack(
  track: ActionTrack,
  objectIds: Set<string>,
  durationMs: number
): string | null {
  if (!objectIds.has(track.objectId)) return '动作轨引用的对象不存在'
  if (!Array.isArray(track.keys)) return '动作轨关键帧必须是数组'
  if (track.keys.length > STAGE_LIMITS.maxActionTrackKeys) {
    return '动作轨关键帧过多'
  }
  for (const [index, key] of track.keys.entries()) {
    if (
      !isFiniteNumber(key.timeMs) ||
      key.timeMs < 0 ||
      key.timeMs > durationMs
    ) {
      return `动作关键帧 ${index + 1} 的时间超出镜头时长`
    }
    if (key.position !== undefined && !isVec3(key.position)) {
      return `动作关键帧 ${index + 1} 的位置无效`
    }
    if (key.rotation !== undefined && !isVec3(key.rotation)) {
      return `动作关键帧 ${index + 1} 的旋转无效`
    }
    if (key.pose !== undefined && !isName(key.pose)) {
      return `动作关键帧 ${index + 1} 的姿势无效`
    }
    if (key.easing !== undefined && !STAGE_EASINGS.includes(key.easing)) {
      return `动作关键帧 ${index + 1} 的缓动无效`
    }
  }
  return null
}

function validateShot(
  shot: StageShot,
  cameraIds: Set<string>,
  objectIds: Set<string>
): string | null {
  if (!isName(shot.id)) return '镜头 ID 无效'
  if (shot.name !== undefined && !isName(shot.name)) return '镜头名称无效'
  if (!cameraIds.has(shot.cameraId)) return '镜头引用的机位不存在'
  if (
    !isFiniteNumber(shot.durationMs) ||
    shot.durationMs < 1 ||
    shot.durationMs > STAGE_LIMITS.maxDurationMs
  ) {
    return `镜头时长必须在 1-${STAGE_LIMITS.maxDurationMs} 毫秒之间`
  }
  if (!STAGE_ASPECTS.includes(shot.aspect)) return '镜头画幅无效'

  if (shot.cameraTrack !== undefined) {
    const error = validateCameraTrack(shot.cameraTrack, shot.durationMs)
    if (error) return error
  }

  if (shot.actionTracks !== undefined) {
    for (const track of shot.actionTracks) {
      const error = validateActionTrack(track, objectIds, shot.durationMs)
      if (error) return error
    }
  }

  return null
}

function sortByTime<T extends { timeMs: number }>(keys: T[]): T[] {
  return [...keys].sort((a, b) => a.timeMs - b.timeMs)
}

function clampPreviewOptions(options: PreviewOptions): PreviewOptions {
  const resolution =
    options.resolution === '1080p' ? '1080p' : '720p'
  const fps = options.fps === 30 ? 30 : 24
  return { resolution, fps, format: 'mp4' }
}

function findObject(
  doc: DirectorStageDoc,
  objectId: string
): StageObject | undefined {
  return doc.objects.find((object) => object.id === objectId)
}

function findCamera(
  doc: DirectorStageDoc,
  cameraId: string
): StageCamera | undefined {
  return doc.cameras.find((camera) => camera.id === cameraId)
}

function findShot(
  doc: DirectorStageDoc,
  shotId: string
): StageShot | undefined {
  return doc.shots.find((shot) => shot.id === shotId)
}

export function applyStageCommand(
  doc: DirectorStageDoc,
  command: StageCommand
): StageCommandResult {
  const change = emptyStageChange()
  const effects: StageEffect[] = []
  const next = cloneStageDoc(doc)

  switch (command.type) {
    case 'addObject': {
      const object = command.object
      if (!isName(object.id) || !isName(object.name)) {
        return fail(doc, '对象 ID 或名称无效')
      }
      if (!STAGE_OBJECT_TYPES.includes(object.type)) {
        return fail(doc, '对象类型无效')
      }
      if (findObject(doc, object.id)) {
        return fail(doc, `对象 ${object.id} 已存在`)
      }
      if (next.objects.length >= STAGE_LIMITS.maxObjects) {
        return fail(doc, '对象数量超过上限')
      }
      const transformError = validateTransform(object.transform)
      if (transformError) return fail(doc, transformError)
      if (
        object.parentId !== undefined &&
        (!findObject(doc, object.parentId) || object.parentId === object.id)
      ) {
        return fail(doc, '父对象不存在')
      }
      if (object.count !== undefined) {
        if (
          !Number.isInteger(object.count) ||
          object.count < 1 ||
          object.count > 100
        ) {
          return fail(doc, '群众数量必须是 1-100 的整数')
        }
      }
      next.objects = [...next.objects, object]
      change.createdObjectIds.push(object.id)
      break
    }

    case 'removeObject': {
      const target = findObject(doc, command.objectId)
      if (!target) return fail(doc, '对象不存在')
      const children = doc.objects.filter(
        (object) => object.parentId === target.id
      )
      next.objects = doc.objects
        .filter((object) => object.id !== target.id)
        .map((object) =>
          object.parentId === target.id
            ? { ...object, parentId: undefined }
            : object
        )
      next.shots = doc.shots.map((shot) => {
        if (!shot.actionTracks?.some((track) => track.objectId === target.id)) {
          return shot
        }
        return {
          ...shot,
          actionTracks: shot.actionTracks.filter(
            (track) => track.objectId !== target.id
          )
        }
      })
      change.deletedObjectIds.push(target.id)
      for (const child of children) pushUnique(change.updatedObjectIds, child.id)
      break
    }

    case 'transformObject': {
      const target = findObject(doc, command.objectId)
      if (!target) return fail(doc, '对象不存在')
      const error = validateTransform(command.transform)
      if (error) return fail(doc, error)
      next.objects = doc.objects.map((object) =>
        object.id === target.id
          ? {
              ...object,
              transform: {
                position:
                  command.transform.position ?? object.transform.position,
                rotation:
                  command.transform.rotation ?? object.transform.rotation,
                scale: command.transform.scale ?? object.transform.scale
              }
            }
          : object
      )
      change.updatedObjectIds.push(target.id)
      break
    }

    case 'setPose': {
      const target = findObject(doc, command.objectId)
      if (!target) return fail(doc, '对象不存在')
      if (!isName(command.pose)) return fail(doc, '姿势无效')
      next.objects = doc.objects.map((object) =>
        object.id === target.id ? { ...object, pose: command.pose } : object
      )
      change.updatedObjectIds.push(target.id)
      break
    }

    case 'setColor': {
      const target = findObject(doc, command.objectId)
      if (!target) return fail(doc, '对象不存在')
      if (!isName(command.color, 40)) return fail(doc, '颜色无效')
      next.objects = doc.objects.map((object) =>
        object.id === target.id ? { ...object, color: command.color } : object
      )
      change.updatedObjectIds.push(target.id)
      break
    }

    case 'setVisible': {
      const target = findObject(doc, command.objectId)
      if (!target) return fail(doc, '对象不存在')
      next.objects = doc.objects.map((object) =>
        object.id === target.id
          ? { ...object, visible: command.visible }
          : object
      )
      change.updatedObjectIds.push(target.id)
      break
    }

    case 'addCamera': {
      const camera = command.camera
      const error = validateCamera(camera)
      if (error) return fail(doc, error)
      if (findCamera(doc, camera.id)) {
        return fail(doc, `机位 ${camera.id} 已存在`)
      }
      if (next.cameras.length >= STAGE_LIMITS.maxCameras) {
        return fail(doc, '机位数量超过上限')
      }
      next.cameras = [...next.cameras, camera]
      change.createdCameraIds.push(camera.id)
      if (!next.activeCameraId) {
        next.activeCameraId = camera.id
        change.activeCameraChanged = true
      }
      break
    }

    case 'updateCamera': {
      const target = findCamera(doc, command.cameraId)
      if (!target) return fail(doc, '机位不存在')
      const merged: StageCamera = {
        ...target,
        ...command.patch,
        id: target.id
      }
      const error = validateCamera(merged)
      if (error) return fail(doc, error)
      next.cameras = doc.cameras.map((camera) =>
        camera.id === target.id ? merged : camera
      )
      change.updatedCameraIds.push(target.id)
      break
    }

    case 'removeCamera': {
      if (!findCamera(doc, command.cameraId)) return fail(doc, '机位不存在')
      if (doc.shots.some((shot) => shot.cameraId === command.cameraId)) {
        return fail(doc, '请先删除引用该机位的镜头')
      }
      next.cameras = doc.cameras.filter(
        (camera) => camera.id !== command.cameraId
      )
      if (next.activeCameraId === command.cameraId) {
        next.activeCameraId = next.cameras[0]?.id
        change.activeCameraChanged = true
      }
      change.deletedCameraIds.push(command.cameraId)
      break
    }

    case 'addShot': {
      const shot: StageShot = {
        ...command.shot,
        cameraTrack: command.shot.cameraTrack
          ? sortByTime(command.shot.cameraTrack)
          : undefined,
        actionTracks: command.shot.actionTracks?.map((track) => ({
          ...track,
          keys: sortByTime(track.keys)
        }))
      }
      const cameraIds = new Set(doc.cameras.map((camera) => camera.id))
      const objectIds = new Set(doc.objects.map((object) => object.id))
      const error = validateShot(shot, cameraIds, objectIds)
      if (error) return fail(doc, error)
      if (findShot(doc, shot.id)) {
        return fail(doc, `镜头 ${shot.id} 已存在`)
      }
      if (next.shots.length >= STAGE_LIMITS.maxShots) {
        return fail(doc, '镜头数量超过上限')
      }
      next.shots = [...next.shots, shot]
      change.createdShotIds.push(shot.id)
      break
    }

    case 'updateShot': {
      const target = findShot(doc, command.shotId)
      if (!target) return fail(doc, '镜头不存在')
      const merged: StageShot = {
        ...target,
        ...command.patch,
        id: target.id
      }
      const cameraIds = new Set(doc.cameras.map((camera) => camera.id))
      const objectIds = new Set(doc.objects.map((object) => object.id))
      const error = validateShot(merged, cameraIds, objectIds)
      if (error) return fail(doc, error)
      next.shots = doc.shots.map((shot) =>
        shot.id === target.id
          ? {
              ...merged,
              cameraTrack: merged.cameraTrack
                ? sortByTime(merged.cameraTrack)
                : undefined,
              actionTracks: merged.actionTracks?.map((track) => ({
                ...track,
                keys: sortByTime(track.keys)
              }))
            }
          : shot
      )
      change.updatedShotIds.push(target.id)
      break
    }

    case 'removeShot': {
      if (!findShot(doc, command.shotId)) return fail(doc, '镜头不存在')
      next.shots = doc.shots.filter((shot) => shot.id !== command.shotId)
      change.deletedShotIds.push(command.shotId)
      break
    }

    case 'setCameraTrack': {
      const target = findShot(doc, command.shotId)
      if (!target) return fail(doc, '镜头不存在')
      const error = validateCameraTrack(command.track, target.durationMs)
      if (error) return fail(doc, error)
      next.shots = doc.shots.map((shot) =>
        shot.id === target.id
          ? { ...shot, cameraTrack: sortByTime(command.track) }
          : shot
      )
      change.updatedShotIds.push(target.id)
      break
    }

    case 'setActionTrack': {
      const target = findShot(doc, command.shotId)
      if (!target) return fail(doc, '镜头不存在')
      const objectIds = new Set(doc.objects.map((object) => object.id))
      const error = validateActionTrack(
        command.track,
        objectIds,
        target.durationMs
      )
      if (error) return fail(doc, error)

      const actionTracks = [...(target.actionTracks ?? [])]
      const index = actionTracks.findIndex(
        (track) => track.objectId === command.track.objectId
      )
      const sorted = {
        ...command.track,
        keys: sortByTime(command.track.keys)
      }
      if (index >= 0) {
        actionTracks[index] = sorted
      } else {
        actionTracks.push(sorted)
      }
      next.shots = doc.shots.map((shot) =>
        shot.id === target.id ? { ...shot, actionTracks } : shot
      )
      change.updatedShotIds.push(target.id)
      break
    }

    case 'setActiveCamera': {
      if (
        command.cameraId !== null &&
        !findCamera(doc, command.cameraId)
      ) {
        return fail(doc, '机位不存在')
      }
      next.activeCameraId = command.cameraId ?? undefined
      change.activeCameraChanged = true
      break
    }

    case 'captureFrame': {
      if (!findCamera(doc, command.cameraId)) return fail(doc, '机位不存在')
      if (command.shotId && !findShot(doc, command.shotId)) {
        return fail(doc, '镜头不存在')
      }
      effects.push({
        type: 'capture-frame',
        cameraId: command.cameraId,
        ...(command.shotId ? { shotId: command.shotId } : {})
      })
      break
    }

    case 'renderPreview': {
      if (!findShot(doc, command.shotId)) return fail(doc, '镜头不存在')
      effects.push({
        type: 'render-preview',
        shotId: command.shotId,
        options: clampPreviewOptions(
          command.options ?? DEFAULT_PREVIEW_OPTIONS
        )
      })
      break
    }

    default: {
      const exhaustive: never = command
      return fail(doc, `未知命令：${String(exhaustive)}`)
    }
  }

  return { ok: true, doc: next, change, effects }
}

/**
 * 原子执行一批命令：任意一条失败时整批回滚。
 * 成功时统一更新 updatedAt，便于 UI 显示保存状态。
 */
export function applyStageCommands(
  doc: DirectorStageDoc,
  commands: StageCommand[],
  now = Date.now()
): StageApplyResult {
  let current = doc
  const change = emptyStageChange()
  const effects: StageEffect[] = []

  for (const [index, command] of commands.entries()) {
    const result = applyStageCommand(current, command)
    if (!result.ok) {
      return {
        ok: false,
        doc,
        change: emptyStageChange(),
        effects: [],
        applied: index,
        error: result.error ?? '场景命令执行失败'
      }
    }
    current = result.doc
    mergeChange(change, result.change)
    effects.push(...result.effects)
  }

  return {
    ok: true,
    doc:
      commands.length > 0
        ? { ...current, updatedAt: new Date(now).toISOString() }
        : current,
    change,
    effects,
    applied: commands.length
  }
}

export interface StageHistoryState {
  past: DirectorStageDoc[]
  future: DirectorStageDoc[]
}

export const STAGE_HISTORY_LIMIT = 50

export function createStageHistory(): StageHistoryState {
  return { past: [], future: [] }
}

/** 在应用命令前调用：把当前文档压入历史，并清空重做栈 */
export function pushStageHistory(
  history: StageHistoryState,
  doc: DirectorStageDoc,
  limit = STAGE_HISTORY_LIMIT
): StageHistoryState {
  const past = [...history.past, cloneStageDoc(doc)]
  return {
    past: past.slice(Math.max(0, past.length - limit)),
    future: []
  }
}

export function undoStageHistory(
  history: StageHistoryState,
  current: DirectorStageDoc
): { doc: DirectorStageDoc; history: StageHistoryState } | null {
  const previous = history.past[history.past.length - 1]
  if (!previous) return null
  return {
    doc: cloneStageDoc(previous),
    history: {
      past: history.past.slice(0, -1),
      future: [cloneStageDoc(current), ...history.future]
    }
  }
}

export function redoStageHistory(
  history: StageHistoryState,
  current: DirectorStageDoc
): { doc: DirectorStageDoc; history: StageHistoryState } | null {
  const next = history.future[0]
  if (!next) return null
  return {
    doc: cloneStageDoc(next),
    history: {
      past: [...history.past, cloneStageDoc(current)],
      future: history.future.slice(1)
    }
  }
}
