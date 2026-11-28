import { create } from 'zustand'
import type { ComponentKind, ComponentUpdateInfo } from '@shared/components'

interface ComponentsState {
  updates: Partial<Record<ComponentKind, ComponentUpdateInfo>>
  updateCount: number
  checking: boolean
  check: (force?: boolean) => Promise<void>
}

export const useComponentsStore = create<ComponentsState>((set) => ({
  updates: {},
  updateCount: 0,
  checking: false,
  check: async (force) => {
    set({ checking: true })
    try {
      const items = await window.api.components.checkUpdates(force)
      const updates: Partial<Record<ComponentKind, ComponentUpdateInfo>> = {}
      for (const item of items) updates[item.kind] = item
      set({
        updates,
        updateCount: items.filter((item) => item.updateAvailable).length,
        checking: false
      })
    } catch {
      set({ checking: false })
    }
  }
}))
