import { create } from 'zustand'
import type {
  ConnectionTestInput,
  ConnectionTestResult,
  ProviderConfig,
  ProviderInput
} from '@shared/provider-schema'
import type { OperationBindings } from '@shared/operation-schema'

interface SettingsState {
  providers: ProviderConfig[]
  operationBindings: OperationBindings
  loaded: boolean
  panelOpen: boolean
  panelSection: string | null
  load: () => Promise<void>
  save: (input: ProviderInput) => Promise<ProviderConfig>
  remove: (id: string) => Promise<void>
  saveOperationBindings: (bindings: OperationBindings) => Promise<void>
  test: (input: ConnectionTestInput) => Promise<ConnectionTestResult>
  openPanel: (section?: string) => void
  closePanel: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: [],
  operationBindings: {},
  loaded: false,
  panelOpen: false,
  panelSection: null,

  load: async () => {
    const [providers, operationBindings] = await Promise.all([
      window.api.settings.listProviders(),
      window.api.settings.getOperationBindings()
    ])
    set({ providers, operationBindings, loaded: true })
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

  saveOperationBindings: async (bindings) => {
    await window.api.settings.saveOperationBindings(bindings)
    set({ operationBindings: bindings })
  },

  test: (input) => window.api.settings.testConnection(input),

  openPanel: (section) =>
    set({ panelOpen: true, panelSection: section ?? null }),
  closePanel: () => set({ panelOpen: false, panelSection: null })
}))
if (import.meta.env.DEV) {
  ;(window as unknown as { __settingsStore?: typeof useSettingsStore }).__settingsStore =
    useSettingsStore
}