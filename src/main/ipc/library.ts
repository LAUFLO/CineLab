import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  AddToLibraryInput,
  SaveAssetInput,
  TemplateInput
} from '@shared/library-schema'
import {
  defaultLibraryRoot,
  getLibraryRoot,
  resetLibraryRoot,
  setLibraryRoot
} from '../library/config'
import {
  addAsset,
  createFolder,
  deleteAsset,
  deleteFolder,
  importFiles,
  listAllAssets,
  listAssets,
  listCharacters,
  listTree,
  renameAsset,
  renameFolder,
  revealPath
} from '../library/store'
import {
  deleteTemplate,
  listTemplates,
  saveTemplate
} from '../library/templates'

const ASSET_FILTERS = [
  {
    name: '素材',
    extensions: [
      'png',
      'jpg',
      'jpeg',
      'webp',
      'gif',
      'bmp',
      'mp4',
      'webm',
      'mov',
      'mkv',
      'mp3',
      'wav',
      'm4a',
      'ogg',
      'flac'
    ]
  }
]

async function rootInfo(): Promise<{ root: string; isDefault: boolean }> {
  const root = await getLibraryRoot()
  return { root, isDefault: root === defaultLibraryRoot() }
}

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerLibraryIpc(): void {
  ipcMain.handle('library:root', () => rootInfo())

  ipcMain.handle('library:choose-root', async (event) => {
    const current = await getLibraryRoot()
    const win = windowFromEvent(event)
    const options: Electron.OpenDialogOptions = {
      title: '选择全局资产库文件夹',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory']
    }

    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null

    const next = await setLibraryRoot(result.filePaths[0])
    return { root: next, isDefault: next === defaultLibraryRoot() }
  })

  ipcMain.handle('library:reset-root', async () => {
    const next = await resetLibraryRoot()
    return { root: next, isDefault: next === defaultLibraryRoot() }
  })

  ipcMain.handle('library:reveal-root', async () => {
    const root = await getLibraryRoot()
    await shell.openPath(root)
  })

  ipcMain.handle('library:tree', () => listTree())
  ipcMain.handle('library:list-assets', (_event, folder: string) =>
    listAssets(folder)  )

  ipcMain.handle('library:list-all-assets', () => listAllAssets())

  ipcMain.handle(
    'library:save-assets',
    async (_event, inputs: SaveAssetInput[], folder?: string) => {
      const target = folder ?? '场景'
      const saved = []

      for (const input of inputs) {
        saved.push(
          await addAsset({
            sourcePath: input.path,
            scope: input.scope ?? 'project',
            folder: target,
            name: input.name ?? '素材'
          })
        )
      }

      return saved
    }
  )

  ipcMain.handle('library:create-folder', (_event, parent: string, name: string) =>
    createFolder(parent, name)
  )

  ipcMain.handle('library:rename-folder', (_event, path: string, name: string) =>
    renameFolder(path, name)
  )

  ipcMain.handle('library:delete-folder', (_event, path: string) =>
    deleteFolder(path)
  )

  ipcMain.handle('library:import-assets', async (event, folder: string) => {
    const win = windowFromEvent(event)
    const options: Electron.OpenDialogOptions = {
      title: '导入素材到资产库',
      properties: ['openFile', 'multiSelections'],
      filters: ASSET_FILTERS
    }

    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return []
    return importFiles(folder, result.filePaths)
  })

  ipcMain.handle('library:add-asset', (_event, input: AddToLibraryInput) =>
    addAsset(input)
  )

  ipcMain.handle('library:rename-asset', (_event, path: string, name: string) =>
    renameAsset(path, name)
  )

  ipcMain.handle('library:delete-asset', (_event, path: string) =>
    deleteAsset(path)
  )

  ipcMain.handle('library:reveal', (_event, path: string) => revealPath(path))

  ipcMain.handle('library:list-characters', () => listCharacters())
  ipcMain.handle('library:list-templates', () => listTemplates())

  ipcMain.handle('library:save-template', (_event, input: TemplateInput) =>
    saveTemplate(input)
  )

  ipcMain.handle('library:delete-template', (_event, id: string) =>
    deleteTemplate(id)
  )
}
