import { ipcMain } from 'electron'
import type { ComponentKind } from '@shared/components'
import { COMPONENTS } from '../components/manifest'
import {
  checkComponentUpdates,
  installComponent,
  isComponentInstalled,
  listComponentStatus,
  pauseComponent,
  removeComponent
} from '../components/service'
import { listDepthTasks } from '../media/depth-tasks'
import { hasActiveStemTasks } from '../media/stem-tasks'
import { listVisionTasks } from '../media/vision-tasks'
import { hasActiveTranscriptions } from '../timeline/transcribe'

function assertKind(value: unknown): ComponentKind {
  if (typeof value !== 'string' || !Object.hasOwn(COMPONENTS, value)) {
    throw new Error('未知的组件类型')
  }
  return value as ComponentKind
}

function isActive(status: string): boolean {
  return status === 'queued' || status === 'running'
}

function componentInUse(kind: ComponentKind): boolean {
  switch (kind) {
    case 'vision-models':
      return listVisionTasks().some((task) => isActive(task.status))
    case 'depth-model':
      return listDepthTasks().some((task) => isActive(task.status))
    case 'stem-model':
      return hasActiveStemTasks()
    case 'depth-runtime':
      return (
        hasActiveStemTasks() ||
        listVisionTasks().some((task) => isActive(task.status)) ||
        listDepthTasks().some((task) => isActive(task.status)) ||
        hasActiveTranscriptions()
      )
    case 'whisper-runtime':
    case 'whisper-model':
      return hasActiveTranscriptions()
    default:
      return false
  }
}

export function registerComponentsIpc(): void {
  ipcMain.handle('components:status', () => listComponentStatus())

  ipcMain.handle('components:check-updates', (_event, force?: unknown) =>
    checkComponentUpdates(force === true)
  )

  ipcMain.handle('components:install', async (_event, kind: unknown) => {
    const target = assertKind(kind)
    if (
      (await isComponentInstalled(target)) &&
      componentInUse(target)
    ) {
      throw new Error('组件正在使用中，请等待任务完成后再更新')
    }
    void installComponent(target).catch(() => undefined)
    return { started: true }
  })

  ipcMain.handle('components:pause', (_event, kind: unknown) =>
    pauseComponent(assertKind(kind))
  )

  ipcMain.handle('components:remove', (_event, kind: unknown) => {
    const target = assertKind(kind)
    if (
      (target === 'stem-model' || target === 'depth-runtime') &&
      hasActiveStemTasks()
    ) {
      throw new Error('有分离任务正在使用，请先取消任务')
    }
    return removeComponent(target)
  })
}
