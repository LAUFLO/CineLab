import { app, ipcMain, shell } from 'electron'
import type {
  ConnectionTestInput,
  ProviderInput
} from '@shared/provider-schema'
import type { Preferences } from '@shared/preferences'
import {
  deleteProvider,
  fetchModels,
  getOperationBindings,
  listProviders,
  saveOperationBindings,
  saveProvider,
  testConnection
} from '../settings/store'
import {
  getPreferences,
  resetPreferences,
  savePreferences
} from '../settings/preferences'
import { generationQueue } from '../engine/queue'
import type { OperationBindings } from '@shared/operation-schema'
import {
  ensureModelsFile,
  modelsConfigStatus
} from '../settings/models-config'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:list-providers', () => listProviders())
  ipcMain.handle('settings:save-provider', (_event, input: ProviderInput) =>
    saveProvider(input)
  )
  ipcMain.handle('settings:delete-provider', (_event, id: string) =>
    deleteProvider(id)
  )
  ipcMain.handle('settings:test-connection', (_event, input: ConnectionTestInput) =>
    testConnection(input)
  )
  ipcMain.handle('settings:fetch-models', (_event, input: ConnectionTestInput) =>
    fetchModels(input)
  )
  ipcMain.handle('settings:models-config', () => modelsConfigStatus())
  ipcMain.handle('settings:operation-bindings', () => getOperationBindings())
  ipcMain.handle(
    'settings:save-operation-bindings',
    (_event, bindings: OperationBindings) => saveOperationBindings(bindings)
  )
  ipcMain.handle('settings:open-models-file', async () => {
    const file = await ensureModelsFile()
    await shell.openPath(file)
    return file
  })
  ipcMain.handle('settings:get-preferences', () => getPreferences())
  ipcMain.handle(
    'settings:save-preferences',
    async (_event, input: Preferences) => {
      const next = await savePreferences(input)
      generationQueue.setConcurrency(next.generation.concurrency)
      return next
    }
  )
  ipcMain.handle('settings:reset-preferences', async () => {
    const next = await resetPreferences()
    generationQueue.setConcurrency(next.generation.concurrency)
    return next
  })
  ipcMain.handle('settings:open-data-dir', async () => {
    await shell.openPath(app.getPath('userData'))
  })
}
