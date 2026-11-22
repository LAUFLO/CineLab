import {
  BrowserWindow,
  Notification,
  nativeImage
} from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  StemTaskEvent,
  StemTaskRequest,
  StemTaskStartResult
} from '@shared/media'
import { brandIconPath } from '../window'
import { separateStems } from './stems'

interface StemTask {
  id: string
  projectRoot: string
  request: StemTaskRequest
  controller: AbortController
  status: StemTaskEvent['status']
  queuedAt: number
  startedAt?: number
}

const tasks = new Map<string, StemTask>()
const queue: string[] = []
let running = false

function emit(event: StemTaskEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('stem-task:event', event)
    }
  }
}

function modeLabel(mode: StemTaskRequest['mode']): string {
  return mode === 'vocal' ? '人声提取' : '背景音提取'
}

function notifyDone(task: StemTask): void {
  if (!Notification.isSupported()) return

  const focused = BrowserWindow.getAllWindows().some(
    (win) => !win.isDestroyed() && win.isFocused()
  )
  if (focused && Date.now() - task.queuedAt < 60_000) return

  const title = `${modeLabel(task.request.mode)}完成`
  const body = task.request.title
    ? `${task.request.title} 已写入画布`
    : '分离结果已写入画布'
  const notification = new Notification({
    title,
    body,
    icon: nativeImage.createFromPath(brandIconPath('notification'))
  })

  notification.on('click', () => {
    const win = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  notification.show()
}

async function pump(): Promise<void> {
  if (running) return
  const nextId = queue.shift()
  if (!nextId) return

  const task = tasks.get(nextId)
  if (!task || task.status !== 'queued') {
    void pump()
    return
  }

  running = true
  task.status = 'running'
  task.startedAt = Date.now()
  emit({ taskId: task.id, status: 'running', percent: 0 })

  try {
    const result = await separateStems(
      task.projectRoot,
      {
        path: task.request.path,
        mode: task.request.mode,
        ...(task.request.sourceKind
          ? { sourceKind: task.request.sourceKind }
          : {})
      },
      {
        signal: task.controller.signal,
        onProgress: (percent, message) => {
          emit({
            taskId: task.id,
            status: 'running',
            percent: Math.max(0, Math.min(100, Math.round(percent))),
            ...(message ? { message } : {})
          })
        }
      }
    )

    task.status = 'done'
    emit({ taskId: task.id, status: 'done', percent: 100, result })
    notifyDone(task)
  } catch (error) {
    if (task.controller.signal.aborted) {
      task.status = 'cancelled'
      emit({ taskId: task.id, status: 'cancelled' })
    } else {
      task.status = 'error'
      emit({
        taskId: task.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  } finally {
    running = false
    setTimeout(() => tasks.delete(task.id), 60_000).unref()
    // 让当前的 IPC 调用先返回，再启动下一个任务。
    setTimeout(() => void pump(), 0)
  }
}

export function startStemTask(
  projectRoot: string,
  request: StemTaskRequest
): StemTaskStartResult {
  if (request.mode !== 'vocal' && request.mode !== 'background') {
    throw new Error('不支持的分离模式')
  }

  const task: StemTask = {
    id: randomUUID(),
    projectRoot,
    request,
    controller: new AbortController(),
    status: 'queued',
    queuedAt: Date.now()
  }
  tasks.set(task.id, task)
  queue.push(task.id)

  const queuePosition = queue.length + (running ? 1 : 0)
  emit({
    taskId: task.id,
    status: 'queued',
    percent: 0,
    queuePosition
  })

  // 先让 IPC 把 taskId 返回给渲染进程，再开始跑模型。
  setTimeout(() => void pump(), 0)
  return { taskId: task.id, queuePosition }
}

export function cancelStemTask(taskId: string): void {
  const task = tasks.get(taskId)
  if (!task) return

  if (task.status === 'queued') {
    const index = queue.indexOf(taskId)
    if (index >= 0) queue.splice(index, 1)
    task.status = 'cancelled'
    emit({ taskId, status: 'cancelled' })
    setTimeout(() => tasks.delete(taskId), 60_000).unref()
    setTimeout(() => void pump(), 0)
    return
  }

  if (task.status === 'running') {
    task.controller.abort()
  }
}

export function cancelAllStemTasks(): void {
  queue.length = 0
  for (const task of tasks.values()) {
    if (task.status === 'queued') {
      task.status = 'cancelled'
      emit({ taskId: task.id, status: 'cancelled' })
      continue
    }
    if (task.status === 'running') {
      task.controller.abort()
    }
  }
}

export function hasActiveStemTasks(): boolean {
  return [...tasks.values()].some(
    (task) => task.status === 'queued' || task.status === 'running'
  )
}

export function listStemTasks(): StemTaskEvent[] {
  return [...tasks.values()].map((task) => ({
    taskId: task.id,
    status: task.status
  }))
}
