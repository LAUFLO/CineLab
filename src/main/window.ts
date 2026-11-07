import { app, BrowserWindow, screen, shell } from 'electron'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

function logWindowError(message: string): void {
  try {
    appendFileSync(
      join(app.getPath('userData'), 'window-error.log'),
      `${new Date().toISOString()} ${message}\n`,
      'utf8'
    )
  } catch {
    // diagnostics must never break window creation
  }

  const diagPath = process.env.CINELAB_DIAG_LOG
  if (!diagPath) return

  try {
    appendFileSync(diagPath, `${new Date().toISOString()} [window] ${message}\n`, 'utf8')
  } catch {
    // ignore
  }
}

const closeAllowed = new WeakSet<BrowserWindow>()

export function allowWindowClose(win: BrowserWindow): void {
  closeAllowed.add(win)
  win.close()
}

export function allowAllWindowClose(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    closeAllowed.add(win)
  }
}

export function createMainWindow(): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1440, Math.max(1100, Math.round(workArea.width * 0.86)))
  const height = Math.min(900, Math.max(700, Math.round(workArea.height * 0.86)))

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1100,
    minHeight: 700,
    center: true,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#0a0a0a',
    ...(app.isPackaged
      ? {}
      : { icon: join(app.getAppPath(), 'resources/icon.png') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webgl: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('close', (event) => {
    if (closeAllowed.has(win) || win.webContents.isLoading()) return
    event.preventDefault()
    win.webContents.send('app:close-requested')
  })

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    logWindowError(`did-fail-load ${code} ${description} ${url}`)
  })

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logWindowError(`preload-error ${preloadPath} ${error.message}`)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    logWindowError(`render-process-gone ${JSON.stringify(details)}`)
  })

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) logWindowError(`console-${level} ${message}`)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  logWindowError(
    `create window packaged=${String(app.isPackaged)} appPath=${app.getAppPath()} dirname=${__dirname}`
  )

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const file = join(__dirname, '../renderer/index.html')
    logWindowError(`load-file ${file}`)
    void win.loadFile(file).catch((error) => {
      logWindowError(
        `load-file-error ${error instanceof Error ? error.message : String(error)}`
      )
    })
  }

  return win
}
