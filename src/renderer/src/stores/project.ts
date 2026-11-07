import { create } from 'zustand'
import type {
  PersistedEdge,
  PersistedNode,
  ProjectMeta,
  ProjectSnapshot
} from '@shared/project-schema'
import type { ProjectTemplateId } from '@shared/project-templates'
import { useCanvasStore, type CineEdge, type CineNode } from './canvas'

type Phase = 'loading' | 'ready' | 'welcome' | 'error'

interface ProjectState {
  phase: Phase
  path: string | null
  name: string
  canvasId: string | null
  canvasName: string
  canvases: ProjectMeta['canvases']
  error: string | null
  saving: boolean
  lastSavedAt: string | null

  bootstrap: () => Promise<void>
  applySnapshot: (snapshot: ProjectSnapshot) => void
  startNew: (templateId?: ProjectTemplateId) => Promise<void>
  openExisting: () => Promise<void>
  openPath: (path: string) => Promise<void>
  scheduleSave: () => void
  saveNow: () => Promise<void>
  revealInFolder: () => Promise<void>
  renameProject: (name: string) => Promise<void>
  createCanvas: (name?: string) => Promise<void>
  switchCanvas: (canvasId: string) => Promise<void>
  renameCanvas: (canvasId: string, name: string) => Promise<void>
  deleteCanvas: (canvasId: string) => Promise<void>
  deleteProject: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useProjectStore = create<ProjectState>((set, get) => ({
  phase: 'loading',
  path: null,
  name: '未命名项目',
  canvasId: null,
  canvasName: '画布 1',
  canvases: [],
  error: null,
  saving: false,
  lastSavedAt: null,

  bootstrap: async () => {
    try {
      const snapshot = await window.api.project.bootstrap()

      if (!snapshot) {
        useCanvasStore.getState().loadCanvas([], [], { x: 0, y: 0, zoom: 1 })
        set({
          phase: 'welcome',
          path: null,
          name: 'CineLab',
          canvasId: null,
          canvasName: '',
          canvases: [],
          error: null
        })
        return
      }

      get().applySnapshot(snapshot)
    } catch (error) {
      set({ phase: 'welcome', error: String(error) })
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
      canvases: snapshot.meta.canvases,
      error: null,
      saving: false,
      lastSavedAt: null
    })
  },

  startNew: async (templateId) => {
    try {
      const snapshot = await window.api.project.pickCreate(templateId)
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
  },

  renameProject: async (name) => {
    const { path } = get()
    if (!path) return

    try {
      const meta = await window.api.project.rename(path, name)
      set({ name: meta.name, canvases: meta.canvases, error: null })
    } catch (error) {
      set({ error: String(error) })
    }
  },

  createCanvas: async (name) => {
    const { path } = get()
    if (!path) return

    try {
      await get().saveNow()
      const snapshot = await window.api.project.createCanvas(path, name)
      get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  switchCanvas: async (canvasId) => {
    const { path, canvasId: current } = get()
    if (!path || canvasId === current) return

    try {
      await get().saveNow()
      const snapshot = await window.api.project.switchCanvas(path, canvasId)
      get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  renameCanvas: async (canvasId, name) => {
    const { path } = get()
    if (!path) return

    try {
      const meta = await window.api.project.renameCanvas(path, canvasId, name)
      set({
        canvases: meta.canvases,
        canvasName:
          meta.canvases.find((item) => item.id === get().canvasId)?.name ??
          get().canvasName,
        error: null
      })
    } catch (error) {
      set({ error: String(error) })
    }
  },

  deleteCanvas: async (canvasId) => {
    const { path, canvases } = get()
    if (!path || canvases.length <= 1) return

    try {
      await get().saveNow()
      const snapshot = await window.api.project.deleteCanvas(path, canvasId)
      get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  deleteProject: async () => {
    try {
      const deleted = await window.api.project.delete()
      if (deleted) await get().bootstrap()
    } catch (error) {
      set({ error: String(error) })
    }
  }
}))
if (import.meta.env.DEV) {
  ;(window as unknown as { __projectStore?: typeof useProjectStore }).__projectStore =
    useProjectStore
}