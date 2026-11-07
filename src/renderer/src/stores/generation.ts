import { create } from 'zustand'
import { NODE_META, TITLE_HEIGHT, type CineNodeData, type OutputRef } from '@shared/canvas-schema'
import type { GenerateRequest } from '@shared/generation'
import { isGroupNode, useCanvasStore } from './canvas'
import { useGenerationHistoryStore } from './generation-history'
import { usePreferencesStore } from './preferences'
import { useUIStore } from './ui'

function notifyGenerationDone(title: string): void {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    const notification = new Notification('生成完成', {
      body: `${title} 已完成`
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // 系统通知失败不影响生成流程
  }
}

interface GenerationState {
  running: Record<string, string>
  subscribe: () => () => void
  run: (
    request: GenerateRequest,
    options?: { retry?: boolean }
  ) => Promise<void>
  cancel: (nodeId: string) => Promise<void>
}

const retryCounts = new Map<string, number>()

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
          useGenerationHistoryStore
            .getState()
            .bindRun(event.nodeId, event.runId)
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
          const found = useCanvasStore
            .getState()
            .nodes.find((item) => item.id === event.nodeId)
          const node = found && !isGroupNode(found) ? found : undefined

          const incoming: OutputRef[] = event.assets.map((asset) => ({
            id: asset.id,
            path: asset.path,
            kind: asset.kind,
            createdAt: asset.createdAt,
            model: asset.model,
            width: asset.width,
            height: asset.height,
            op: asset.op
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

          const sized = event.assets.find(
            (asset) => asset.width && asset.height && asset.width > 0
          )
          if (sized?.width && sized.height) {
            const kind = node?.data.kind ?? 'image'
            const baseWidth = node?.measured?.width ?? NODE_META[kind].width
            const nextHeight = Math.round((baseWidth * sized.height) / sized.width)
            useCanvasStore.getState().resizeNode(event.nodeId, nextHeight + TITLE_HEIGHT)
          }

          const running = { ...get().running }
          delete running[event.nodeId]
          set({ running })
          retryCounts.delete(event.nodeId)
          useGenerationHistoryStore.getState().finish(event.nodeId, 'done')

          const preferences = usePreferencesStore.getState().preferences
          if (
            preferences.generation.notifyOnComplete &&
            typeof document !== 'undefined' &&
            !document.hasFocus()
          ) {
            notifyGenerationDone(node?.data.title ?? '生成任务')
          }
          break
        }

        case 'error': {
          const preferences = usePreferencesStore.getState().preferences
          const attempts = retryCounts.get(event.nodeId) ?? 0
          const entry = useGenerationHistoryStore
            .getState()
            .entries.find((item) => item.nodeId === event.nodeId)
          const shouldRetry =
            event.retryable &&
            Boolean(entry) &&
            attempts < preferences.generation.autoRetry

          useGenerationHistoryStore
            .getState()
            .fail(event.nodeId, event.message, event.retryable)

          const running = { ...get().running }
          delete running[event.nodeId]
          set({ running })

          if (shouldRetry && entry) {
            retryCounts.set(event.nodeId, attempts + 1)
            patchNode(event.nodeId, {
              status: 'queued',
              progress: 0,
              error: undefined
            })
            useUIStore
              .getState()
              .showToast(
                `生成失败，正在自动重试 ${attempts + 1}/${preferences.generation.autoRetry}`,
                'error'
              )
            window.setTimeout(() => {
              void get().run(entry.request, { retry: true })
            }, 800)
            break
          }

          patchNode(event.nodeId, {
            status: 'error',
            progress: 0,
            error: event.message
          })
          useUIStore
            .getState()
            .showToast(
              event.retryable
                ? `生成失败：${event.message}（可重试）`
                : `生成失败：${event.message}`,
              'error'
            )
          break
        }

        case 'cancelled': {
          patchNode(event.nodeId, { status: 'idle', progress: 0 })

          const running = { ...get().running }
          delete running[event.nodeId]
          set({ running })
          retryCounts.delete(event.nodeId)
          useGenerationHistoryStore
            .getState()
            .finish(event.nodeId, 'cancelled')
          break
        }
      }
    }),

  run: async (request, options) => {
    if (!options?.retry) retryCounts.delete(request.nodeId)
    useGenerationHistoryStore.getState().start(request)
    try {
      await window.api.generate.run(request)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patchNode(request.nodeId, { status: 'error', error: message })
      useGenerationHistoryStore.getState().fail(request.nodeId, message, false)
      useUIStore.getState().showToast(`生成失败：${message}`, 'error')
    }
  },

  cancel: async (nodeId) => {
    const runId = get().running[nodeId]
    if (runId) {
      await window.api.generate.cancel(runId)
    }
  }
}))
