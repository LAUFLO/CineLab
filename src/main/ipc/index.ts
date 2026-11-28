import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  Notification,
  shell
} from 'electron'
import type { ThemeMode } from '../../shared/ipc-contract'
import { registerProjectIpc } from './project'
import { registerWorkflowIpc } from './workflow'
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
import { registerSceneIpc } from './scene'
import { registerSkillsIpc } from './skills'
import { registerComponentsIpc } from './components'
import { registerUpdateIpc } from './update'
import { registerLocalAdapterIpc } from './local-adapters'
import { registerMcpCommandIpc } from '../mcp/write-runner'
import { registerMcpIpc } from './mcp'
import { log, logDirectory } from '../logger'
import { allowWindowClose, brandIconPath } from '../window'
import { isAllowedExternalUrl } from '../security/external-url'

function windowFromEvent(sender: Electron.WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender)
}

export function registerIpc(): void {
  registerProjectIpc()
  registerWorkflowIpc()
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
  registerSceneIpc()
  registerSkillsIpc()
  registerComponentsIpc()
  registerUpdateIpc()
  registerLocalAdapterIpc()
  registerMcpCommandIpc()
  registerMcpIpc()

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

  ipcMain.on('app:hide-to-tray', (event) => {
    const win = windowFromEvent(event.sender)
    if (!win || win.isDestroyed()) return
    win.hide()
    win.setSkipTaskbar(true)
  })

  ipcMain.on('app:restore-window', (event) => {
    const win = windowFromEvent(event.sender)
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.setSkipTaskbar(false)
    win.show()
    win.focus()
  })

  ipcMain.on('app:quit', () => {
    app.quit()
  })

  ipcMain.on('app:request-quit', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) return
    win.setSkipTaskbar(false)
    win.show()
    win.focus()
    win.webContents.send('app:quit-requested')
  })

  ipcMain.handle('app:open-logs', async () => {
    await shell.openPath(logDirectory())
  })

  ipcMain.handle('app:open-external', async (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) return false
    await shell.openExternal(url)
    return true
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

  ipcMain.on('app:notify', (event, title: string, body: string) => {
    if (typeof title !== 'string' || typeof body !== 'string') return

    const senderWindow = windowFromEvent(event.sender)
    const notification = new Notification({
      title: title.slice(0, 120),
      body: body.slice(0, 500),
      icon: nativeImage.createFromPath(brandIconPath('notification'))
    })

    notification.on('click', () => {
      const win =
        senderWindow && !senderWindow.isDestroyed()
          ? senderWindow
          : BrowserWindow.getAllWindows()[0]
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.setSkipTaskbar(false)
      win.show()
      win.focus()
    })

    notification.show()
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
