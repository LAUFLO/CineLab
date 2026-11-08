import { applyCommand, type TimelineCommand } from './timeline-commands'
import type { TimelineDoc } from './timeline-schema'

export const HISTORY_LIMIT = 50

export interface TimelineHistory {
  past: TimelineDoc[]
  future: TimelineDoc[]
}

export function createHistory(): TimelineHistory {
  return { past: [], future: [] }
}

/** 记录一次编辑前的快照；新编辑会清空 redo 栈 */
export function pushHistory(
  history: TimelineHistory,
  before: TimelineDoc,
  limit = HISTORY_LIMIT
): TimelineHistory {
  const past = [...history.past, before]
  if (past.length > limit) past.shift()
  return { past, future: [] }
}

export interface HistoryStep {
  history: TimelineHistory
  doc: TimelineDoc
}

export function undo(history: TimelineHistory, current: TimelineDoc): HistoryStep | null {
  const previous = history.past[history.past.length - 1]
  if (!previous) return null
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current]
    },
    doc: previous
  }
}

export function redo(history: TimelineHistory, current: TimelineDoc): HistoryStep | null {
  const next = history.future[history.future.length - 1]
  if (!next) return null
  return {
    history: {
      past: [...history.past, current],
      future: history.future.slice(0, -1)
    },
    doc: next
  }
}

/**
 * 应用命令并入栈。
 * 一次命令（包括 batch）只产生一个历史步，撤销一次回到命令前。
 */
export function dispatch(
  history: TimelineHistory,
  doc: TimelineDoc,
  command: TimelineCommand,
  now?: string
): HistoryStep {
  return {
    history: pushHistory(history, doc),
    doc: applyCommand(doc, command, now)
  }
}

export interface HistoryState {
  history: TimelineHistory
  doc: TimelineDoc
}

export function createHistoryState(doc: TimelineDoc): HistoryState {
  return { history: createHistory(), doc }
}

export function dispatchHistory(state: HistoryState, command: TimelineCommand, now?: string): HistoryState {
  return dispatch(state.history, state.doc, command, now)
}

export function undoHistory(state: HistoryState): HistoryState {
  const step = undo(state.history, state.doc)
  return step ? { history: step.history, doc: step.doc } : state
}

export function redoHistory(state: HistoryState): HistoryState {
  const step = redo(state.history, state.doc)
  return step ? { history: step.history, doc: step.doc } : state
}
