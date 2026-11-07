import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { CanvasData } from '@shared/project-schema'
import type { ProjectTemplateId } from '@shared/project-templates'
import {
  bootstrap,
  bootstrapOnce,
  createCanvas,
  createProject,
  defaultProjectsDir,
  deleteCanvas,
  deleteProject,
  getCurrentProjectRoot,
  openProject,
  readProjectCover,
  readRecent,
  removeProjectCover,
  renameCanvas,
  renameProject,
  saveCanvas,
  switchCanvas,
  writeProjectCover,
  writeProjectCoverFromAsset
} from '../project/manager'

export function registerProjectIpc(): void {
  ipcMain.handle('project:bootstrap', () => bootstrapOnce())

  ipcMain.handle('project:create', (_event, name: string, parentDir?: string, templateId?: ProjectTemplateId) =>
    createProject(name, parentDir, templateId)
  )

  ipcMain.handle('project:open', (_event, path: string) => openProject(path))

  ipcMain.handle('project:save-canvas', (_event, path: string, canvas: CanvasData) =>
    saveCanvas(path, canvas)
  )

  ipcMain.handle('project:recent', () => readRecent())

  ipcMain.handle('project:cover-read', (_event, path: string) =>
    readProjectCover(path)
  )

  ipcMain.handle('project:cover-set-local', async (event, path: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: '选择项目封面',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }
      ]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true }
    }

    await writeProjectCover(path, await fs.readFile(result.filePaths[0]))
    return { ok: true }
  })

  ipcMain.handle(
    'project:cover-set-asset',
    async (_event, path: string, assetPath: string) => {
      await writeProjectCoverFromAsset(path, assetPath)
      return { ok: true }
    }
  )

  ipcMain.handle('project:cover-remove', (_event, path: string) =>
    removeProjectCover(path)
  )



  ipcMain.handle('project:pick-create', async (event, templateId?: ProjectTemplateId) => {
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
    return createProject(name, dirname(result.filePath), templateId)
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

  ipcMain.handle('project:rename', (_event, path: string, name: string) =>
    renameProject(path, name)
  )

  ipcMain.handle('project:create-canvas', (_event, path: string, name?: string) =>
    createCanvas(path, name)
  )

  ipcMain.handle(
    'project:switch-canvas',
    (_event, path: string, canvasId: string) => switchCanvas(path, canvasId)
  )

  ipcMain.handle(
    'project:rename-canvas',
    (_event, path: string, canvasId: string, name: string) =>
      renameCanvas(path, canvasId, name)
  )

  ipcMain.handle(
    'project:delete-canvas',
    (_event, path: string, canvasId: string) => deleteCanvas(path, canvasId)
  )

  ipcMain.handle('project:delete', async () => {
    const root = getCurrentProjectRoot()
    if (!root) throw new Error('没有打开的项目')
    await deleteProject(root)
    return true
  })
}
