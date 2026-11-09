import { create } from 'zustand'
import type { DirectorStageDoc } from '@shared/stage-schema'
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

interface StageState {
  open: boolean
  nodeId: string | null
  doc: DirectorStageDoc | null
  history: StageHistoryState
  selectedObjectId: string | null
  selectedCameraId: string | null
  viewMode: StageViewMode
  loading: boolean
  saving: boolean
  dirty: boolean
  error: string | null
  captureHandler: (() => string | null) | null

  openStage: (nodeId: string) => Promise<void>
  closeStage: () => void
  applyCommands: (commands: StageCommand[]) => boolean
  undo: () => void
  redo: () => void
  selectObject: (objectId: string | null) => void
  selectCamera: (cameraId: string | null) => void
  setViewMode: (mode: StageViewMode) => void
  setActiveCamera: (cameraId: string | null) => void
  registerCapture: (handler: (() => string | null) | null) => void
  capture: () => string | null
  clearError: () => void
}

function syncStageNode(nodeId: string, doc: DirectorStageDoc): void {
  useCanvasStore.getState().patchStageNode(nodeId, {
    objectCount: doc.objects.length,
    cameraCount: doc.cameras.length,
    shotCount: doc.shots.length,
    activeCameraId: doc.activeCameraId
  })
}

export const useStageStore = create<StageState>((set, get) => ({
  open: false,
  nodeId: null,
  doc: null,
  history: createStageHistory(),
  selectedObjectId: null,
  selectedCameraId: null,
  viewMode: 'director',
  loading: false,
  saving: false,
  dirty: false,
  error: null,
  captureHandler: null,

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
      viewMode: 'director',
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
        viewMode: 'director'
      })
      syncStageNode(nodeId, doc)
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
        .then(() => syncStageNode(nodeId, doc))
        .catch(() => undefined)
    }
    set({
      open: false,
      nodeId: null,
      doc: null,
      history: createStageHistory(),
      selectedObjectId: null,
      selectedCameraId: null,
      viewMode: 'director',
      loading: false,
      saving: false,
      dirty: false,
      error: null,
      captureHandler: null
    })
  },

  applyCommands: (commands) => {
    const { doc, nodeId } = get()
    if (!doc || !nodeId) return false

    const result = applyStageCommands(doc, commands)
    if (!result.ok) {
      set({ error: result.error ?? '场景命令执行失败' })
      return false
    }

    set({
      doc: result.doc,
      history: pushStageHistory(get().history, doc),
      dirty: true,
      error: null
    })
    syncStageNode(nodeId, result.doc)
    return true
  },

  undo: () => {
    const { doc, history, nodeId } = get()
    if (!doc || !nodeId) return
    const next = undoStageHistory(history, doc)
    if (!next) return
    set({ doc: next.doc, history: next.history, dirty: true })
    syncStageNode(nodeId, next.doc)
  },

  redo: () => {
    const { doc, history, nodeId } = get()
    if (!doc || !nodeId) return
    const next = redoStageHistory(history, doc)
    if (!next) return
    set({ doc: next.doc, history: next.history, dirty: true })
    syncStageNode(nodeId, next.doc)
  },

  selectObject: (objectId) => set({ selectedObjectId: objectId }),

  selectCamera: (cameraId) => {
    if (cameraId) {
      const applied = get().applyCommands([
        { type: 'setActiveCamera', cameraId }
      ])
      set({
        selectedCameraId: cameraId,
        viewMode: applied ? 'camera' : get().viewMode
      })
      return
    }
    set({ selectedCameraId: null, viewMode: 'director' })
  },

  setViewMode: (mode) => {
    if (mode === 'camera' && !get().selectedCameraId && !get().doc?.cameras[0]) {
      set({ error: '场景还没有机位' })
      return
    }
    set({ viewMode: mode })
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
