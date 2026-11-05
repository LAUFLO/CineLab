import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { registerAssetProtocol, registerAssetScheme } from './protocol'
import { createMainWindow } from './window'
import { ensureLibrary } from './library/config'

const isolatedUserData = process.env.CINELAB_USER_DATA
if (isolatedUserData) {
  app.setPath('userData', isolatedUserData)
}

if (!app.isPackaged) {
  app.commandLine.appendSwitch(
    'remote-debugging-port',
    process.env.CINELAB_DEBUG_PORT ?? '9222'
  )
}

registerAssetScheme()

const hasLock = process.env.CINELAB_ISOLATED === '1'
  ? true
  : app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(async () => {
    try {
      await ensureLibrary()
    } catch (error) {
      console.warn('[library] failed to initialize global library', error)
    }

    registerAssetProtocol()
    registerIpc()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
