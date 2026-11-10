import { create } from 'zustand'
import {
  applyCommand,
  applyCommands,
  type TimelineCommand
} from '@shared/timeline-commands'
import type { TimelineDoc } from '@shared/timeline-schema'
import {
  createHistory,
  pushHistory,
  redo as redoHistory,
  undo as undoHistory,
  type TimelineHistory
} from '@shared/timeline-history'

export type TimelineTool = 'select' | 'cut'

export interface ClipReferenceIssue {
  missing?: boolean
  updateAvailable?: boolean
}

/** 一轮 Agent 的多个时间线命令只压入一条历史记录 */
const commandTurns = new Set<string>()

interface TimelineStore {
  doc: TimelineDoc | null
  history: TimelineHistory
  selectedIds: string[]
  playheadMs: number
  zoom: number
  tool: TimelineTool
  snap: boolean
  magnet: boolean
  playing: boolean
  referenceIssues: Record<string, ClipReferenceIssue>
  load: (doc: TimelineDoc) => void
  dispatch: (command: TimelineCommand) => void
  dispatchMany: (commands: TimelineCommand[], turnId?: string) => void
  endCommandTurn: (turnId: string) => void
  undo: () => void
  redo: () => void
  setPlayhead: (ms: number) => void
  setZoom: (zoom: number) => void
  select: (ids: string[]) => void
  setTool: (tool: TimelineTool) => void
  toggleSnap: () => void
  toggleMagnet: () => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  setReferenceIssues: (issues: Record<string, ClipReferenceIssue>) => void
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  doc: null,
  history: createHistory(),
  selectedIds: [],
  playheadMs: 0,
  zoom: 1,
  tool: 'select',
  snap: true,
  magnet: true,
  playing: false,
  referenceIssues: {},

  load: (doc) =>
    set({
      doc,
      history: createHistory(),
      selectedIds: [],
      playheadMs: 0,
      referenceIssues: {}
    }),

  dispatch: (command) => {
    const { doc, history } = get()
    if (!doc) return
    set({
      doc: applyCommand(doc, command),
      history: pushHistory(history, doc)
    })
  },

  dispatchMany: (commands, turnId) => {
    const { doc, history } = get()
    if (!doc || commands.length === 0) return

    const shouldPushHistory = !turnId || !commandTurns.has(turnId)
    if (turnId && shouldPushHistory) commandTurns.add(turnId)

    set({
      doc: applyCommands(doc, commands),
      history: shouldPushHistory ? pushHistory(history, doc) : history
    })
  },

  endCommandTurn: (turnId) => {
    commandTurns.delete(turnId)
  },

  undo: () => {
    const { doc, history } = get()
    if (!doc) return
    const step = undoHistory(history, doc)
    if (step) set({ doc: step.doc, history: step.history, selectedIds: [] })
  },

  redo: () => {
    const { doc, history } = get()
    if (!doc) return
    const step = redoHistory(history, doc)
    if (step) set({ doc: step.doc, history: step.history, selectedIds: [] })
  },

  setPlayhead: (playheadMs) => set({ playheadMs: Math.max(0, playheadMs) }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.5, zoom)) }),
  select: (selectedIds) => set({ selectedIds }),
  setTool: (tool) => set({ tool }),
  toggleSnap: () => set((state) => ({ snap: !state.snap })),
  toggleMagnet: () => set((state) => ({ magnet: !state.magnet })),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  togglePlay: () => set((state) => ({ playing: !state.playing })),
  setReferenceIssues: (referenceIssues) => set({ referenceIssues })
}))
if (import.meta.env.DEV) {
  ;(
    window as unknown as { __timelineStore?: typeof useTimelineStore }
  ).__timelineStore = useTimelineStore
}
