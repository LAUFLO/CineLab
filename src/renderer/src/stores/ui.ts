import { create } from 'zustand'
import type { XYPosition } from '@xyflow/react'

export interface MenuSource {
  nodeId: string
  handle: 'source' | 'target'
}

export interface MenuState {
  screen: XYPosition
  flow: XYPosition
  source?: MenuSource
}

interface UIStore {
  menu: MenuState | null
  openMenu: (menu: MenuState) => void
  closeMenu: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  menu: null,
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null })
}))
