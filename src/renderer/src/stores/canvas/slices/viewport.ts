

import type { StateCreator } from 'zustand'
import type { CanvasStore } from '../../canvas'

type ViewportSlice = Pick<CanvasStore, 'setBoxSelecting' | 'setViewport'>

export const createViewportSlice: StateCreator<
  CanvasStore,
  [],
  [],
  ViewportSlice
> = (set, get) => ({
setBoxSelecting: (value) => {
    set({ boxSelecting: value })
  },
setViewport: (viewport) => {
    set({ viewport })
  },
})
