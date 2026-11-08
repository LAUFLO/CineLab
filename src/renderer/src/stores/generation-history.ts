import { create } from 'zustand'
import type { GenerateRequest } from '@shared/generation'
import { isGroupNode, useCanvasStore } from './canvas'
import { usePreferencesStore } from './preferences'

export type GenerationHistoryStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface GenerationHistoryEntry {
  nodeId: string
  runId?: string
  title: string
  request: GenerateRequest
  status: GenerationHistoryStatus
  error?: string
  retryable?: boolean
  createdAt: string
  finishedAt?: string
}

interface GenerationHistoryState {
  entries: GenerationHistoryEntry[]
  start: (request: GenerateRequest) => void
  bindRun: (nodeId: string, runId: string) => void
  finish: (nodeId: string, status: 'done' | 'cancelled') => void
  fail: (nodeId: string, error: string, retryable?: boolean) => void
  remove: (nodeId: string) => void
  clear: () => void
  trim: () => void
}

const STORAGE_KEY = 'cinelab.generation-history'
const FALLBACK_LIMIT = 50

function persistLimit(): number {
  const value = usePreferencesStore.getState().preferences.generation.historyLimit
  return Number.isFinite(value) ? value : FALLBACK_LIMIT
}

function memoryLimit(): number {
  const limit = persistLimit()
  return limit === 0 ? FALLBACK_LIMIT : limit
}

function loadEntries(): GenerationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GenerationHistoryEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, memoryLimit()) : []
  } catch {
    return []
  }
}

function saveEntries(entries: GenerationHistoryEntry[]): void {
  try {
    const limit = persistLimit()
    if (limit === 0) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, limit))
    )
  } catch {
    // 历史记录持久化失败不影响生成流程
  }
}

function titleFor(nodeId: string): string {
  const found = useCanvasStore
    .getState()
    .nodes.find((node) => node.id === nodeId)
  if (found && !isGroupNode(found)) return found.data.title
  return '生成任务'
}

export const useGenerationHistoryStore = create<GenerationHistoryState>(
  (set, get) => {
    const commit = (entries: GenerationHistoryEntry[]): void => {
      const next = entries.slice(0, memoryLimit())
      saveEntries(next)
      set({ entries: next })
    }

    const update = (
      nodeId: string,
      patch: Partial<GenerationHistoryEntry>
    ): void => {
      commit(
        get().entries.map((entry) =>
          entry.nodeId === nodeId ? { ...entry, ...patch } : entry
        )
      )
    }

    return {
      entries: loadEntries(),

      start: (request) => {
        const entry: GenerationHistoryEntry = {
          nodeId: request.nodeId,
          title: titleFor(request.nodeId),
          request,
          status: 'running',
          createdAt: new Date().toISOString()
        }
        commit([
          entry,
          ...get().entries.filter(
            (item) => item.nodeId !== request.nodeId
          )
        ])
      },

      bindRun: (nodeId, runId) => update(nodeId, { runId }),

      finish: (nodeId, status) =>
        update(nodeId, {
          status,
          finishedAt: new Date().toISOString(),
          error: undefined,
          retryable: undefined
        }),

      fail: (nodeId, error, retryable) =>
        update(nodeId, {
          status: 'error',
          error,
          retryable,
          finishedAt: new Date().toISOString()
        }),

      remove: (nodeId) =>
        commit(get().entries.filter((entry) => entry.nodeId !== nodeId)),

      clear: () => commit([]),

      trim: () => {
        if (persistLimit() === 0) {
          saveEntries([])
          set({ entries: [] })
          return
        }
        commit(get().entries)
      }
    }
  }
)
