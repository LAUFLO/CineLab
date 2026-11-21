import { ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import {
  listLocalAdapterStatuses,
  localAdaptersDir,
  reloadLocalAdapter
} from '../local-adapters/registry'

export function registerLocalAdapterIpc(): void {
  ipcMain.handle('local-adapters:list', () => listLocalAdapterStatuses())

  ipcMain.handle('local-adapters:reload', (_event, id: string) =>
    reloadLocalAdapter(String(id))
  )

  ipcMain.handle('local-adapters:open-dir', async () => {
    const dir = localAdaptersDir()
    await fs.mkdir(dir, { recursive: true })
    return shell.openPath(dir)
  })
}
