import { app, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateState, UpdateStatus } from '@shared/update'
import type { UpdateChannel } from '@shared/preferences'
import { getPreferences } from '../settings/preferences'

let status: UpdateStatus = {
  state: 'idle',
  currentVersion: '',
  canCheck: false
}

let initialized = false
let silentCheckTimer: NodeJS.Timeout | null = null

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('update:event', status)
    }
  }
}

function setStatus(patch: Partial<UpdateStatus>): UpdateStatus {
  status = { ...status, ...patch }
  broadcast()
  return status
}

function releaseNotes(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((note) => `${note.version}${note.note ? `\n${note.note}` : ''}`)
      .join('\n\n')
  }
  return undefined
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|network|404/i.test(raw)) {
    return '无法连接更新服务器，请检查网络后重试'
  }
  return `检查更新失败：${raw.slice(0, 200)}`
}

function handleError(error: unknown): void {
  console.error('[update]', error)
  setStatus({ state: 'error', error: errorMessage(error) })
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function applyUpdatePreferences(updates: {
  channel: UpdateChannel
}): void {
  const beta = updates.channel === 'beta'
  autoUpdater.allowPrerelease = beta
  autoUpdater.channel = beta ? 'beta' : 'latest'
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!status.canCheck) {
    return setStatus({ state: 'unsupported' })
  }

  if (status.state === 'checking' || status.state === 'downloading') {
    return status
  }

  try {
    setStatus({ state: 'checking', error: undefined })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    handleError(error)
  }

  return status
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (status.state !== 'available') return status

  try {
    setStatus({
      state: 'downloading',
      percent: 0,
      transferred: 0,
      total: undefined,
      error: undefined
    })
    await autoUpdater.downloadUpdate()
  } catch (error) {
    handleError(error)
  }

  return status
}

export function installUpdate(): void {
  if (status.state !== 'downloaded') return
  autoUpdater.quitAndInstall(false, true)
}

export function initUpdateService(): void {
  if (initialized) return
  initialized = true

  status = {
    state: 'idle',
    currentVersion: app.getVersion(),
    canCheck: app.isPackaged || process.env.CINELAB_UPDATE_DEV === '1'
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false

  const overrideUrl = process.env.CINELAB_UPDATE_URL
  if (overrideUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: overrideUrl })
  }

  if (!app.isPackaged && process.env.CINELAB_UPDATE_DEV === '1') {
    autoUpdater.forceDevUpdateConfig = true
  }

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', error: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    setStatus({
      state: 'available',
      latestVersion: info.version,
      releaseNotes: releaseNotes(info),
      releaseDate: info.releaseDate,
      percent: undefined,
      transferred: undefined,
      total: undefined,
      error: undefined
    })
  })

  autoUpdater.on('update-not-available', () => {
    setStatus({
      state: 'not-available',
      latestVersion: undefined,
      releaseNotes: undefined,
      releaseDate: undefined,
      percent: undefined,
      transferred: undefined,
      total: undefined,
      error: undefined
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      state: 'downloaded',
      latestVersion: info.version,
      releaseNotes: releaseNotes(info),
      releaseDate: info.releaseDate,
      percent: 100,
      error: undefined
    })
  })

  autoUpdater.on('error', (error) => {
    handleError(error)
  })

  if (status.canCheck) {
    silentCheckTimer = setTimeout(() => {
      silentCheckTimer = null
      void getPreferences()
        .then((preferences) => {
          if (preferences.updates.checkOnStartup && status.state === 'idle') {
            void checkForUpdates()
          }
        })
        .catch(() => undefined)
    }, 8000)
    silentCheckTimer.unref?.()
  }
}

export function shutdownUpdateService(): void {
  if (silentCheckTimer) {
    clearTimeout(silentCheckTimer)
    silentCheckTimer = null
  }
}

export type { UpdateState }
