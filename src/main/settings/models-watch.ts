import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import { modelsFilePath } from './models-config'

let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | null = null

/** 监听 models.json 变化，防抖后通知所有窗口刷新 */
export function startModelsWatcher(): void {
  if (watcher) return

  const file = modelsFilePath()
  const dir = dirname(file)
  const name = basename(file)

  try {
    watcher = watch(dir, (_event, filename) => {
      if (filename && String(filename) !== name) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('settings:models-changed')
          }
        }
      }, 250)
    })
    watcher.on('error', (error) => {
      console.warn('[settings] models.json watcher failed', error)
    })
  } catch (error) {
    console.warn('[settings] failed to watch models.json', error)
  }
}

export function stopModelsWatcher(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  watcher?.close()
  watcher = null
}
