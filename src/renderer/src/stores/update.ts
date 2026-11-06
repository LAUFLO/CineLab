import { create } from 'zustand'
import type { UpdateStatus } from '@shared/update'

interface UpdateStore {
  status: UpdateStatus | null
  initialized: boolean
  init: () => void
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  status: null,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    void window.api.update.getState().then((status) => set({ status }))
    window.api.update.onEvent((status) => set({ status }))
  },

  check: async () => {
    set({ status: await window.api.update.check() })
  },

  download: async () => {
    set({ status: await window.api.update.download() })
  },

  install: async () => {
    await window.api.update.install()
  }
}))
