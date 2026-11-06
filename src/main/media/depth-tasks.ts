import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  DepthCaptureRequest,
  DepthCaptureResult,
  DepthTaskEvent
} from '@shared/media'
import { captureDepth } from './depth'

interface DepthTask {
  id: string
  controller: AbortController
  status: DepthTaskEvent['status']
  startedAt: number
}

const tasks = new Map<string, DepthTask>()

function emit(event: DepthTaskEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('depth-task:event', event)
    }
  }
}

export function startDepthTask(
  projectRoot: string,
  request: DepthCaptureRequest
): { taskId: string } {
  const taskId = randomUUID()
  const controller = new AbortController()
  const task: DepthTask = {
    id: taskId,
    controller,
    status: 'queued',
    startedAt: Date.now()
  }
  tasks.set(taskId, task)

  emit({ taskId, status: 'queued', percent: 0 })

  void (async () => {
    task.status = 'running'
    emit({ taskId, status: 'running', percent: 0 })

    try {
      const result = await captureDepth(projectRoot, request, {
        signal: controller.signal,
        onProgress: (percent, message) => {
          emit({
            taskId,
            status: 'running',
            percent: Math.max(0, Math.min(100, Math.round(percent))),
            message
          })
        }
      })

      task.status = 'done'
      emit({ taskId, status: 'done', percent: 100, result })
    } catch (error) {
      if (controller.signal.aborted) {
        task.status = 'cancelled'
        emit({ taskId, status: 'cancelled' })
        return
      }
      task.status = 'error'
      emit({
        taskId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setTimeout(() => tasks.delete(taskId), 60_000).unref()
    }
  })()

  return { taskId }
}

export function cancelDepthTask(taskId: string): void {
  tasks.get(taskId)?.controller.abort()
}

export function cancelAllDepthTasks(): void {
  for (const task of tasks.values()) {
    task.controller.abort()
  }
}

export function listDepthTasks(): DepthTaskEvent[] {
  return [...tasks.values()].map((task) => ({
    taskId: task.id,
    status: task.status
  }))
}
