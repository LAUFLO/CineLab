import { ipcMain } from 'electron'
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
}
