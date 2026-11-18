import { ipcMain } from 'electron'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  initUpdateService,
  installUpdate,
  openFallbackDownload
} from '../update/service'

export function registerUpdateIpc(): void {
  initUpdateService()

  ipcMain.handle('update:get-state', () => getUpdateStatus())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => {
    installUpdate()
  })
  ipcMain.handle('update:open-fallback', () => openFallbackDownload())
}
