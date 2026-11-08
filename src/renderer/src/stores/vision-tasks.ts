import type { VisionTaskEvent } from '@shared/media'
import { useCanvasStore } from './canvas'
import { useUIStore } from './ui'

interface VisionTaskMeta {
  mode: 'pending' | 'apply'
  nodeId: string
  pendingIds: string[]
  op: string
  title: string
}

const metas = new Map<string, VisionTaskMeta>()
let started = false

export function trackVisionTask(taskId: string, meta: VisionTaskMeta): void {
  metas.set(taskId, meta)
}

export function subscribeVisionTasks(): () => void {
  if (started) return () => undefined
  started = true

  const unsubscribe = window.api.media.onVisionTaskEvent((event) => {
    handleEvent(event)
  })

  return () => {
    unsubscribe()
    started = false
  }
}

function setStatus(ids: string[], patch: Record<string, unknown>): void {
  const state = useCanvasStore.getState()
  for (const id of ids) state.patchNodeData(id, patch)
}

function handleEvent(event: VisionTaskEvent): void {
  const showToast = useUIStore.getState().showToast
  const meta = metas.get(event.taskId)
  if (!meta) return

  if (event.status === 'running' && typeof event.percent === 'number') {
    const ids = meta.mode === 'pending' ? meta.pendingIds : [meta.nodeId]
    setStatus(ids, {
      status: 'running',
      progress: Math.max(0, Math.min(100, event.percent)),
      error: undefined
    })
    return
  }

  if (event.status === 'error') {
    metas.delete(event.taskId)
    setStatus(
      meta.mode === 'pending' ? meta.pendingIds : [meta.nodeId],
      { status: 'error', error: event.error ?? `${meta.title}失败` }
    )
    showToast(event.error ?? `${meta.title}失败`, 'error')
    return
  }

  if (event.status === 'cancelled') {
    metas.delete(event.taskId)
    setStatus(
      meta.mode === 'pending' ? meta.pendingIds : [meta.nodeId],
      { status: 'error', error: '已取消' }
    )
    showToast(`已取消${meta.title}`)
    return
  }

  if (event.status !== 'done' || !event.result) return

  metas.delete(event.taskId)
  const state = useCanvasStore.getState()

  if (meta.mode === 'apply') {
    if (event.result.asset) {
      state.applyOutput(meta.nodeId, event.result.asset, meta.op)
    }
    showToast(`${meta.title}完成`)
    return
  }

  if (event.result.asset && meta.pendingIds[0]) {
    state.applyOutput(meta.pendingIds[0], event.result.asset, meta.op)
  }
  if (event.result.background && meta.pendingIds[1]) {
    state.applyOutput(meta.pendingIds[1], event.result.background, meta.op)
  }
  showToast(`${meta.title}完成`)
}
