import { create } from 'zustand'
import type {
  DirectorStageDoc,
  StageCamera,
  StageObject,
  StageObjectType,
  StagePath,
  StagePathKind,
  StagePathTimeKey,
  StageShot,
  StageShotIntent,
  StageTransform,
  StageVec3
} from '@shared/stage-schema'
import { createStageId } from '@shared/stage-schema'
import {
  actionTrackFromPath,
  cameraTrackFromPath,
  mergeActionTrack,
  mergeCameraTrack,
  poseOnlyActionTrack,
  scalePathTimes
} from '@shared/stage-paths'
import { solveStageShotIntent } from '@shared/stage-shot-intent'
import { buildProgramTimeline, programAt } from '@shared/stage-program'
import {
  buildAutoCoverage,
  type AutoCoverageOptions
} from '@shared/stage-auto-coverage'
import {
  buildDialogueCoverage,
  parseDialogue
} from '@shared/stage-dialogue'
import {
  applyStageCommands,
  createStageHistory,
  pushStageHistory,
  redoStageHistory,
  undoStageHistory,
  type StageCommand,
  type StageHistoryState
} from '@shared/stage-commands'
import { isStageNode, useCanvasStore } from '../stores/canvas'
import { setActiveStageNode } from './stage-active'

export type StagePlaybackScope = 'shot' | 'program'
export type StageViewMode = 'director' | 'camera'
export type StageTransformMode = 'translate' | 'rotate' | 'scale'
export type StageDrawMode = 'off' | 'camera' | 'object' | 'follow'

export interface StagePathDraft {
  kind: StagePathKind
  points: StageVec3[]
  objectId?: string
  name?: string
  height?: number
  targetMode?: StagePath['targetMode']
  lookAhead?: number
  faceTangent?: boolean
  rotationOffset?: number
}

export interface StageViewCapture {
  position: StageVec3
  target: StageVec3
  fov: number
}

const OBJECT_LABEL: Record<StageObjectType, string> = {
  human: '人物',
  box: '立方体',
  sphere: '球体',
  plane: '平面',
  gltf: '模型',
  crowd: '群众'
}

interface StageState {
  open: boolean
  nodeId: string | null
  doc: DirectorStageDoc | null
  history: StageHistoryState
  selectedObjectId: string | null
  selectedCameraId: string | null
  selectedShotId: string | null
  selectedKeyframeIndex: number | null
  selectedPathId: string | null
  drawMode: StageDrawMode
  viewMode: StageViewMode
  transformMode: StageTransformMode
  playing: boolean
  playbackMs: number
  playbackScope: StagePlaybackScope
  programMs: number
  loading: boolean
  saving: boolean
  dirty: boolean
  error: string | null
  captureHandler: (() => string | null) | null
  viewCaptureHandler: (() => StageViewCapture | null) | null

  openStage: (nodeId: string) => Promise<void>
  closeStage: () => void
  applyCommands: (commands: StageCommand[], turnId?: string) => boolean
  endCommandTurn: (turnId: string) => void
  undo: () => void
  redo: () => void
  selectObject: (objectId: string | null) => void
  selectCamera: (cameraId: string | null) => void
  selectShot: (shotId: string | null) => void
  selectPath: (pathId: string | null) => void
  setDrawMode: (mode: StageDrawMode) => void
  addPath: (draft: StagePathDraft) => string | null
  updatePath: (
    shotId: string,
    pathId: string,
    patch: Partial<Omit<StagePath, 'id'>>
  ) => boolean
  removePath: (shotId: string, pathId: string) => boolean
  setPathVisible: (shotId: string, pathId: string, visible: boolean) => boolean
  updatePathPoint: (
    shotId: string,
    pathId: string,
    index: number,
    position: StageVec3
  ) => boolean
  addShot: () => string | null
  autoCoverage: (options: AutoCoverageOptions) => boolean
  dialogueCoverage: (
    script: string,
    options?: { pace?: number }
  ) => boolean
  removeSelectedShot: () => boolean
  setShotDuration: (durationMs: number) => boolean
  setShotIntent: (intent: StageShotIntent) => boolean
  clearShotIntent: () => boolean
  captureKeyframe: () => boolean
  removeKeyframe: (index: number) => boolean
  seek: (timeMs: number) => void
  seekProgram: (timeMs: number) => void
  setPlaybackScope: (scope: StagePlaybackScope) => void
  play: () => void
  pause: () => void
  registerViewCapture: (
    handler: (() => StageViewCapture | null) | null
  ) => void
  setViewMode: (mode: StageViewMode) => void
  setTransformMode: (mode: StageTransformMode) => void
  setActiveCamera: (cameraId: string | null) => void
  addObject: (type: StageObjectType, assetPath?: string) => string | null
  addCamera: () => string | null
  removeSelectedObject: () => boolean
  removeSelectedCamera: () => boolean
  updateObject: (
    objectId: string,
    patch: {
      transform?: Partial<StageTransform>
      pose?: string
      color?: string
      visible?: boolean
      name?: string
      parentId?: string | null
    }
  ) => void
  updateCamera: (cameraId: string, patch: Partial<Omit<StageCamera, 'id'>>) => void
  registerCapture: (handler: (() => string | null) | null) => void
  capture: () => string | null
  clearError: () => void
}

