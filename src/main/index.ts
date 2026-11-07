import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { registerAssetProtocol, registerAssetScheme } from './protocol'
import { createMainWindow } from './window'
import { ensureLibrary } from './library/config'
import { ensureMigrated } from './settings/store'
import { getPreferences } from './settings/preferences'
import { generationQueue } from './engine/queue'
import { startModelsWatcher } from './settings/models-watch'
import { log, setupLogging } from './logger'
import { appendFileSync } from 'node:fs'

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

    try {
      const preferences = await getPreferences()
      generationQueue.setConcurrency(preferences.generation.concurrency)
      diagLog('preferences loaded')
    } catch (error) {
      console.warn('[settings] failed to load preferences', error)
      diagLog(`load preferences failed ${String(error)}`)
    }

    startModelsWatcher()

    registerAssetProtocol()
    diagLog('registerAssetProtocol done')
    registerIpc()
    diagLog('registerIpc done')
    createMainWindow()
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
