import { create } from 'zustand'
import type { CineNodeData } from '@shared/canvas-schema'
import type {
  FilmStudy,
  FilmStudyExtractRequest,
  FilmStudyProgress
} from '@shared/film-study'
import { useCanvasStore } from './canvas'

interface FilmStudyState {
  roomNodeId: string | null
  study: FilmStudy | null
  opening: boolean
  subscribe: () => () => void
  start: (input: FilmStudyExtractRequest) => Promise<void>
  cancel: (nodeId: string) => Promise<void>
  retry: (nodeId: string) => Promise<void>
  openRoom: (nodeId: string) => Promise<void>
  closeRoom: () => void
}

function patchNode(nodeId: string, patch: Partial<CineNodeData>): void {
  useCanvasStore.getState().patchNodeData(nodeId, patch)
}

function applyProgress(progress: FilmStudyProgress): void {
  if (progress.status === 'running') {
    patchNode(progress.nodeId, {
      status: 'running',
      progress: progress.percent,
      error: undefined
    })
    return
  }

  if (progress.status === 'done') {
    patchNode(progress.nodeId, {
      status: 'done',
      progress: 100,
      error: undefined,
      studyId: progress.studyId,
      studySummary: progress.studyId
        ? {
            studyId: progress.studyId,
            frameCount: progress.frameCount ?? progress.current ?? 0,
            segmentCount: 0,
            interval: progress.interval ?? 1,
            duration: progress.duration ?? 0,
            fps: progress.fps ?? 0
          }
        : undefined
    })
    return
  }

  if (progress.status === 'error') {
    patchNode(progress.nodeId, {
      status: 'error',
      progress: 0,
      error: progress.error ?? '抽帧失败'
    })
    return
  }

  patchNode(progress.nodeId, { status: 'idle', progress: 0 })
}

export const useFilmStudyStore = create<FilmStudyState>((set, get) => ({
  roomNodeId: null,
  study: null,
  opening: false,

  subscribe: () => window.api.filmStudy.onProgress(applyProgress),

  start: async (input) => {
    try {
      const result = await window.api.filmStudy.extract(input)
      if (result.cancelled) {
        patchNode(input.nodeId, { status: 'idle', progress: 0 })
        return
      }
      if (result.summary) {
        const summary = result.summary
        patchNode(input.nodeId, {
          status: 'done',
          progress: 100,
          error: undefined,
          studyId: summary.studyId,
          studySummary: summary
        })
      }
    } catch (error) {
      patchNode(input.nodeId, {
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  cancel: async (nodeId) => {
    await window.api.filmStudy.cancel(nodeId)
    patchNode(nodeId, { status: 'idle', progress: 0 })
  },

  retry: async (nodeId) => {
    const node = useCanvasStore
      .getState()
      .nodes.find((entry) => entry.id === nodeId)
    if (!node || node.data.kind !== 'study') return

    const data = node.data as CineNodeData
    if (!data.sourcePath) return

    patchNode(nodeId, { status: 'queued', progress: 0, error: undefined })
    await get().start({
      nodeId,
      path: data.sourcePath,
      scope: data.sourceScope,
      interval: data.studyInterval ?? 1,
      sourceName: data.sourceName,
      sourceNodeId: data.sourceNodeId
    })
  },

  openRoom: async (nodeId) => {
    const node = useCanvasStore
      .getState()
      .nodes.find((entry) => entry.id === nodeId)
    if (!node || node.data.kind !== 'study') return
    const data = node.data as CineNodeData
    if (!data.studyId) return

    set({ opening: true })
    try {
      const study = await window.api.filmStudy.load(data.studyId)
      set({ roomNodeId: nodeId, study, opening: false })
    } catch (error) {
      set({ opening: false })
      useCanvasStore.getState().patchNodeData(nodeId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  closeRoom: () => set({ roomNodeId: null, study: null })
}))