export function syncStageNodeSummary(
  nodeId: string,
  doc: DirectorStageDoc
): void {
  useCanvasStore.getState().patchStageNode(nodeId, {
    objectCount: doc.objects.length,
    cameraCount: doc.cameras.length,
    shotCount: doc.shots.length,
    activeCameraId: doc.activeCameraId
  })
}

/** 一轮 Agent 的多个场景命令只压入一条历史记录 */
const commandTurns = new Set<string>()

function pathTrackCommands(
  shot: StageShot,
  doc: DirectorStageDoc,
  path: StagePath,
  paths: StagePath[]
): StageCommand[] {
  if (path.kind === 'camera') {
    const camera = doc.cameras.find((item) => item.id === shot.cameraId)
    if (!camera) return []
    const follow =
      paths.find((item) => item.kind === 'follow') ??
      (path.targetMode === 'follow' && path.objectId
        ? paths.find(
            (item) =>
              item.kind === 'object' && item.objectId === path.objectId
          )
        : undefined)
    const generated = cameraTrackFromPath({
      path,
      camera,
      durationMs: shot.durationMs,
      ...(follow ? { followPath: follow } : {})
    })
    return [
      {
        type: 'setCameraTrack',
        shotId: shot.id,
        track: mergeCameraTrack(shot.cameraTrack, generated, true)
      }
    ]
  }

  if (path.kind === 'object') {
    const object = doc.objects.find((item) => item.id === path.objectId)
    if (!object) return []
    const generated = actionTrackFromPath({
      path,
      object,
      durationMs: shot.durationMs
    })
    const existing = shot.actionTracks?.find(
      (track) => track.objectId === path.objectId
    )
    return [
      {
        type: 'setActionTrack',
        shotId: shot.id,
        track: mergeActionTrack(existing, generated)
      }
    ]
  }

  const cameraPath = paths.find((item) => item.kind === 'camera')
  const camera = doc.cameras.find((item) => item.id === shot.cameraId)
  if (!cameraPath || !camera) return []
  const generated = cameraTrackFromPath({
    path: cameraPath,
    camera,
    durationMs: shot.durationMs,
    followPath: path
  })
  return [
    {
      type: 'setCameraTrack',
      shotId: shot.id,
      track: mergeCameraTrack(shot.cameraTrack, generated, true)
    }
  ]
}

