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
  placement?: 'above' | 'cursor'
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

export type CanvasTool = 'select' | 'hand'

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
  tool: CanvasTool
  addMenuToken: number
  addMenuAnchor: XYPosition | null
  shortcutsOpen: boolean
  historyOpen: boolean
  searchOpen: boolean
  setTool: (tool: CanvasTool) => void
  requestAddMenu: (anchor?: XYPosition) => void
  openShortcuts: () => void
  closeShortcuts: () => void
  openHistory: () => void
  closeHistory: () => void
  openSearch: () => void
  closeSearch: () => void
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
  tool: 'select',
  addMenuToken: 0,
  addMenuAnchor: null,
  shortcutsOpen: false,
  historyOpen: false,
  searchOpen: false,
  setTool: (tool) => set({ tool }),
  requestAddMenu: (anchor) =>
    set((state) => ({
      addMenuToken: state.addMenuToken + 1,
      addMenuAnchor: anchor ?? null
    })),
  openShortcuts: () =>
    set({ shortcutsOpen: true, historyOpen: false, searchOpen: false }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
  openHistory: () =>
    set({ historyOpen: true, shortcutsOpen: false, searchOpen: false }),
  closeHistory: () => set({ historyOpen: false }),
  openSearch: () =>
    set({ searchOpen: true, historyOpen: false, shortcutsOpen: false }),
  closeSearch: () => set({ searchOpen: false }),
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
  requestFitView: () => set((state) => ({ fitViewToken: state.fitViewToken + 1 })),
  requestArrange: () => set((state) => ({ arrangeToken: state.arrangeToken + 1 }))
}))
