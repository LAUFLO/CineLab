import type { DepthTaskEvent } from '@shared/media'
import { useCanvasStore } from './canvas'
import { useUIStore } from './ui'

interface DepthTaskMeta {
  nodeId: string
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

function handleDepthEvent(event: DepthTaskEvent): void {
  const showToast = useUIStore.getState().showToast
  const meta = metas.get(event.taskId)

  if (event.status === 'error') {
    metas.delete(event.taskId)
    showToast(event.error ?? '深度动作捕捉失败', 'error')
    return
  }

  if (event.status === 'cancelled') {
    metas.delete(event.taskId)
    showToast('已取消深度动作捕捉')
    return
  }

  if (event.status !== 'done' || !event.result) return

  metas.delete(event.taskId)
  if (!meta) return

  const state = useCanvasStore.getState()
  const source = state.nodes.find((node) => node.id === meta.nodeId)
  const width = source?.measured?.width ?? 320
  const origin = {
    x: (source?.position.x ?? 0) + width + 48,
    y: source?.position.y ?? 0
  }

  state.addAssetNodes(
    'video',
    origin,
    [event.result.asset],
    `${meta.title} · 深度`,
    meta.nodeId
  )

  showToast('深度动作捕捉完成')
}
