import { BrowserWindow, Tray, nativeImage, screen, ipcMain, app } from 'electron'
import { join } from 'node:path'
import { brandIconPath, createMainWindow } from '../window'

let tray: Tray | null = null
let menuWindow: BrowserWindow | null = null
let mainWindowRef: BrowserWindow | null = null
let menuReady = false

function mainWindow(): BrowserWindow | null {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) return mainWindowRef
  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 从托盘或通知恢复主窗口；后台态使用 hide，不重建窗口 */
export function requestQuitFromTray(): void {
  const win = mainWindow()
  hideMenuWindow()
  if (!win) {
    app.quit()
    return
  }
  win.setSkipTaskbar(false)
  win.show()
  win.focus()
  win.webContents.send('app:quit-requested')
}

export function restoreMainWindow(): void {
  let win = mainWindow()
  if (!win) {
    win = createMainWindow()
    mainWindowRef = win
  }
  if (win.isMinimized()) win.restore()
  win.setSkipTaskbar(false)
  win.show()
  win.focus()
  hideMenuWindow()
}

function hideMenuWindow(): void {
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.hide()
}

function showMenuWindow(): void {
  if (!tray) return

  if (!menuWindow || menuWindow.isDestroyed()) {
    menuReady = false
    menuWindow = new BrowserWindow({
      width: 120,
      height: 84,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    menuWindow.on('blur', hideMenuWindow)
    menuWindow.setHasShadow(false)
    menuWindow.setAlwaysOnTop(true, 'pop-up-menu')
    menuWindow.webContents.on('did-finish-load', () => {
      menuReady = true
    })
    if (process.env.ELECTRON_RENDERER_URL) {
      void menuWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#tray-menu`)
    } else {
      void menuWindow.loadFile(
        join(__dirname, '../../renderer/index.html'),
        { hash: 'tray-menu' }
      )
    }
  }

  const bounds = tray.getBounds()
  const size = menuWindow.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const anchor =
    bounds.width > 0 && bounds.height > 0
      ? bounds
      : { x: cursor.x, y: cursor.y, width: 0, height: 0 }
  const x = Math.round(
    clamp(
      anchor.x - 6,
      display.workArea.x + 8,
      display.workArea.x + display.workArea.width - size.width - 8
    )
  )
  const y = Math.round(
    clamp(
      process.platform === 'darwin'
        ? anchor.y + anchor.height + 4
        : anchor.y - size.height - 4,
      display.workArea.y + 8,
      display.workArea.y + display.workArea.height - size.height - 8
    )
  )

  const show = (): void => {
    if (!menuWindow || menuWindow.isDestroyed()) return
    menuWindow.setPosition(x, y)
    menuWindow.show()
    menuWindow.focus()
  }

  if (menuReady) show()
  else menuWindow.webContents.once('did-finish-load', show)
}

/** 创建托盘图标（复用品牌 logo）；左键恢复窗口，右键弹出自绘菜单 */
export function installTray(window: BrowserWindow): void {
  mainWindowRef = window
  if (tray) return
  const source = nativeImage.createFromPath(brandIconPath('window'))
  const icon =
    process.platform === 'darwin'
      ? source.resize({ width: 16, height: 16 })
      : source
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('CineLab')
  tray.on('click', restoreMainWindow)
  tray.on('double-click', restoreMainWindow)
  tray.on('right-click', showMenuWindow)

  ipcMain.on('app:tray-restore', restoreMainWindow)
  ipcMain.on('app:tray-quit', requestQuitFromTray)
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
  mainWindowRef = null
  menuReady = false
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.destroy()
  menuWindow = null
}
