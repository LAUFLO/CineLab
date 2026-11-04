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

export interface ConfirmState {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

interface UIStore {
  menu: MenuState | null
  pendingPrompt: string | null
  confirm: ConfirmState | null
  snapToGrid: boolean
  edgesVisible: boolean
  minimapVisible: boolean
  fitViewToken: number
  arrangeToken: number
  openMenu: (menu: MenuState) => void
  closeMenu: () => void
  applyPrompt: (prompt: string) => void
  clearPendingPrompt: () => void
  requestConfirm: (confirm: ConfirmState) => void
  closeConfirm: () => void
  toggleSnap: () => void
  toggleEdges: () => void
  toggleMinimap: () => void
  requestFitView: () => void
  requestArrange: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  menu: null,
  pendingPrompt: null,
  confirm: null,
  snapToGrid: false,
  edgesVisible: true,
  minimapVisible: false,
  fitViewToken: 0,
  arrangeToken: 0,
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  applyPrompt: (prompt) => set({ pendingPrompt: prompt }),
  clearPendingPrompt: () => set({ pendingPrompt: null }),
  requestConfirm: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),
  toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
  toggleEdges: () => set((state) => ({ edgesVisible: !state.edgesVisible })),
  toggleMinimap: () => set((state) => ({ minimapVisible: !state.minimapVisible })),
  requestFitView: () => set((state) => ({ fitViewToken: state.fitViewToken + 1 })),
  requestArrange: () => set((state) => ({ arrangeToken: state.arrangeToken + 1 }))
}))
