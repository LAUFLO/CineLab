import type { StemMode, StemTaskEvent } from '@shared/media'
import { selectedNodeOutput, useCanvasStore } from './canvas'
import { useUIStore } from './ui'

interface StemTaskMeta {
  pendingVideoId?: string
  pendingAudioId?: string
  sourceNodeId: string
  mode: StemMode
  title: string
}

const metas = new Map<string, StemTaskMeta>()
const cancelRequested = new Set<string>()
let started = false
let unsubscribeCanvas: (() => void) | null = null

export function trackStemTask(taskId: string, meta: StemTaskMeta): void {
  metas.set(taskId, meta)
}

function pendingIds(meta: StemTaskMeta): string[] {
  return [meta.pendingVideoId, meta.pendingAudioId].filter(
    (id): id is string => Boolean(id)
  )
}

function patchNodes(ids: string[], patch: Record<string, unknown>): void {
  const state = useCanvasStore.getState()
  for (const id of ids) state.patchNodeData(id, patch)
}

function clearTaskFields(id: string): void {
  useCanvasStore.getState().patchNodeData(id, {
    stemTaskId: undefined,
    stemQueuePosition: undefined
  })
}

function handleStemEvent(event: StemTaskEvent): void {
  const showToast = useUIStore.getState().showToast
  const meta = metas.get(event.taskId)
  if (!meta) return

  const ids = pendingIds(meta)

  if (event.status === 'queued' || event.status === 'running') {
    patchNodes(ids, {
      status: event.status,
      progress: Math.max(0, Math.min(100, event.percent ?? 0)),
      error: undefined,
      ...(event.queuePosition
        ? { stemQueuePosition: event.queuePosition }
        : {})
    })
    return
  }

  if (event.status === 'error') {
    metas.delete(event.taskId)
    cancelRequested.delete(event.taskId)
    for (const id of ids) {
      clearTaskFields(id)
      useCanvasStore.getState().patchNodeData(id, {
        status: 'error',
        error: event.error ?? `${meta.title}失败`
      })
    }
    showToast(event.error ?? `${meta.title}失败`, 'error')
    return
  }

  if (event.status === 'cancelled') {
    metas.delete(event.taskId)
    cancelRequested.delete(event.taskId)
    for (const id of ids) {
      clearTaskFields(id)
      useCanvasStore.getState().patchNodeData(id, {
        status: 'error',
        error: '已取消'
      })
    }
    showToast(`已取消${meta.title}`)
    return
  }

  if (event.status !== 'done' || !event.result) return

  metas.delete(event.taskId)
  cancelRequested.delete(event.taskId)
  const state = useCanvasStore.getState()

  if (event.result.video && meta.pendingVideoId) {
    state.applyOutput(meta.pendingVideoId, event.result.video, 'split-av-video')
  }
  if (event.result.audio && meta.pendingAudioId) {
    state.applyOutput(meta.pendingAudioId, event.result.audio, 'split-av-audio')
  }

  for (const id of ids) clearTaskFields(id)
  showToast(`${meta.title}完成`)
}

export function subscribeStemTasks(): () => void {
  if (started) return () => undefined
  started = true

  const unsubscribeApi = window.api.media.onStemTaskEvent((event) => {
    handleStemEvent(event)
  })

  unsubscribeCanvas = useCanvasStore.subscribe((state, previous) => {
    if (state.nodes === previous.nodes) return

    const ids = new Set(state.nodes.map((node) => node.id))
    for (const [taskId, meta] of [...metas]) {
      if (cancelRequested.has(taskId)) continue
      const tracked = pendingIds(meta)
      const missingPending = tracked.some((id) => !ids.has(id))
      const missingSource = !ids.has(meta.sourceNodeId)
      if (!missingPending && !missingSource) continue

      // 占位节点、组或源视频被删除时，取消整个分离任务；
      // meta 先保留，等 cancelled 事件把剩余占位节点标成“已取消”。
      cancelRequested.add(taskId)
      void window.api.media.cancelStemTask(taskId)
    }
  })

  return () => {
    unsubscribeApi()
    unsubscribeCanvas?.()
    unsubscribeCanvas = null
    cancelRequested.clear()
    metas.clear()
    started = false
  }
}

export function hasTrackedStemTasks(): boolean {
  return metas.size > 0
}

