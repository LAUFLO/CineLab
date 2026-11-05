import { ipcMain, shell } from 'electron'
import type {
  ConnectionTestInput,
  ProviderInput
} from '@shared/provider-schema'
import {
  deleteProvider,
  listProviders,
  saveProvider,
  testConnection
} from '../settings/store'
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
  ipcMain.handle('settings:models-config', () => modelsConfigStatus())
  ipcMain.handle('settings:open-models-file', async () => {
    const file = await ensureModelsFile()
    await shell.openPath(file)
    return file
  })
}
