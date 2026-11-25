import { create } from 'zustand'
import type {
  PersistedEdge,
  PersistedNode,
  ProjectMeta,
  ProjectSnapshot
} from '@shared/project-schema'
import type { ProjectTemplateId } from '@shared/project-templates'
import { useCanvasStore, type CineEdge, type CineNode } from './canvas'
import { usePreferencesStore } from './preferences'
import { useGenerationStore } from './generation'
import { useStudioStore } from './studio'
import { useFilmStudyStore } from './film-study'
import { useStageStore } from '../stage/stageStore'
import { useUIStore } from './ui'
import { confirmCancelStemTasks } from './stem-tasks'

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
  /** 画布有尚未写入磁盘的修改 */
  dirty: boolean
  lastSavedAt: string | null

  bootstrap: () => Promise<void>
  applySnapshot: (snapshot: ProjectSnapshot) => void
  startNew: (templateId?: ProjectTemplateId) => Promise<void>
  openExisting: () => Promise<void>
  openPath: (path: string) => Promise<void>
  createByAgent: (input: {
    name: string
    parentDir?: string
    template?: ProjectTemplateId
  }) => Promise<ProjectSnapshot>
  openByAgent: (path: string) => Promise<ProjectSnapshot>
  scheduleSave: () => void
  saveNow: (options?: { throwOnError?: boolean }) => Promise<void>
  closeProject: () => Promise<void>
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
  dirty: false,
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
          error: null,
          dirty: false
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
      dirty: false,
      lastSavedAt: null
    })
  },

  startNew: async (templateId) => {
    try {
      if (!(await confirmCancelStemTasks())) return
      const snapshot = await window.api.project.pickCreate(templateId)
      if (snapshot) get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  openExisting: async () => {
    try {
      if (!(await confirmCancelStemTasks())) return
      const snapshot = await window.api.project.pickOpen()
      if (snapshot) get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  openPath: async (path) => {
    try {
      if (!(await confirmCancelStemTasks())) return
      const snapshot = await window.api.project.open(path)
      get().applySnapshot(snapshot)
    } catch (error) {
      set({ error: String(error) })
    }
  },

  createByAgent: async (input) => {
    if (!(await confirmCancelStemTasks())) {
      throw new Error('已取消：当前有进行中的素材处理任务')
    }
    const snapshot = await window.api.project.create(
      input.name,
      input.parentDir,
      input.template
    )
    get().applySnapshot(snapshot)
    return snapshot
  },

  openByAgent: async (path) => {
    if (!(await confirmCancelStemTasks())) {
      throw new Error('已取消：当前有进行中的素材处理任务')
    }
    const snapshot = await window.api.project.open(path)
    get().applySnapshot(snapshot)
    return snapshot
  },

  scheduleSave: () => {
    if (saveTimer) clearTimeout(saveTimer)
    set({ dirty: true })
    const delay =
      usePreferencesStore.getState().preferences.project.autoSaveDelay
    saveTimer = setTimeout(() => {
      saveTimer = null
      void get().saveNow()
    }, delay)
  },

  saveNow: async (options) => {
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

      set({
        saving: false,
        dirty: false,
        lastSavedAt: new Date().toISOString(),
        error: null
      })
    } catch (error) {
      set({ saving: false, error: String(error) })
      if (options?.throwOnError) throw error
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
      if (!(await confirmCancelStemTasks())) return
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
      if (!(await confirmCancelStemTasks())) return
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

  closeProject: async () => {
    if (!(await confirmCancelStemTasks())) return

    const runIds = Object.values(useGenerationStore.getState().running)
    if (runIds.length > 0) {
      const confirmed = await new Promise<boolean>((resolve) => {
        useUIStore.getState().requestConfirm({
          title: '关闭项目？',
          message: `还有 ${runIds.length} 个生成任务在进行中，关闭项目会取消这些任务。`,
          confirmLabel: '关闭并取消',
          danger: true,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false)
        })
      })
      if (!confirmed) return
      await Promise.all(
        runIds.map((runId) =>
          window.api.generate.cancel(runId).catch(() => undefined)
        )
      )
    }

    try {
      await get().saveNow({ throwOnError: true })
      await window.api.project.close()
    } catch (error) {
      set({ error: String(error) })
      return
    }

    useStudioStore.getState().closeStudio()
    useStageStore.getState().closeStage()
    useFilmStudyStore.getState().closeSheet()
    useCanvasStore.getState().loadCanvas([], [], { x: 0, y: 0, zoom: 1 })
    set({
      phase: 'welcome',
      path: null,
      name: 'CineLab',
      canvasId: null,
      canvasName: '',
      canvases: [],
      saving: false,
      dirty: false,
      lastSavedAt: null,
      error: null
    })
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