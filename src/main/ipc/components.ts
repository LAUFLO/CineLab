import { ipcMain } from 'electron'
import type { ComponentKind } from '@shared/components'
import { COMPONENTS } from '../components/manifest'
import {
  installComponent,
  listComponentStatus,
  pauseComponent,
  removeComponent
} from '../components/service'

function assertKind(value: unknown): ComponentKind {
  if (typeof value !== 'string' || !Object.hasOwn(COMPONENTS, value)) {
    throw new Error('未知的组件类型')
  }
  return value as ComponentKind
}

export function registerComponentsIpc(): void {
  ipcMain.handle('components:status', () => listComponentStatus())

  ipcMain.handle('components:install', (_event, kind: unknown) => {
    const target = assertKind(kind)
    void installComponent(target).catch(() => undefined)
    return { started: true }
  })

  ipcMain.handle('components:pause', (_event, kind: unknown) =>
    pauseComponent(assertKind(kind))
  )

  ipcMain.handle('components:remove', (_event, kind: unknown) =>
    removeComponent(assertKind(kind))
  )
}
