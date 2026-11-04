import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
import { basename, dirname, join } from 'node:path'
import type { CanvasData } from '@shared/project-schema'
import {
  bootstrap,
  bootstrapOnce,
  createProject,
  defaultProjectsDir,
  openProject,
  readRecent,
  saveCanvas
} from '../project/manager'

export function registerProjectIpc(): void {
  ipcMain.handle('project:bootstrap', () => bootstrapOnce())

  ipcMain.handle('project:create', (_event, name: string, parentDir?: string) =>
    createProject(name, parentDir)
  )

  ipcMain.handle('project:open', (_event, path: string) => openProject(path))

  ipcMain.handle('project:save-canvas', (_event, path: string, canvas: CanvasData) =>
    saveCanvas(path, canvas)
  )

  ipcMain.handle('project:recent', () => readRecent())

  ipcMain.handle('project:pick-create', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: SaveDialogOptions = {
      title: '新建 CineLab 项目',
      defaultPath: join(defaultProjectsDir(), '未命名项目.cinelab'),
      buttonLabel: '创建',
      filters: [{ name: 'CineLab 项目', extensions: ['cinelab'] }]
    }

    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) return null

    const name = basename(result.filePath).replace(/\.cinelab$/i, '')
    return createProject(name, dirname(result.filePath))
  })

  ipcMain.handle('project:pick-open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: '打开 CineLab 项目',
      defaultPath: defaultProjectsDir(),
      properties: ['openDirectory']
    }

    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null
    return openProject(result.filePaths[0])
  })

  ipcMain.handle('project:reveal', async (_event, path: string) => {
    await shell.openPath(path)
  })
}
