import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import type { ThemeMode } from '../../shared/ipc-contract'
import { registerProjectIpc } from './project'
import { registerSettingsIpc } from './settings'
import { registerGenerateIpc } from './generate'
import { registerLibraryIpc } from './library'
import { registerExportIpc } from './export'
import { registerClipboardIpc } from './clipboard'
import { registerMediaIpc } from './media'
import { registerTimelineIpc } from './timeline'
import { registerAgentIpc } from './agent'
import { registerFilmStudyIpc } from './film-study'
import { registerStageIpc } from './stage'
import { registerSkillsIpc } from './skills'
import { registerComponentsIpc } from './components'
import { registerUpdateIpc } from './update'
import { log, logDirectory } from '../logger'
import { allowWindowClose } from '../window'

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
  registerTimelineIpc()
  registerAgentIpc()
  registerFilmStudyIpc()
  registerStageIpc()
  registerSkillsIpc()
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

  ipcMain.handle('app:set-zoom', (event, factor: number) => {
    const win = windowFromEvent(event.sender)
    if (!win || !Number.isFinite(factor)) return
    win.webContents.setZoomFactor(Math.min(2, Math.max(0.5, factor)))
  })

  ipcMain.on('app:confirm-close', (event) => {
    const win = windowFromEvent(event.sender)
    if (win) allowWindowClose(win)
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
