import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
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
import { log, logDirectory } from '../logger'

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

  ipcMain.handle('app:open-logs', async () => {
    await shell.openPath(logDirectory())
  })

  ipcMain.handle(
    'app:log',
    (_event, level: 'info' | 'warn' | 'error', message: string) => {
      const text = `[renderer] ${String(message).slice(0, 2000)}`
      if (level === 'error') log.error(text)
      else if (level === 'warn') log.warn(text)
      else log.info(text)
    }
  )

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
