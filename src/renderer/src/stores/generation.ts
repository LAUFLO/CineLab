import { create } from 'zustand'
import type { CineNodeData, OutputRef } from '@shared/canvas-schema'
import type { GenerateRequest } from '@shared/generation'
import { useCanvasStore } from './canvas'

interface GenerationState {
  running: Record<string, string>
  subscribe: () => () => void
  run: (request: GenerateRequest) => Promise<void>
  cancel: (nodeId: string) => Promise<void>
}

function patchNode(nodeId: string, patch: Partial<CineNodeData>): void {
  useCanvasStore.getState().patchNodeData(nodeId, patch)
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  running: {},

  subscribe: () =>
    window.api.generate.onEvent((event) => {
      switch (event.type) {
        case 'queued': {
          set({ running: { ...get().running, [event.nodeId]: event.runId } })
          patchNode(event.nodeId, {
            status: 'queued',
            progress: 0,
            error: undefined
          })
          break
        }

        case 'progress': {
          patchNode(event.nodeId, {
            status: 'running',
            progress: event.percent
          })
          break
        }

        case 'done': {
          const node = useCanvasStore
            .getState()
            .nodes.find((item) => item.id === event.nodeId)

          const incoming: OutputRef[] = event.assets.map((asset) => ({
            id: asset.id,
            path: asset.path,
            kind: asset.kind,
            createdAt: asset.createdAt,
            model: asset.model
          }))

          const outputs = [...incoming, ...(node?.data.outputs ?? [])].slice(0, 20)

          const text = event.assets.find(
            (asset) => asset.kind === 'text' && asset.text
          )?.text

          patchNode(event.nodeId, {
            status: 'done',
            progress: 100,
            error: undefined,
            outputs,
            selectedOutputId: outputs[0]?.id,
            ...(text ? { text } : {})
          })

          const running = { ...get().running }
          delete running[event.nodeId]
          set({ running })
          break
        }

        case 'error': {
          patchNode(event.nodeId, {
            status: 'error',
            progress: 0,
            error: event.message
          })

          const running = { ...get().running }
          delete running[event.nodeId]
          set({ running })
          break
        }

        case 'cancelled': {
          patchNode(event.nodeId, { status: 'idle', progress: 0 })

          const running = { ...get().running }
          delete running[event.nodeId]
          set({ running })
          break
        }
      }
    }),

  run: async (request) => {
    try {
      await window.api.generate.run(request)
    } catch (error) {
      patchNode(request.nodeId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  cancel: async (nodeId) => {
    const runId = get().running[nodeId]
    if (runId) {
      await window.api.generate.cancel(runId)
    }
  }
}))
