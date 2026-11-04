import { create } from 'zustand'
import type {
  PersistedEdge,
  PersistedNode,
  ProjectSnapshot
} from '@shared/project-schema'
import { useCanvasStore, type CineEdge, type CineNode } from './canvas'

type Phase = 'loading' | 'ready' | 'error'

interface ProjectState {
  phase: Phase
  path: string | null
  name: string
  canvasId: string | null
  canvasName: string
  error: string | null
  saving: boolean
  lastSavedAt: string | null

  bootstrap: () => Promise<void>
  applySnapshot: (snapshot: ProjectSnapshot) => void
  startNew: () => Promise<void>
  openExisting: () => Promise<void>
  openPath: (path: string) => Promise<void>
  scheduleSave: () => void
  saveNow: () => Promise<void>
  revealInFolder: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useProjectStore = create<ProjectState>((set, get) => ({
  phase: 'loading',
  path: null,
  name: '未命名项目',
  canvasId: null,
  canvasName: '画布 1',
  error: null,
  saving: false,
  lastSavedAt: null,

  bootstrap: async () => {
    try {
      const snapshot = await window.api.project.bootstrap()
      get().applySnapshot(snapshot)
    } catch (error) {
      set({ phase: 'error', error: String(error) })
    }
  },

  applySnapshot: (snapshot) => {
    useCanvasStore
      .getState()
      .loadCanvas(
        snapshot.canvas.nodes as unknown as CineNode[],
        snapshot.canvas.edges as unknown as CineEdge[],
        snapshot.canvas.viewport
      )

    set({
      phase: 'ready',
      path: snapshot.path,
      name: snapshot.meta.name,
      canvasId: snapshot.canvas.id,
      canvasName: snapshot.canvas.name,
      error: null,
      saving: false,
      lastSavedAt: null
    })
  },

  startNew: async () => {
    try {
      const snapshot = await window.api.project.pickCreate()
      if (snapshot) get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  openExisting: async () => {
    try {
      const snapshot = await window.api.project.pickOpen()
      if (snapshot) get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  openPath: async (path) => {
    try {
      const snapshot = await window.api.project.open(path)
      get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  scheduleSave: () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void get().saveNow()
    }, 600)
  },

  saveNow: async () => {
    const { path, canvasId, canvasName } = get()
    if (!path || !canvasId) return

    const canvas = useCanvasStore.getState()
    set({ saving: true })

    try {
      await window.api.project.saveCanvas(path, {
        schemaVersion: 1,
        id: canvasId,
        name: canvasName,
        viewport: canvas.viewport,
        nodes: canvas.nodes as unknown as PersistedNode[],
        edges: canvas.edges as unknown as PersistedEdge[]
      })

      set({ saving: false, lastSavedAt: new Date().toISOString(), error: null })
    } catch (error) {
      set({ saving: false, error: String(error) })
    }
  },

  revealInFolder: async () => {
    const { path } = get()
    if (path) await window.api.project.reveal(path)
  }
}))
