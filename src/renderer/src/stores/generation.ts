import { create } from 'zustand'
import {
  mediaFrameNodeSize,
  mediaFramePixels,
  type CineNodeData,
  type OutputRef
} from '@shared/canvas-schema'
import type { GenerateRequest } from '@shared/generation'
import { useCanvasStore } from './canvas'
import { trimLayerOutputs } from '../canvas/nodes/layer-compose'
import { useGenerationHistoryStore } from './generation-history'
import { usePreferencesStore } from './preferences'
import { useUIStore } from './ui'

function notifyGenerationDone(title: string): void {
  try {
    window.api.app.notify('生成完成', `${title} 已完成`)
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
          const node = found && found.type === 'cine' ? found : undefined

          const hasLayers = event.assets.some((asset) => asset.layer)
          const sortedAssets = hasLayers
            ? [...event.assets].sort(
                (a, b) => (a.layer?.zIndex ?? 0) - (b.layer?.zIndex ?? 0)
              )
            : event.assets
          const baseAsset = hasLayers
            ? (sortedAssets.find((asset) => asset.layer?.zIndex === 0) ??
              sortedAssets[0])
            : undefined
          const baseWidth = baseAsset?.width ?? 0
          const baseHeight = baseAsset?.height ?? 0
          const groupId = hasLayers ? event.runId : undefined

          const layerTransform = (asset: (typeof event.assets)[number]) => {
            if (!asset.layer) return undefined
            const absolute = asset.layer.boundingBox?.absolute
            if (absolute) {
              return {
                x: absolute[0],
                y: absolute[1],
                width: Math.max(1, absolute[2] - absolute[0]),
                height: Math.max(1, absolute[3] - absolute[1])
              }
            }
            const normalized = asset.layer.boundingBox?.normalized
            if (normalized && baseWidth > 0 && baseHeight > 0) {
              return {
                x: (normalized[0] / 1000) * baseWidth,
                y: (normalized[1] / 1000) * baseHeight,
                width: Math.max(
                  1,
                  ((normalized[2] - normalized[0]) / 1000) * baseWidth
                ),
                height: Math.max(
                  1,
                  ((normalized[3] - normalized[1]) / 1000) * baseHeight
                )
              }
            }
            if (asset.layer.zIndex === 0 && baseWidth > 0 && baseHeight > 0) {
              return { x: 0, y: 0, width: baseWidth, height: baseHeight }
            }
            return undefined
          }

          const incoming: OutputRef[] = sortedAssets.map((asset) => ({
            id: asset.id,
            path: asset.path,
            kind: asset.kind,
            createdAt: asset.createdAt,
            model: asset.model,
            width: asset.width,
            height: asset.height,
            op: asset.op,
            ...(asset.layer
              ? {
                  layer: asset.layer,
                  ...(groupId ? { layerGroupId: groupId } : {}),
                  ...(layerTransform(asset)
                    ? { layerTransform: layerTransform(asset) }
                    : {}),
                  layerAttached: true,
                  layerVisible: true,
                  layerLocked: asset.layer.zIndex === 0
                }
              : {}),
            ...(asset.textRecognition
              ? { textRecognition: asset.textRecognition }
              : {})
          }))

          // 图层拆分最多返回 1 张底图 + 99 个图层，不能按普通版本数量截断
          const activeGroupId = incoming.find(
            (output) => output.layerGroupId
          )?.layerGroupId
          const outputs = trimLayerOutputs(
            incoming,
            node?.data.outputs ?? [],
            activeGroupId
          )
          const baseOutput = incoming.find(
            (output) => output.layer?.zIndex === 0
          )

          const text = event.assets.find(
            (asset) => asset.kind === 'text' && asset.text
          )?.text

          patchNode(event.nodeId, {
            status: 'done',
            progress: 100,
            error: undefined,
            outputs,
            selectedOutputId: baseOutput?.id ?? outputs[0]?.id,
            ...(text ? { text } : {})
          })

          const sized = sortedAssets.find(
            (asset) => asset.width && asset.height && asset.width > 0
          )
          if (
            sized?.width &&
            sized.height &&
            node &&
            (node.data.kind === 'image' || node.data.kind === 'video')
          ) {
            const frame = node.data.mediaFrame ?? 'standard'
            const size = mediaFrameNodeSize(
              sized.width,
              sized.height,
              mediaFramePixels(frame)
            )
            useCanvasStore
              .getState()
              .resizeNode(event.nodeId, size.height, size.width)
            if (node.parentId) {
              useCanvasStore
                .getState()
                .syncGroupBounds(node.parentId)
            }
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
