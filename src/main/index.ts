import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { registerAssetProtocol, registerAssetScheme } from './protocol'
import { createMainWindow, allowAllWindowClose } from './window'
import { ensureLibrary } from './library/config'
import { cleanupThumbCache } from './library/thumbs'
import { ensureMigrated } from './settings/store'
import { getPreferences } from './settings/preferences'
import { applyRuntimePreferences } from './settings/apply'
import { startModelsWatcher } from './settings/models-watch'
import { log, setupLogging } from './logger'
import { appendFileSync } from 'node:fs'

// 隔离测试实例：避免窗口被遮挡时 Chromium 暂停 requestAnimationFrame，
// 影响运镜播放与逐帧渲染的自动化验证。
if (process.env.CINELAB_DISABLE_THROTTLE === '1') {
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
}

const diagLogPath = process.env.CINELAB_DIAG_LOG

function diagLog(message: string): void {
  if (!diagLogPath) return
  try {
    appendFileSync(diagLogPath, `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch {
    // diagnostics must never affect startup
  }
}

process.on('uncaughtException', (error) => {
  diagLog(
    `uncaughtException ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
  )
  log.error('uncaughtException', error)
  throw error
})

process.on('unhandledRejection', (reason) => {
  diagLog(
    `unhandledRejection ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`
  )
  log.error('unhandledRejection', reason)
})

const isolatedUserData = process.env.CINELAB_USER_DATA
if (isolatedUserData) {
  app.setPath('userData', isolatedUserData)
}

// Windows toast 的应用名和图标由 AppUserModelID 对应的开始菜单快捷方式决定。
// 必须与 electron-builder.yml 的 appId 保持一致，否则通知会显示 Electron。
if (process.platform === 'win32') {
  app.setAppUserModelId('com.cinelab.app')
}

if (process.env.CINELAB_USER_DATA) {
  app.setPath('userData', process.env.CINELAB_USER_DATA)
}

setupLogging()

if (!app.isPackaged || process.env.CINELAB_DEBUG_PORT) {
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
    diagLog('whenReady')
    log.info('app ready')

    try {
      await ensureLibrary()
      diagLog('ensureLibrary done')
    } catch (error) {
      console.warn('[library] failed to initialize global library', error)
      diagLog(`ensureLibrary failed ${String(error)}`)
    }

    try {
      await ensureMigrated()
      diagLog('migrate settings done')
    } catch (error) {
      console.warn('[settings] failed to migrate legacy settings', error)
      diagLog(`migrate settings failed ${String(error)}`)
    }

    let startupPreferences: Awaited<ReturnType<typeof getPreferences>> | null =
      null

    try {
      startupPreferences = await getPreferences()
      diagLog('preferences loaded')
    } catch (error) {
      console.warn('[settings] failed to load preferences', error)
      diagLog(`load preferences failed ${String(error)}`)
    }

    if (startupPreferences && startupPreferences.storage.autoCleanCacheDays > 0) {
      const days = startupPreferences.storage.autoCleanCacheDays
      void cleanupThumbCache(days)
        .then((result) => {
          if (result.removed > 0) {
            diagLog(`thumb cache cleaned files=${result.removed}`)
          }
        })
        .catch((error) => {
          diagLog(`thumb cache cleanup failed ${String(error)}`)
        })
    }

    startModelsWatcher()

    registerAssetProtocol()
    diagLog('registerAssetProtocol done')
    registerIpc()
    diagLog('registerIpc done')

    if (startupPreferences) {
      await applyRuntimePreferences(startupPreferences)
      diagLog('runtime preferences applied')
    }

    const mainWindow = createMainWindow()
    if (startupPreferences) {
      mainWindow.webContents.setZoomFactor(startupPreferences.ui.scale / 100)
    }
    diagLog('createMainWindow done')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  }).catch((error) => {
    diagLog(
      `whenReady rejected ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
    )
  })

  app.on('before-quit', () => {
    allowAllWindowClose()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('render-process-gone', (_event, webContents, details) => {
    log.error('render-process-gone', {
      url: webContents.getURL(),
      reason: details.reason,
      exitCode: details.exitCode
    })
  })

  app.on('child-process-gone', (_event, details) => {
    log.error('child-process-gone', details)
  })

  app.on('before-quit', () => {
    log.info('app quitting')
  })
}