export const useStageStore = create<StageState>((set, get) => ({
  open: false,
  nodeId: null,
  doc: null,
  history: createStageHistory(),
  selectedObjectId: null,
  selectedCameraId: null,
  selectedShotId: null,
  selectedKeyframeIndex: null,
  selectedPathId: null,
  drawMode: 'off',
  viewMode: 'director',
  transformMode: 'translate',
  playing: false,
  playbackMs: 0,
  playbackScope: 'shot',
  programMs: 0,
  loading: false,
  saving: false,
  dirty: false,
  error: null,
  captureHandler: null,
  viewCaptureHandler: null,

  openStage: async (nodeId) => {
    const node = useCanvasStore
      .getState()
      .nodes.find((item) => item.id === nodeId)
    if (!node || !isStageNode(node)) {
      set({ error: '找不到导演台节点' })
      return
    }

    setActiveStageNode(nodeId)
    set({
      open: true,
      nodeId,
      loading: true,
      error: null,
      doc: null,
      history: createStageHistory(),
      selectedObjectId: null,
      selectedCameraId: null,
      selectedShotId: null,
      selectedKeyframeIndex: null,
      selectedPathId: null,
      drawMode: 'off',
      viewMode: 'director',
      transformMode: 'translate',
      playing: false,
      playbackMs: 0,
      playbackScope: 'shot',
      programMs: 0,
      dirty: false
    })

    try {
      let doc = await window.api.stage.load(node.data.stageId)
      if (!doc) {
        doc = await window.api.stage.create(node.data.title)
        useCanvasStore
          .getState()
          .patchStageNode(nodeId, { stageId: doc.stageId })
      }

      set({
        doc,
        loading: false,
        selectedCameraId: doc.activeCameraId ?? null,
        selectedShotId: doc.shots[0]?.id ?? null,
        selectedKeyframeIndex: null,
        selectedPathId: null,
        drawMode: 'off',
        viewMode: 'director',
        playing: false,
        playbackMs: 0,
        playbackScope: 'shot',
        programMs: 0
      })
      syncStageNodeSummary(nodeId, doc)
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '打开场景失败'
      })
    }
  },

  closeStage: () => {
    setActiveStageNode(null)
    const { doc, dirty, nodeId } = get()
    if (doc && dirty && nodeId) {
      void window.api.stage
        .save(doc)
        .then(() => syncStageNodeSummary(nodeId, doc))
        .catch(() => undefined)
    }
    set({
      open: false,
      nodeId: null,
      doc: null,
      history: createStageHistory(),
      selectedObjectId: null,
      selectedCameraId: null,
      selectedShotId: null,
      selectedKeyframeIndex: null,
      selectedPathId: null,
      drawMode: 'off',
      viewMode: 'director',
      playing: false,
      playbackMs: 0,
      playbackScope: 'shot',
      programMs: 0,
      loading: false,
      saving: false,
      dirty: false,
      error: null,
      captureHandler: null,
      viewCaptureHandler: null
    })
  },

  applyCommands: (commands, turnId) => {
    const { doc, nodeId, history } = get()
    if (!doc || !nodeId) return false

    const result = applyStageCommands(doc, commands)
    if (!result.ok) {
      set({ error: result.error ?? '场景命令执行失败' })
      return false
    }

    const shouldPushHistory = !turnId || !commandTurns.has(turnId)
    if (turnId && shouldPushHistory) commandTurns.add(turnId)

    const affectsProgram =
      result.change.programChanged ||
      result.change.updatedShotIds.length > 0 ||
      result.change.deletedShotIds.length > 0
    const programMs = affectsProgram
      ? Math.min(get().programMs, buildProgramTimeline(result.doc).durationMs)
      : get().programMs

    set({
      doc: result.doc,
      history: shouldPushHistory ? pushStageHistory(history, doc) : history,
      dirty: true,
      error: null,
      programMs
    })
    syncStageNodeSummary(nodeId, result.doc)
    return true
  },

  endCommandTurn: (turnId) => {
    commandTurns.delete(turnId)
  },

  undo: () => {
    const { doc, history, nodeId } = get()
    if (!doc || !nodeId) return
    const next = undoStageHistory(history, doc)
    if (!next) return
    const programMs = Math.min(
      get().programMs,
      buildProgramTimeline(next.doc).durationMs
    )
    set({ doc: next.doc, history: next.history, dirty: true, programMs })
    syncStageNodeSummary(nodeId, next.doc)
  },

  redo: () => {
    const { doc, history, nodeId } = get()
    if (!doc || !nodeId) return
    const next = redoStageHistory(history, doc)
    if (!next) return
    const programMs = Math.min(
      get().programMs,
      buildProgramTimeline(next.doc).durationMs
    )
    set({ doc: next.doc, history: next.history, dirty: true, programMs })
    syncStageNodeSummary(nodeId, next.doc)
  },

  selectObject: (objectId) =>
    set({
      selectedObjectId: objectId,
      selectedPathId: null,
      playing: false
    }),

  selectCamera: (cameraId) => {
    if (cameraId) {
      const applied = get().applyCommands([
        { type: 'setActiveCamera', cameraId }
      ])
      set({
        selectedObjectId: null,
        selectedCameraId: cameraId,
        selectedPathId: null,
        viewMode: applied ? 'camera' : get().viewMode,
        playing: false
      })
      return
    }
    set({
      selectedCameraId: null,
      selectedPathId: null,
      viewMode: 'director',
      playing: false
    })
  },

  selectPath: (pathId) =>
    set({
      selectedPathId: pathId,
      ...(pathId ? { selectedObjectId: null, selectedCameraId: null } : {}),
      playing: false
    }),

  setDrawMode: (mode) => {
    if ((mode === 'object' || mode === 'follow') && !get().selectedObjectId) {
      set({ error: '请先选择一个对象' })
      return
    }
    if (mode === 'camera' && !get().selectedShotId) {
      set({ error: '请先选择一个镜头' })
      return
    }
    set({
      drawMode: mode,
      playing: false,
      ...(mode === 'off'
        ? {}
        : { viewMode: 'director' as const, selectedPathId: null })
    })
  },

  addPath: (draft) => {
    const { doc, selectedShotId } = get()
    const shot = doc?.shots.find((item) => item.id === selectedShotId)
    if (!doc || !shot) {
      set({ error: '请先选择一个镜头' })
      return null
    }
    if (draft.points.length < 2) {
      set({ error: '路径至少需要 2 个点' })
      return null
    }
    const paths = shot.paths ?? []
    const kindCount = paths.filter((path) => path.kind === draft.kind).length + 1
    const objectName = draft.objectId
      ? doc.objects.find((object) => object.id === draft.objectId)?.name
      : undefined
    const name =
      draft.name ??
      (draft.kind === 'camera'
        ? `相机路径 ${kindCount}`
        : draft.kind === 'object'
          ? `${objectName ?? '对象'}路径 ${kindCount}`
          : `跟随路径 ${kindCount}`)
    const path: StagePath = {
      id: createStageId('path'),
      name,
      kind: draft.kind,
      ...(draft.objectId ? { objectId: draft.objectId } : {}),
      points: draft.points.map((position) => ({ position: [...position] })),
      visible: true,
      smooth: 0.5,
      height: draft.height ?? 0,
      createdAt: new Date().toISOString(),
      ...(draft.kind === 'camera'
        ? {
            targetMode: draft.targetMode ?? 'ahead',
            lookAhead: draft.lookAhead ?? 2
          }
        : {}),
      ...(draft.kind === 'object'
        ? {
            faceTangent: draft.faceTangent ?? true,
            rotationOffset: draft.rotationOffset ?? 0
          }
        : {})
    }
    const nextPaths = [...paths, path]
    const nextShot: StageShot = { ...shot, paths: nextPaths }
    const commands: StageCommand[] = [
      { type: 'addPath', shotId: shot.id, path },
      ...pathTrackCommands(nextShot, doc, path, nextPaths)
    ]
    const applied = get().applyCommands(
      commands,
      `path-${path.id}-${Date.now()}`
    )
    if (!applied) return null
    set({ selectedPathId: path.id, drawMode: 'off' })
    return path.id
  },

  updatePath: (shotId, pathId, patch) => {
    const { doc } = get()
    const shot = doc?.shots.find((item) => item.id === shotId)
    const current = shot?.paths?.find((path) => path.id === pathId)
    if (!doc || !shot || !current) return false
    const nextPath: StagePath = { ...current, ...patch, id: current.id }
    const paths = (shot.paths ?? []).map((path) =>
      path.id === pathId ? nextPath : path
    )
    const nextShot: StageShot = { ...shot, paths }
    const commands: StageCommand[] = [
      { type: 'updatePath', shotId, pathId, patch },
      ...pathTrackCommands(nextShot, doc, nextPath, paths)
    ]
    return get().applyCommands(commands, `path-${pathId}-${Date.now()}`)
  },

  removePath: (shotId, pathId) => {
    const { doc } = get()
    const shot = doc?.shots.find((item) => item.id === shotId)
    const current = shot?.paths?.find((path) => path.id === pathId)
    if (!doc || !shot || !current) return false
    const paths = (shot.paths ?? []).filter((path) => path.id !== pathId)
    const commands: StageCommand[] = [
      { type: 'removePath', shotId, pathId }
    ]
    if (current.kind === 'camera' || current.kind === 'follow') {
      const cameraPath = paths.find((path) => path.kind === 'camera')
      if (cameraPath) {
        commands.push(
          ...pathTrackCommands(
            { ...shot, paths },
            doc,
            cameraPath,
            paths
          )
        )
      } else {
        commands.push({
          type: 'setCameraTrack',
          shotId,
          track: mergeCameraTrack(shot.cameraTrack, [], true)
        })
      }
    }
    if (current.kind === 'object' && current.objectId) {
      const existing = shot.actionTracks?.find(
        (track) => track.objectId === current.objectId
      )
      const poseOnly = poseOnlyActionTrack(existing, current.objectId)
      commands.push({
        type: 'setActionTrack',
        shotId,
        track: poseOnly ?? { objectId: current.objectId, keys: [] }
      })
    }
    const applied = get().applyCommands(
      commands,
      `path-${pathId}-${Date.now()}`
    )
    if (applied) set({ selectedPathId: null })
    return applied
  },

  setPathVisible: (shotId, pathId, visible) =>
    get().applyCommands([
      { type: 'setPathVisible', shotId, pathId, visible }
    ]),

  updatePathPoint: (shotId, pathId, index, position) => {
    const shot = get().doc?.shots.find((item) => item.id === shotId)
    const path = shot?.paths?.find((item) => item.id === pathId)
    if (!path || index < 0 || index >= path.points.length) return false
    const points = path.points.map((point, pointIndex) =>
      pointIndex === index ? { position } : point
    )
    return get().updatePath(shotId, pathId, { points })
  },

  selectShot: (shotId) => {
    const { doc, playbackScope } = get()
    const segment =
      shotId && doc && playbackScope === 'program'
        ? buildProgramTimeline(doc).segments.find(
            (item) => item.shotId === shotId
          )
        : undefined
    set({
      selectedShotId: shotId,
      selectedKeyframeIndex: null,
      selectedPathId: null,
      playbackMs: 0,
      ...(segment ? { programMs: segment.startMs } : {}),
      playing: false
    })
  },

  addShot: () => {
    const { doc, selectedCameraId } = get()
    if (!doc) return null
    const cameraId =
      selectedCameraId ?? doc.activeCameraId ?? doc.cameras[0]?.id
    if (!cameraId) {
      set({ error: '请先添加机位，再创建镜头' })
      return null
    }

    const shot: StageShot = {
      id: `shot_${crypto.randomUUID().slice(0, 8)}`,
      name: `镜头 ${doc.shots.length + 1}`,
      cameraId,
      durationMs: 5000,
      aspect: '16:9'
    }
    if (!get().applyCommands([{ type: 'addShot', shot }])) return null
    set({
      selectedShotId: shot.id,
      selectedKeyframeIndex: null,
      playbackMs: 0,
      playing: false
    })
    return shot.id
  },

  autoCoverage: (options) => {
    const { doc } = get()
    if (!doc) return false
    const plan = buildAutoCoverage(doc, options)
    if (plan.shots.length === 0) {
      set({ error: plan.notes[0] ?? '自动分镜没有生成镜头' })
      return false
    }
    const applied = get().applyCommands([
      {
        type: 'replaceCoverage',
        cameras: plan.cameras,
        shots: plan.shots,
        mode: options.replace === false ? 'append' : 'replace'
      }
    ])
    if (!applied) return false
    set({
      selectedShotId: plan.shots[0]?.id ?? null,
      playbackScope: 'program',
      programMs: 0,
      playbackMs: 0,
      selectedKeyframeIndex: null
    })
    return true
  },

  dialogueCoverage: (script, options) => {
    const { doc } = get()
    if (!doc) return false
    const lines = parseDialogue(script)
    if (lines.length === 0) {
      set({ error: '没有识别到对白，请按「角色：台词」每行一句' })
      return false
    }
    const plan = buildDialogueCoverage(doc, lines, options)
    if (plan.shots.length === 0) {
      set({ error: plan.notes[0] ?? '按对白分镜没有生成镜头' })
      return false
    }
    const applied = get().applyCommands([
      {
        type: 'replaceCoverage',
        cameras: plan.cameras,
        shots: plan.shots,
        mode: 'replace'
      }
    ])
    if (!applied) return false
    set({
      selectedShotId: plan.shots[0]?.id ?? null,
      playbackScope: 'program',
      programMs: 0,
      playbackMs: 0,
      selectedKeyframeIndex: null
    })
    return true
  },

  removeSelectedShot: () => {
    const shotId = get().selectedShotId
    if (!shotId) return false
    const remaining =
      get().doc?.shots.filter((shot) => shot.id !== shotId) ?? []
    if (!get().applyCommands([{ type: 'removeShot', shotId }])) return false
    set({
      selectedShotId: remaining[0]?.id ?? null,
      selectedKeyframeIndex: null,
      playbackMs: 0,
      playing: false
    })
    return true
  },

  setShotDuration: (durationMs) => {
    const { doc, selectedShotId } = get()
    if (!doc || !selectedShotId) return false
    const shot = doc.shots.find((item) => item.id === selectedShotId)
    if (!shot) return false

    const duration = Math.round(durationMs)
    if (!Number.isFinite(duration) || duration < 100 || duration > 15000) {
      set({ error: '镜头时长需要在 0.1-15 秒之间' })
      return false
    }

    const ratio = duration / Math.max(1, shot.durationMs)
    const scaleKey = <T extends { timeMs: number }>(key: T): T => ({
      ...key,
      timeMs: Math.min(duration, Math.round(key.timeMs * ratio))
    })
    const track = (shot.cameraTrack ?? []).map(scaleKey)
    const actionTracks = (shot.actionTracks ?? [])
      .map((action) => ({
        ...action,
        keys: action.keys.map(scaleKey)
      }))
      .filter((action) => action.keys.length > 0)
    const paths = scalePathTimes(shot.paths, shot.durationMs, duration)

    const applied = get().applyCommands([
      {
        type: 'updateShot',
        shotId: selectedShotId,
        patch: {
          durationMs: duration,
          cameraTrack: track.length > 0 ? track : undefined,
          actionTracks: actionTracks.length > 0 ? actionTracks : undefined,
          ...(paths ? { paths } : {})
        }
      }
    ])
    if (applied) {
      set({
        playbackMs: Math.min(get().playbackMs, duration),
        selectedKeyframeIndex: null
      })
    }
    return applied
  },

  setShotIntent: (intent) => {
    const { doc, selectedShotId } = get()
    if (!doc || !selectedShotId) return false
    const shot = doc.shots.find((item) => item.id === selectedShotId)
    if (!shot) return false
    try {
      const solved = solveStageShotIntent(doc, { ...shot, intent })
      const applied = get().applyCommands([
        {
          type: 'setShotIntent',
          shotId: selectedShotId,
          intent,
          track: solved.track,
          solvedAt: new Date().toISOString()
        }
      ])
      if (applied) set({ selectedKeyframeIndex: null })
      return applied
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  },

  clearShotIntent: () => {
    const { selectedShotId } = get()
    if (!selectedShotId) return false
    const applied = get().applyCommands([
      { type: 'clearShotIntent', shotId: selectedShotId }
    ])
    if (applied) set({ selectedKeyframeIndex: null })
    return applied
  },

  captureKeyframe: () => {
    const {
      doc,
      selectedShotId,
      playbackMs,
      viewCaptureHandler
    } = get()
    if (!doc || !selectedShotId) {
      set({ error: '请先选择一个镜头' })
      return false
    }
    const shot = doc.shots.find((item) => item.id === selectedShotId)
    if (!shot) return false

    const capture = viewCaptureHandler?.()
    if (!capture) {
      set({ error: '当前视口无法捕获机位' })
      return false
    }

    const timeMs = Math.round(
      Math.min(shot.durationMs, Math.max(0, playbackMs))
    )
    const track = (shot.cameraTrack ?? []).filter(
      (key) => Math.abs(key.timeMs - timeMs) > 2
    )
    track.push({
      timeMs,
      position: [...capture.position],
      target: [...capture.target],
      fov: capture.fov,
      easing: 'linear',
      source: 'manual'
    })
    track.sort((a, b) => a.timeMs - b.timeMs)

    if (
      !get().applyCommands([
        { type: 'setCameraTrack', shotId: selectedShotId, track }
      ])
    ) {
      return false
    }

    set({
      selectedKeyframeIndex: track.findIndex((key) => key.timeMs === timeMs)
    })
    return true
  },

  removeKeyframe: (index) => {
    const { doc, selectedShotId } = get()
    if (!doc || !selectedShotId) return false
    const shot = doc.shots.find((item) => item.id === selectedShotId)
    if (!shot) return false
    const track = [...(shot.cameraTrack ?? [])]
    if (index < 0 || index >= track.length) return false

    const next = track.filter((_, keyIndex) => keyIndex !== index)
    const applied = get().applyCommands([
      { type: 'setCameraTrack', shotId: selectedShotId, track: next }
    ])
    if (applied) set({ selectedKeyframeIndex: null })
    return applied
  },

  seek: (timeMs) => {
    const { doc, selectedShotId } = get()
    const shot = doc?.shots.find((item) => item.id === selectedShotId)
    const max = shot?.durationMs ?? 0
    set({
      playbackMs: Math.round(Math.min(max, Math.max(0, timeMs)))
    })
  },

  seekProgram: (timeMs) => {
    const { doc } = get()
    const duration = doc ? buildProgramTimeline(doc).durationMs : 0
    set({
      programMs: Math.round(Math.min(duration, Math.max(0, timeMs)))
    })
  },

  setPlaybackScope: (scope) => {
    const {
      doc,
      playbackScope,
      playbackMs,
      programMs,
      selectedShotId
    } = get()
    if (!doc || scope === playbackScope) {
      set({ playbackScope: scope })
      return
    }

    const timeline = buildProgramTimeline(doc)
    if (scope === 'program') {
      const segment = timeline.segments.find(
        (item) => item.shotId === selectedShotId
      )
      set({
        playbackScope: scope,
        programMs: segment
          ? segment.startMs +
            Math.min(playbackMs, segment.endMs - segment.startMs)
          : Math.min(programMs, timeline.durationMs)
      })
      return
    }

    const active = programAt(timeline, programMs)
    set({
      playbackScope: scope,
      playbackMs: active
        ? Math.min(programMs - active.startMs, active.endMs - active.startMs)
        : 0
    })
  },

  play: () => {
    const { doc, playbackScope, selectedShotId, playbackMs, programMs } = get()
    if (!doc) {
      set({ error: '请先打开场景' })
      return
    }
    if (playbackScope === 'program') {
      const timeline = buildProgramTimeline(doc)
      if (timeline.durationMs <= 0) {
        set({ error: '成片还没有镜头' })
        return
      }
      set({
        playing: true,
        programMs: programMs >= timeline.durationMs ? 0 : programMs
      })
      return
    }
    const shot = doc.shots.find((item) => item.id === selectedShotId)
    if (!shot) {
      set({ error: '请先选择一个镜头' })
      return
    }
    set({
      playing: true,
      playbackMs: playbackMs >= shot.durationMs ? 0 : playbackMs
    })
  },

  pause: () => set({ playing: false }),

  registerViewCapture: (handler) => set({ viewCaptureHandler: handler }),

  setViewMode: (mode) => {
    if (mode === 'camera' && !get().selectedCameraId && !get().doc?.cameras[0]) {
      set({ error: '场景还没有机位' })
      return
    }
    if (mode === 'camera') {
      const targetId = get().selectedCameraId ?? get().doc?.activeCameraId
      if (targetId) {
        get().applyCommands([{ type: 'setActiveCamera', cameraId: targetId }])
      }
    }
    set({ viewMode: mode, playing: false, drawMode: 'off' })
  },

  setTransformMode: (mode) => set({ transformMode: mode }),

  addObject: (type, assetPath) => {
    const { doc, selectedObjectId } = get()
    if (!doc) return null

    const sameType = doc.objects.filter((object) => object.type === type).length
    const anchor = selectedObjectId
      ? doc.objects.find((object) => object.id === selectedObjectId)
      : undefined
    const position: StageVec3 = anchor
      ? [
          anchor.transform.position[0] + 1.5,
          anchor.transform.position[1],
          anchor.transform.position[2]
        ]
      : [0, 0, 0]

    const object: StageObject = {
      id: `object_${crypto.randomUUID().slice(0, 8)}`,
      type,
      name: `${OBJECT_LABEL[type]} ${sameType + 1}`,
      transform: {
        position,
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
      ...(type === 'human' || type === 'crowd' ? { pose: 'stand' } : {}),
      ...(type === 'crowd' ? { count: 3 } : {}),
      ...(assetPath ? { assetPath } : {})
    }

    if (!get().applyCommands([{ type: 'addObject', object }])) return null
    set({ selectedObjectId: object.id, selectedCameraId: null })
    return object.id
  },

  addCamera: () => {
    const doc = get().doc
    if (!doc) return null

    const camera: StageCamera = {
      id: `camera_${crypto.randomUUID().slice(0, 8)}`,
      name: `机位 ${doc.cameras.length + 1}`,
      position: [5, 2.4, 6],
      target: [0, 1, 0],
      fov: 50
    }

    const applied = get().applyCommands([
      { type: 'addCamera', camera },
      { type: 'setActiveCamera', cameraId: camera.id }
    ])
    if (!applied) return null

    set({
      selectedObjectId: null,
      selectedCameraId: camera.id,
      viewMode: 'camera'
    })
    return camera.id
  },

  removeSelectedObject: () => {
    const objectId = get().selectedObjectId
    if (!objectId) return false
    if (!get().applyCommands([{ type: 'removeObject', objectId }])) return false
    set({ selectedObjectId: null })
    return true
  },

  removeSelectedCamera: () => {
    const cameraId = get().selectedCameraId
    if (!cameraId) return false
    if (!get().applyCommands([{ type: 'removeCamera', cameraId }])) return false
    set({ selectedCameraId: null, viewMode: 'director' })
    return true
  },

  updateObject: (objectId, patch) => {
    const commands: StageCommand[] = []
    if (patch.transform) {
      commands.push({ type: 'transformObject', objectId, transform: patch.transform })
    }
    if (patch.pose !== undefined) {
      commands.push({ type: 'setPose', objectId, pose: patch.pose })
    }
    if (patch.color !== undefined) {
      commands.push({ type: 'setColor', objectId, color: patch.color })
    }
    if (patch.visible !== undefined) {
      commands.push({ type: 'setVisible', objectId, visible: patch.visible })
    }
    if (patch.name !== undefined) {
      commands.push({ type: 'setName', objectId, name: patch.name })
    }
    if (patch.parentId !== undefined) {
      commands.push({ type: 'setParent', objectId, parentId: patch.parentId })
    }
    if (commands.length > 0) get().applyCommands(commands)
  },

  updateCamera: (cameraId, patch) => {
    get().applyCommands([{ type: 'updateCamera', cameraId, patch }])
  },

  setActiveCamera: (cameraId) => {
    const applied = get().applyCommands([
      { type: 'setActiveCamera', cameraId }
    ])
    if (!applied) return
    set({
      selectedCameraId: cameraId,
      viewMode: cameraId ? 'camera' : 'director'
    })
  },

  registerCapture: (handler) => set({ captureHandler: handler }),

  capture: () => get().captureHandler?.() ?? null,

  clearError: () => set({ error: null })
}))
