import { create } from 'zustand'
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type CapabilityGroup,
  type Preferences
} from '@shared/preferences'
import { useUIStore } from './ui'

interface PreferencesState {
  preferences: Preferences
  loaded: boolean
  load: () => Promise<void>
  save: (next: Preferences) => Promise<void>
  updateStartup: (patch: Partial<Preferences['startup']>) => Promise<void>
  updateProject: (patch: Partial<Preferences['project']>) => Promise<void>
  updateCanvas: (patch: Partial<Preferences['canvas']>) => Promise<void>
  updateGeneration: (patch: Partial<Preferences['generation']>) => Promise<void>
  updateUpdates: (patch: Partial<Preferences['updates']>) => Promise<void>
  updateStorage: (patch: Partial<Preferences['storage']>) => Promise<void>
  updateUi: (patch: Partial<Preferences['ui']>) => Promise<void>
  updateNetwork: (patch: Partial<Preferences['network']>) => Promise<void>
  setDefaultModel: (group: CapabilityGroup, key: string | null) => Promise<void>
  toggleSnap: () => Promise<void>
  toggleMinimap: () => Promise<void>
  toggleEdges: () => Promise<void>
  refresh: () => Promise<void>
  reset: () => Promise<void>
}

/** 串行写盘，避免快速切换多个开关时旧值覆盖新值 */
let saveChain: Promise<void> = Promise.resolve()

function applySideEffects(preferences: Preferences): void {
  document.documentElement.dataset.reduceMotion = preferences.canvas.reduceMotion
    ? 'true'
    : 'false'
  useUIStore.setState({
    snapToGrid: preferences.canvas.snapToGrid,
    minimapVisible: preferences.canvas.minimapVisible,
    edgesVisible: preferences.canvas.edgesVisible
  })
  void window.api.app.setZoom(preferences.ui.scale / 100)
}

export const usePreferencesStore = create<PreferencesState>((set, get) => {
  const apply = (preferences: Preferences): void => {
    set({ preferences, loaded: true })
    applySideEffects(preferences)
  }

  const loaded = async (): Promise<void> => {
    if (!get().loaded) await get().load()
  }

  const write = (preferences: Preferences): Promise<void> => {
    const save = (): Promise<void> =>
      window.api.settings
        .savePreferences(preferences)
        .then(() => undefined)
        .catch(() => undefined)

    saveChain = saveChain.then(save, save)
    return saveChain
  }

  const commit = (next: Preferences): Promise<void> => {
    const preferences = normalizePreferences(next)
    // 先更新界面，再串行写盘；下一次修改会基于最新值继续合并
    apply(preferences)
    return write(preferences)
  }

  return {
    preferences: normalizePreferences(DEFAULT_PREFERENCES),
    loaded: false,

    load: async () => {
      if (get().loaded) return
      try {
        apply(normalizePreferences(await window.api.settings.getPreferences()))
      } catch {
        set({ loaded: true })
      }
    },

    save: async (next) => {
      await commit(next)
    },

    updateStartup: async (patch) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        startup: { ...current.startup, ...patch }
      })
    },

    updateProject: async (patch) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        project: { ...current.project, ...patch }
      })
    },

    updateCanvas: async (patch) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        canvas: { ...current.canvas, ...patch }
      })
    },

    updateGeneration: async (patch) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        generation: { ...current.generation, ...patch }
      })
    },

    updateUpdates: async (patch) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        updates: { ...current.updates, ...patch }
      })
    },

    updateStorage: async (patch) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        storage: { ...current.storage, ...patch }
      })
    },

    updateUi: async (patch) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        ui: { ...current.ui, ...patch }
      })
    },

    updateNetwork: async (patch) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        network: { ...current.network, ...patch }
      })
    },

    setDefaultModel: async (group, key) => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        generation: {
          ...current.generation,
          defaultModels: { ...current.generation.defaultModels, [group]: key }
        }
      })
    },

    toggleSnap: async () => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        canvas: { ...current.canvas, snapToGrid: !current.canvas.snapToGrid }
      })
    },

    toggleMinimap: async () => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        canvas: {
          ...current.canvas,
          minimapVisible: !current.canvas.minimapVisible
        }
      })
    },

    toggleEdges: async () => {
      await loaded()
      const current = get().preferences
      await commit({
        ...current,
        canvas: {
          ...current.canvas,
          edgesVisible: !current.canvas.edgesVisible
        }
      })
    },

    refresh: async () => {
      try {
        apply(normalizePreferences(await window.api.settings.getPreferences()))
      } catch {
        // 读取失败时保留当前值
      }
    },

    reset: async () => {
      const preferences = normalizePreferences(DEFAULT_PREFERENCES)
      apply(preferences)
      const run = async (): Promise<void> => {
        try {
          const saved = normalizePreferences(
            await window.api.settings.resetPreferences()
          )
          apply(saved)
        } catch {
          // 保持已应用的默认值，磁盘写入失败时下次启动会重新读取
        }
      }
      saveChain = saveChain.then(run, run)
      await saveChain
    }
  }
})
