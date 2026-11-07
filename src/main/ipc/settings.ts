import { ipcMain, shell } from 'electron'
import type {
  ConnectionTestInput,
  ProviderInput
} from '@shared/provider-schema'
import {
  deleteProvider,
  fetchModels,
  getOperationBindings,
  listProviders,
  saveOperationBindings,
  saveProvider,
  testConnection
} from '../settings/store'
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
}
