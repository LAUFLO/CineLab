import { BrowserWindow, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { brandIconPath } from '../window'

let tray: Tray | null = null
let menuWindow: BrowserWindow | null = null

function mainWindow(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0]
  return win && !win.isDestroyed() ? win : null
}

/** 从托盘或通知恢复主窗口；后台态使用 hide，不重建窗口 */
export function restoreMainWindow(): void {
  const win = mainWindow()
  if (!win) return
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
  if (!tray || !mainWindow()) return

  if (!menuWindow || menuWindow.isDestroyed()) {
    menuWindow = new BrowserWindow({
      width: 224,
      height: 136,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      transparent: true,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    menuWindow.on('blur', hideMenuWindow)
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
  const x = Math.round(bounds.x + bounds.width / 2 - size.width / 2)
  const y =
    process.platform === 'darwin'
      ? Math.round(bounds.y + bounds.height + 4)
      : Math.round(bounds.y - size.height - 4)
  menuWindow.setPosition(x, y)
  menuWindow.show()
  menuWindow.focus()
}

/** 创建托盘图标（复用品牌 logo）；左键恢复窗口，右键弹出自绘菜单 */
export function installTray(): void {
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
  tray.on('right-click', showMenuWindow)
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.destroy()
  menuWindow = null
}
