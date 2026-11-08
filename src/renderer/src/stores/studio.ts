import { create } from 'zustand'
import { loadLayout, saveLayout } from '../studio/persist'

export type StudioTab = 'linked' | 'library' | 'upload' | 'sounds'

interface StudioStore {
  open: boolean
  nodeId: string | null
  leftOpen: boolean
  rightOpen: boolean
  /** 时间线占剪辑室高度的比例，0.25 - 0.6 */
  timelineRatio: number
  tab: StudioTab
  openStudio: (nodeId?: string) => void
  closeStudio: () => void
  toggleLeft: () => void
  toggleRight: () => void
  setTimelineRatio: (ratio: number) => void
  setTab: (tab: StudioTab) => void
}

const initialLayout = loadLayout()

export const useStudioStore = create<StudioStore>((set) => ({
  open: false,
  nodeId: null,
  leftOpen: initialLayout?.leftOpen ?? true,
  rightOpen: initialLayout?.rightOpen ?? true,
  timelineRatio: initialLayout?.timelineRatio ?? 0.4,
  tab: 'linked',
  openStudio: (nodeId) =>
    set((state) => ({
      open: true,
      nodeId: nodeId ?? state.nodeId
    })),
  closeStudio: () => set({ open: false }),
  toggleLeft: () =>
    set((state) => {
      const leftOpen = !state.leftOpen
      saveLayout({ leftOpen, rightOpen: state.rightOpen, timelineRatio: state.timelineRatio })
      return { leftOpen }
    }),
  toggleRight: () =>
    set((state) => {
      const rightOpen = !state.rightOpen
      saveLayout({ leftOpen: state.leftOpen, rightOpen, timelineRatio: state.timelineRatio })
      return { rightOpen }
    }),
  setTimelineRatio: (timelineRatio) =>
    set((state) => {
      const next = Math.min(0.6, Math.max(0.25, timelineRatio))
      saveLayout({ leftOpen: state.leftOpen, rightOpen: state.rightOpen, timelineRatio: next })
      return { timelineRatio: next }
    }),
  setTab: (tab) => set({ tab })
}))
