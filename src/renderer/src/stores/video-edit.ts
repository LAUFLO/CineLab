import { create } from 'zustand'
import type { VideoOperationId } from '@shared/operation-schema'

interface VideoEditState {
  open: boolean
  nodeId: string | null
  operation: VideoOperationId
  openPanel: (nodeId: string, operation: VideoOperationId) => void
  closePanel: () => void
  setOperation: (operation: VideoOperationId) => void
}

export const useVideoEditStore = create<VideoEditState>((set) => ({
  open: false,
  nodeId: null,
  operation: 'shot-retake',
  openPanel: (nodeId, operation) =>
    set({ open: true, nodeId, operation }),
  closePanel: () => set({ open: false, nodeId: null }),
  setOperation: (operation) => set({ operation })
}))
