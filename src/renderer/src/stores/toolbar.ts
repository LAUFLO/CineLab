import { create } from 'zustand'
import type { NodeKind } from '@shared/canvas-schema'

const STORAGE_KEY = 'cinelab.node-toolbar.v1'
const MAX_PRIMARY = 6

export type PinnedMap = Partial<Record<NodeKind, string[]>>

interface ToolbarStore {
  pinned: PinnedMap | null
  settingsKind: NodeKind | null
  openSettings: (kind: NodeKind) => void
  closeSettings: () => void
  togglePin: (kind: NodeKind, opId: string, defaultIds: string[]) => void
  resetPinned: (kind: NodeKind) => void
}

function loadPinned(): PinnedMap | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as PinnedMap
  } catch {
    return null
  }
}

function savePinned(pinned: PinnedMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned))
  } catch {
    // localStorage 不可用时静默失败，工具栏仍按内存状态工作
  }
}

export const useToolbarStore = create<ToolbarStore>((set, get) => ({
  pinned: loadPinned(),
  settingsKind: null,

  openSettings: (kind) => set({ settingsKind: kind }),
  closeSettings: () => set({ settingsKind: null }),

  togglePin: (kind, opId, defaultIds) => {
    const current = get().pinned?.[kind] ?? defaultIds
    const isPinned = current.includes(opId)
    if (!isPinned && current.length >= MAX_PRIMARY) return

    const next = isPinned
      ? current.filter((id) => id !== opId)
      : [...current, opId]
    const pinned = { ...(get().pinned ?? {}), [kind]: next }

    savePinned(pinned)
    set({ pinned })
  },

  resetPinned: (kind) => {
    const pinned = { ...(get().pinned ?? {}) }
    delete pinned[kind]
    savePinned(pinned)
    set({ pinned })
  }
}))

export const TOOLBAR_MAX_PRIMARY = MAX_PRIMARY
