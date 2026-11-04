import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import type { CharacterInput, TemplateInput } from '@shared/library-schema'
import {
  deleteCharacter,
  deleteMaterial,
  deleteTemplate,
  importMaterials,
  ingestLibraryFile,
  listCharacters,
  listMaterials,
  listTemplates,
  saveCharacter,
  saveTemplate
} from '../library/store'

const IMAGE_FILTERS = [
  { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
]

const MATERIAL_FILTERS = [
  {
    name: '素材',
    extensions: [
      'png',
      'jpg',
      'jpeg',
      'webp',
      'gif',
      'mp4',
      'webm',
      'mov',
      'mp3',
      'wav',
      'm4a',
      'ogg'
    ]
  }
]

async function pickFiles(
  event: Electron.IpcMainInvokeEvent,
  options: OpenDialogOptions
): Promise<string[]> {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)

  return result.canceled ? [] : result.filePaths
}

export function registerLibraryIpc(): void {
  ipcMain.handle('library:list-characters', () => listCharacters())

  ipcMain.handle('library:save-character', (_event, input: CharacterInput) =>
    saveCharacter(input)
  )

  ipcMain.handle('library:delete-character', (_event, id: string) =>
    deleteCharacter(id)
  )

  ipcMain.handle('library:pick-character-images', async (event) => {
    const files = await pickFiles(event, {
      title: '选择角色参考图',
      properties: ['openFile', 'multiSelections'],
      filters: IMAGE_FILTERS
    })

    const paths: string[] = []
    for (const file of files) {
      paths.push(await ingestLibraryFile(file, 'characters'))
    }

    return paths
  })

  ipcMain.handle('library:list-materials', () => listMaterials())

  ipcMain.handle('library:import-materials', async (event) => {
    const files = await pickFiles(event, {
      title: '导入素材',
      properties: ['openFile', 'multiSelections'],
      filters: MATERIAL_FILTERS
    })

    return importMaterials(files)
  })

  ipcMain.handle('library:delete-material', (_event, id: string) =>
    deleteMaterial(id)
  )

  ipcMain.handle('library:list-templates', () => listTemplates())

  ipcMain.handle('library:save-template', (_event, input: TemplateInput) =>
    saveTemplate(input)
  )

  ipcMain.handle('library:delete-template', (_event, id: string) =>
    deleteTemplate(id)
  )
}
