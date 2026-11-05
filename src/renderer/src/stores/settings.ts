import { create } from 'zustand'
import type {
  ConnectionTestInput,
  ConnectionTestResult,
  ProviderConfig,
  ProviderInput
} from '@shared/provider-schema'

interface SettingsState {
  providers: ProviderConfig[]
  loaded: boolean
  panelOpen: boolean
  load: () => Promise<void>
  save: (input: ProviderInput) => Promise<ProviderConfig>
  remove: (id: string) => Promise<void>
  test: (input: ConnectionTestInput) => Promise<ConnectionTestResult>
  openPanel: () => void
  closePanel: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: [],
  loaded: false,
  panelOpen: false,

  load: async () => {
    const providers = await window.api.settings.listProviders()
    set({ providers, loaded: true })
  },

  save: async (input) => {
    const saved = await window.api.settings.saveProvider(input)
    await get().load()
    return saved
  },

  remove: async (id) => {
    await window.api.settings.deleteProvider(id)
    await get().load()
  },

  test: (input) => window.api.settings.testConnection(input),

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false })
}))
if (import.meta.env.DEV) {
  ;(window as unknown as { __settingsStore?: typeof useSettingsStore }).__settingsStore =
    useSettingsStore
}