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

export interface ContextMenuState {
  screen: XYPosition
  flow: XYPosition
}

export interface ConfirmState {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

export interface ToastState {
  message: string
  tone: 'info' | 'error'
}

interface UIStore {
  menu: MenuState | null
  contextMenu: ContextMenuState | null
  pendingPrompt: string | null
  confirm: ConfirmState | null
  toast: ToastState | null
  snapToGrid: boolean
  edgesVisible: boolean
  minimapVisible: boolean
  fitViewToken: number
  arrangeToken: number
  groupRenameId: string | null
  startGroupRename: (id: string) => void
  clearGroupRename: () => void
  openMenu: (menu: MenuState) => void
  closeMenu: () => void
  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
  applyPrompt: (prompt: string) => void
  clearPendingPrompt: () => void
  requestConfirm: (confirm: ConfirmState) => void
  closeConfirm: () => void
  showToast: (message: string, tone?: ToastState['tone']) => void
  clearToast: () => void
  toggleSnap: () => void
  toggleEdges: () => void
  toggleMinimap: () => void
  requestFitView: () => void
  requestArrange: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  menu: null,
  contextMenu: null,
  pendingPrompt: null,
  confirm: null,
  toast: null,
  snapToGrid: false,
  edgesVisible: true,
  minimapVisible: false,
  fitViewToken: 0,
  arrangeToken: 0,
  groupRenameId: null,
  startGroupRename: (id) => set({ groupRenameId: id }),
  clearGroupRename: () => set({ groupRenameId: null }),
  openMenu: (menu) => set({ menu, contextMenu: null }),
  closeMenu: () => set({ menu: null }),
  openContextMenu: (contextMenu) => set({ contextMenu, menu: null }),
  closeContextMenu: () => set({ contextMenu: null }),
  applyPrompt: (prompt) => set({ pendingPrompt: prompt }),
  clearPendingPrompt: () => set({ pendingPrompt: null }),
  requestConfirm: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),
  showToast: (message, tone = 'info') => set({ toast: { message, tone } }),
  clearToast: () => set({ toast: null }),
  toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
  toggleEdges: () => set((state) => ({ edgesVisible: !state.edgesVisible })),
  toggleMinimap: () => set((state) => ({ minimapVisible: !state.minimapVisible })),
  requestFitView: () => set((state) => ({ fitViewToken: state.fitViewToken + 1 })),
  requestArrange: () => set((state) => ({ arrangeToken: state.arrangeToken + 1 }))
}))
