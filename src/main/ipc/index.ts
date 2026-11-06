import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import type { ThemeMode } from '../../shared/ipc-contract'
import { registerProjectIpc } from './project'
import { registerSettingsIpc } from './settings'
import { registerGenerateIpc } from './generate'
import { registerLibraryIpc } from './library'
import { registerExportIpc } from './export'
import { registerClipboardIpc } from './clipboard'
import { registerMediaIpc } from './media'
import { registerComponentsIpc } from './components'
import { registerUpdateIpc } from './update'

function windowFromEvent(sender: Electron.WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender)
}

export function registerIpc(): void {
  registerProjectIpc()
  registerSettingsIpc()
  registerGenerateIpc()
  registerLibraryIpc()
  registerExportIpc()
  registerClipboardIpc()
  registerMediaIpc()
  registerComponentsIpc()
  registerUpdateIpc()

  ipcMain.handle('app:get-info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: app.getPath('userData')
  }))

  ipcMain.handle('app:set-theme', (_event, theme: ThemeMode) => {
    nativeTheme.themeSource = theme
  })

  ipcMain.on('window:minimize', (event) => {
    windowFromEvent(event.sender)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = windowFromEvent(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    windowFromEvent(event.sender)?.close()
  })
}
