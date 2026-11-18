import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateState, UpdateStatus } from '@shared/update'
import type { UpdateChannel } from '@shared/preferences'
import { getPreferences } from '../settings/preferences'
import {
  installerFallback,
  installerFor,
  releasesFallback,
  resolveInstallerFallback,
  type PendingInstaller
} from './fallback'

let status: UpdateStatus = {
  state: 'idle',
  currentVersion: '',
  canCheck: false
}

let initialized = false
let silentCheckTimer: NodeJS.Timeout | null = null
let pendingInstaller: PendingInstaller | null = null
let fallbackProbe: Promise<void> | null = null

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

function errorMessage(error: unknown, downloading: boolean): string {
  const raw = error instanceof Error ? error.message : String(error)
  const network = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|network|404/i.test(
    raw
  )
  const detail = raw.slice(0, 200)

  if (downloading) {
    return network
      ? '下载更新失败，网络可能无法直连 GitHub'
      : `下载更新失败：${detail}`
  }

  return network
    ? '无法连接更新服务器，请检查网络后重试'
    : `检查更新失败：${detail}`
}

function applyDownloadFallback(): void {
  if (status.fallback || fallbackProbe) return

  const installer = pendingInstaller
  if (!installer) {
    setStatus({ fallback: releasesFallback() })
    return
  }

  fallbackProbe = resolveInstallerFallback(installer)
    .then((fallback) => {
      setStatus({ fallback })
    })
    .catch(() => {
      setStatus({ fallback: installerFallback(installer) })
    })
    .finally(() => {
      fallbackProbe = null
    })
}

function handleError(error: unknown): void {
  console.error('[update]', error)
  // 下载失败常同时触发 error 事件和 downloadUpdate 的 reject，
  // 第二次进来时保留首次文案，避免把「下载失败」覆盖成「检查失败」。
  if (status.state === 'error') return

  const downloading = status.state === 'downloading'

  setStatus({
    state: 'error',
    error: errorMessage(error, downloading),
    ...(downloading ? {} : { fallback: releasesFallback() })
  })

  if (downloading) applyDownloadFallback()
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
    setStatus({ state: 'checking', error: undefined, fallback: undefined })
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
      error: undefined,
      fallback: undefined
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

export async function openFallbackDownload(): Promise<void> {
  const url = status.fallback?.url
  if (!url) return
  await shell.openExternal(url)
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
    setStatus({ state: 'checking', error: undefined, fallback: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    pendingInstaller = installerFor(info)
    setStatus({
      state: 'available',
      latestVersion: info.version,
      releaseNotes: releaseNotes(info),
      releaseDate: info.releaseDate,
      percent: undefined,
      transferred: undefined,
      total: undefined,
      error: undefined,
      fallback: undefined
    })
  })

  autoUpdater.on('update-not-available', () => {
    pendingInstaller = null
    setStatus({
      state: 'not-available',
      latestVersion: undefined,
      releaseNotes: undefined,
      releaseDate: undefined,
      percent: undefined,
      transferred: undefined,
      total: undefined,
      error: undefined,
      fallback: undefined
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
