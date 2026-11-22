import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import {
  autoApplyPendingModels,
  loadPendingModels,
  modelsFilePath,
  pendingModelsFilePath
} from './models-config'

let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | null = null
let pendingEvent = false
let applying = false
let queued = false

function broadcast(channel: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel)
  }
}

async function applyPendingIfNeeded(): Promise<void> {
  if (applying) {
    queued = true
    return
  }

  applying = true
  try {
    const pending = await loadPendingModels()
    if (!pending.exists) return

    const result = await autoApplyPendingModels()
    broadcast(result.applied ? 'settings:models-changed' : 'settings:models-pending')
  } catch (error) {
    console.warn('[settings] auto apply pending models failed', error)
    broadcast('settings:models-pending')
  } finally {
    applying = false
    if (queued) {
      queued = false
      void applyPendingIfNeeded()
    }
  }
}

/** 监听 models.json / models.pending.json 变化，自动应用合法的 pending。 */
export function startModelsWatcher(): void {
  if (watcher) return

  const file = modelsFilePath()
  const pending = pendingModelsFilePath()
  const dir = dirname(file)
  const name = basename(file)
  const pendingName = basename(pending)

  try {
    watcher = watch(dir, (_event, filename) => {
      const changed = filename ? String(filename) : ''
      if (changed && changed !== name && changed !== pendingName) return
      if (changed === pendingName) pendingEvent = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        const isPending = pendingEvent
        pendingEvent = false
        if (isPending) {
          void applyPendingIfNeeded()
        } else {
          broadcast('settings:models-changed')
        }
      }, 250)
    })
    watcher.on('error', (error) => {
      console.warn('[settings] models.json watcher failed', error)
    })
  } catch (error) {
    console.warn('[settings] failed to watch models.json', error)
  }

  // 应用启动时也检查一次，覆盖“应用关闭期间 Agent 写好 pending”的情况。
  void applyPendingIfNeeded()
}

export function stopModelsWatcher(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  watcher?.close()
  watcher = null
}
