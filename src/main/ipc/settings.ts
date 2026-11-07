import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  ConnectionTestInput,
  ProviderInput
} from '@shared/provider-schema'
import {
  normalizePreferences,
  type Preferences
} from '@shared/preferences'
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
import { applyRuntimePreferences } from '../settings/apply'
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
      await applyRuntimePreferences(next)
      return next
    }
  )
  ipcMain.handle('settings:reset-preferences', async () => {
    const next = await resetPreferences()
    await applyRuntimePreferences(next)
    return next
  })
  ipcMain.handle('settings:export-preferences', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '导出通用设置',
      defaultPath: join(app.getPath('documents'), 'cinelab-preferences.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) return { canceled: true }

    const preferences = await getPreferences()
    await fs.writeFile(
      result.filePath,
      `${JSON.stringify(preferences, null, 2)}\n`,
      'utf8'
    )
    return { path: result.filePath }
  })
  ipcMain.handle('settings:import-preferences', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '导入通用设置',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null

    const raw = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')) as unknown
    const next = await savePreferences(normalizePreferences(raw))
    await applyRuntimePreferences(next)
    return next
  })
  ipcMain.handle('settings:choose-project-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '选择默认项目目录',
      properties: ['openDirectory' as const, 'createDirectory' as const]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle('settings:open-data-dir', async () => {
    await shell.openPath(app.getPath('userData'))
  })
}
