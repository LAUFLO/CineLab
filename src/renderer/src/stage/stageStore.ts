import { create } from 'zustand'
import type {
  DirectorStageDoc,
  StageCamera,
  StageObject,
  StageObjectType,
  StageShot,
  StageTransform,
  StageVec3
} from '@shared/stage-schema'
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

export type StageViewMode = 'director' | 'camera'
export type StageTransformMode = 'translate' | 'rotate' | 'scale'

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
  viewMode: StageViewMode
  transformMode: StageTransformMode
  playing: boolean
  playbackMs: number
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
  addShot: () => string | null
  removeSelectedShot: () => boolean
  setShotDuration: (durationMs: number) => boolean
  captureKeyframe: () => boolean
  removeKeyframe: (index: number) => boolean
  seek: (timeMs: number) => void
  play: () => void
  pause: () => void
  registerViewCapture: (
    handler: (() => StageViewCapture | null) | null
  ) => void
  setViewMode: (mode: StageViewMode) => void
  setTransformMode: (mode: StageTransformMode) => void
  setActiveCamera: (cameraId: string | null) => void
  addObject: (type: StageObjectType) => string | null
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

export const useStageStore = create<StageState>((set, get) => ({
  open: false,
  nodeId: null,
  doc: null,
  history: createStageHistory(),
  selectedObjectId: null,
  selectedCameraId: null,
  selectedShotId: null,
  selectedKeyframeIndex: null,
  viewMode: 'director',
  transformMode: 'translate',
  playing: false,
  playbackMs: 0,
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
      viewMode: 'director',
      transformMode: 'translate',
      playing: false,
      playbackMs: 0,
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
        viewMode: 'director',
        playing: false,
        playbackMs: 0
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
      viewMode: 'director',
      playing: false,
      playbackMs: 0,
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

    set({
      doc: result.doc,
      history: shouldPushHistory ? pushStageHistory(history, doc) : history,
      dirty: true,
      error: null
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
    set({ doc: next.doc, history: next.history, dirty: true })
    syncStageNodeSummary(nodeId, next.doc)
  },

  redo: () => {
    const { doc, history, nodeId } = get()
    if (!doc || !nodeId) return
    const next = redoStageHistory(history, doc)
    if (!next) return
    set({ doc: next.doc, history: next.history, dirty: true })
    syncStageNodeSummary(nodeId, next.doc)
  },

  selectObject: (objectId) =>
    set({ selectedObjectId: objectId, playing: false }),

  selectCamera: (cameraId) => {
    if (cameraId) {
      const applied = get().applyCommands([
        { type: 'setActiveCamera', cameraId }
      ])
      set({
        selectedObjectId: null,
        selectedCameraId: cameraId,
        viewMode: applied ? 'camera' : get().viewMode,
        playing: false
      })
      return
    }
    set({ selectedCameraId: null, viewMode: 'director', playing: false })
  },

  selectShot: (shotId) =>
    set({
      selectedShotId: shotId,
      selectedKeyframeIndex: null,
      playbackMs: 0,
      playing: false
    }),

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

    const track = (shot.cameraTrack ?? []).filter(
      (key) => key.timeMs <= duration
    )
    const actionTracks = (shot.actionTracks ?? [])
      .map((action) => ({
        ...action,
        keys: action.keys.filter((key) => key.timeMs <= duration)
      }))
      .filter((action) => action.keys.length > 0)

    const applied = get().applyCommands([
      {
        type: 'updateShot',
        shotId: selectedShotId,
        patch: {
          durationMs: duration,
          cameraTrack: track.length > 0 ? track : undefined,
          actionTracks: actionTracks.length > 0 ? actionTracks : undefined
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
      easing: 'linear'
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

  play: () => {
    const { doc, selectedShotId, playbackMs } = get()
    const shot = doc?.shots.find((item) => item.id === selectedShotId)
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
    set({ viewMode: mode, playing: false })
  },

  setTransformMode: (mode) => set({ transformMode: mode }),

  addObject: (type) => {
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
      ...(type === 'crowd' ? { count: 3 } : {})
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
