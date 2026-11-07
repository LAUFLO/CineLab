import type { DepthTaskEvent } from '@shared/media'
import { useCanvasStore } from './canvas'
import { useUIStore } from './ui'

interface DepthTaskMeta {
  nodeId: string
  pendingNodeId: string
  title: string
}

const metas = new Map<string, DepthTaskMeta>()
let started = false
let unsubscribe: (() => void) | null = null

export function trackDepthTask(taskId: string, meta: DepthTaskMeta): void {
  metas.set(taskId, meta)
}

export function subscribeDepthTasks(): () => void {
  if (started) return () => undefined
  started = true

  unsubscribe = window.api.media.onDepthCaptureEvent((event) => {
    handleDepthEvent(event)
  })

  return () => {
    unsubscribe?.()
    unsubscribe = null
    started = false
  }
}

function markFailed(meta: DepthTaskMeta, message: string): void {
  useCanvasStore.getState().patchNodeData(meta.pendingNodeId, {
    status: 'error',
    error: message
  })
}

function handleDepthEvent(event: DepthTaskEvent): void {
  const showToast = useUIStore.getState().showToast
  const meta = metas.get(event.taskId)

  if (event.status === 'error') {
    metas.delete(event.taskId)
    if (meta) markFailed(meta, event.error ?? '深度动作捕捉失败')
    showToast(event.error ?? '深度动作捕捉失败', 'error')
    return
  }

  if (event.status === 'cancelled') {
    metas.delete(event.taskId)
    if (meta) markFailed(meta, '已取消')
    showToast('已取消深度动作捕捉')
    return
  }

  if (event.status !== 'done' || !event.result) return

  metas.delete(event.taskId)
  if (!meta) return

  useCanvasStore
    .getState()
    .applyOutput(meta.pendingNodeId, event.result.asset, '深度动作捕捉')

  showToast('深度动作捕捉完成')
}
