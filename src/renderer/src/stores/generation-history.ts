import { create } from 'zustand'
import type { GenerateRequest } from '@shared/generation'
import { isGroupNode, useCanvasStore } from './canvas'

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
}

const STORAGE_KEY = 'cinelab.generation-history'
const LIMIT = 50

function loadEntries(): GenerationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GenerationHistoryEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, LIMIT) : []
  } catch {
    return []
  }
}

function saveEntries(entries: GenerationHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
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
      const next = entries.slice(0, LIMIT)
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

      clear: () => commit([])
    }
  }
)
