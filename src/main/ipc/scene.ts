import {
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions
} from 'electron'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { SceneAnalyzeInput } from '@shared/scene-analyze'
import { getCurrentProjectRoot } from '../project/manager'
import { analyzeScene } from '../scene/analyze'
import { ingestAsset } from '../assets/ingest'
import {
  exportUserObjectPresets,
  importUserObjectPresets,
  loadUserObjectPresets,
  saveUserObjectPresets
} from '../scene/object-presets'

export function registerSceneIpc(): void {
  ipcMain.handle(
    'scene:analyze',
    async (_event, input: SceneAnalyzeInput) => {
      const root = getCurrentProjectRoot()
      if (!root) throw new Error('当前没有打开的项目')
      return analyzeScene(root, input)
    }
  )

  ipcMain.handle(
    'scene:upload-image',
    async (
      _event,
      input: { name: string; mime: string; data: ArrayBuffer }
    ) => {
      const root = getCurrentProjectRoot()
      if (!root) throw new Error('当前没有打开的项目')
      return ingestAsset({
        projectPath: root,
        data: Buffer.from(input.data),
        kind: 'image',
        mime: input.mime || 'image/png',
        model: '拖入'
      })
    }
  )

  ipcMain.handle(
    'scene:pick-image',
    async () => {
      const root = getCurrentProjectRoot()
      if (!root) throw new Error('当前没有打开的项目')
      const options: OpenDialogOptions = {
        properties: ['openFile'],
        filters: [
          {
            name: '图片',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
          }
        ]
      }
      const win = BrowserWindow.getFocusedWindow()
      const picked = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (picked.canceled || picked.filePaths.length === 0) return null
      const file = picked.filePaths[0]
      const ext = extname(file).toLowerCase()
      const mime =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : ext === '.bmp'
                ? 'image/bmp'
                : 'image/png'
      const data = await readFile(file)
      return ingestAsset({
        projectPath: root,
        data,
        kind: 'image',
        mime,
        model: '导入'
      })
    }
  )

  ipcMain.handle(
    'scene:upload-asset',
    async (
      _event,
      input: {
        kind: 'image' | 'video' | 'audio'
        mime: string
        data: ArrayBuffer
      }
    ) => {
      const root = getCurrentProjectRoot()
      if (!root) throw new Error('当前没有打开的项目')
      return ingestAsset({
        projectPath: root,
        data: Buffer.from(input.data),
        kind: input.kind,
        mime:
          input.mime ||
          (input.kind === 'image'
            ? 'image/png'
            : input.kind === 'video'
              ? 'video/mp4'
              : 'audio/mpeg'),
        model: '本地上传'
      })
    }
  )

  ipcMain.handle('scene:get-object-presets', () =>
    loadUserObjectPresets()
  )
  ipcMain.handle('scene:save-object-presets', (_event, presets: unknown) =>
    saveUserObjectPresets(presets)
  )
  ipcMain.handle('scene:import-object-presets', () =>
    importUserObjectPresets()
  )
  ipcMain.handle('scene:export-object-presets', () =>
    exportUserObjectPresets()
  )
}