export function cancelStemTaskFromNode(nodeId: string): boolean {
  const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId)
  const taskId =
    node && typeof node.data.stemTaskId === 'string'
      ? node.data.stemTaskId
      : null
  if (!taskId) return false
  void window.api.media.cancelStemTask(taskId)
  return true
}

export function cancelAllTrackedStemTasks(): void {
  for (const [taskId] of metas) {
    void window.api.media.cancelStemTask(taskId)
  }
  cancelRequested.clear()
  metas.clear()
}

/** 项目/画布切换前确认；确认后取消任务。返回 false 表示用户放弃切换。 */
export async function confirmCancelStemTasks(): Promise<boolean> {
  if (metas.size === 0) return true

  const confirmed = await new Promise<boolean>((resolve) => {
    useUIStore.getState().requestConfirm({
      title: '有分离任务正在进行',
      message:
        '切换项目或画布会取消正在进行的分离任务。已生成的素材不受影响，任务需要重新发起。',
      confirmLabel: '取消任务并继续',
      danger: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    })
  })

  if (!confirmed) return false
  cancelAllTrackedStemTasks()
  return true
}

function readNodeTask(nodeId: string): {
  node: ReturnType<typeof useCanvasStore.getState>['nodes'][number]
  mode: StemMode
  sourceNodeId: string
  pendingIds: string[]
} | null {
  const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId)
  if (!node) return null

  const mode = node.data.stemMode
  const sourceNodeId = node.data.stemSourceNodeId
  const pending = node.data.stemPendingIds
  if (
    (mode !== 'vocal' && mode !== 'background') ||
    typeof sourceNodeId !== 'string' ||
    !Array.isArray(pending)
  ) {
    return null
  }

  const ids = pending.filter((id): id is string => typeof id === 'string')
  const present = new Set(
    useCanvasStore.getState().nodes.map((entry) => entry.id)
  )
  if (ids.length === 0 || ids.some((id) => !present.has(id))) return null

  return { node, mode, sourceNodeId, pendingIds: ids }
}

export async function retryStemTask(nodeId: string): Promise<boolean> {
  const showToast = useUIStore.getState().showToast
  const task = readNodeTask(nodeId)
  if (!task) {
    showToast('占位节点不完整，请重新发起提取', 'error')
    return false
  }

  const source = useCanvasStore
    .getState()
    .nodes.find((item) => item.id === task.sourceNodeId)
  if (!source) {
    showToast('源视频已不存在，无法重试', 'error')
    return false
  }

  const output = selectedNodeOutput(source)
  if (!output) {
    showToast('源节点还没有可用输出', 'error')
    return false
  }

  const state = useCanvasStore.getState()
  for (const id of task.pendingIds) {
    state.patchNodeData(id, {
      status: 'running',
      progress: 0,
      error: undefined,
      stemTaskId: undefined,
      stemQueuePosition: undefined
    })
  }

  try {
    const { taskId, queuePosition } =
      await window.api.media.startStemTask({
        path: output.path,
        mode: task.mode,
        sourceKind: source.data.kind === 'video' ? 'video' : 'audio',
        title: source.data.title
      })

    const pendingVideoId = task.pendingIds.find((id) => {
      const node = useCanvasStore.getState().nodes.find((item) => item.id === id)
      return node?.data.kind === 'video'
    })
    const pendingAudioId = task.pendingIds.find((id) => {
      const node = useCanvasStore.getState().nodes.find((item) => item.id === id)
      return node?.data.kind === 'audio'
    })

    trackStemTask(taskId, {
      ...(pendingVideoId ? { pendingVideoId } : {}),
      ...(pendingAudioId ? { pendingAudioId } : {}),
      sourceNodeId: task.sourceNodeId,
      mode: task.mode,
      title: source.data.title
    })
    for (const id of task.pendingIds) {
      useCanvasStore.getState().patchNodeData(id, {
        status: queuePosition > 1 ? 'queued' : 'running',
        progress: 0,
        error: undefined,
        stemTaskId: taskId,
        stemQueuePosition: queuePosition,
        stemMode: task.mode,
        stemSourceNodeId: task.sourceNodeId,
        stemPendingIds: task.pendingIds
      })
    }
    showToast(task.mode === 'vocal' ? '已重新开始人声提取' : '已重新开始背景音提取')
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    for (const id of task.pendingIds) {
      useCanvasStore.getState().patchNodeData(id, {
        status: 'error',
        error: message
      })
    }
    showToast(message, 'error')
    return false
  }
}
