import { ipcMain } from 'electron'
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
