import { BrowserWindow, ipcMain } from 'electron'
import type {
  StageExportInput,
  StageExportProgress
} from '@shared/ipc-contract'
import type { DirectorStageDoc } from '@shared/stage-schema'
import { ingestAsset } from '../assets/ingest'
import { getCurrentProjectRoot } from '../project/manager'
import { exportStagePreview } from '../stage/export'
import {
  createStageFile,
  deleteStageFile,
  duplicateStageFile,
  loadStageFile,
  saveStageFile
} from '../stage/storage'

function requireProjectRoot(): string {
  const root = getCurrentProjectRoot()
  if (!root) throw new Error('当前没有打开的项目')
  return root
}

function readStageId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('缺少场景 ID')
  }
  return value.trim()
}

export function registerStageIpc(): void {
  ipcMain.handle('stage:create', async (_event, name: unknown) => {
    const root = requireProjectRoot()
    const title =
      typeof name === 'string' ? name.trim().slice(0, 200) : ''
    return createStageFile(root, title || undefined)
  })

  ipcMain.handle('stage:load', async (_event, stageId: unknown) => {
    const root = requireProjectRoot()
    return loadStageFile(root, readStageId(stageId))
  })

  ipcMain.handle('stage:save', async (_event, doc: unknown) => {
    if (!doc || typeof doc !== 'object') {
      throw new Error('场景文档无效')
    }
    const root = requireProjectRoot()
    await saveStageFile(root, doc as DirectorStageDoc)
  })

  ipcMain.handle('stage:delete', async (_event, stageId: unknown) => {
    const root = requireProjectRoot()
    await deleteStageFile(root, readStageId(stageId))
  })

  ipcMain.handle('stage:duplicate', async (_event, stageId: unknown) => {
    const root = requireProjectRoot()
    return duplicateStageFile(root, readStageId(stageId))
  })

  ipcMain.handle('stage:export-preview', async (event, input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new Error('导出参数无效')
    }
    const value = input as Partial<StageExportInput>
    if (
      typeof value.stageId !== 'string' ||
      typeof value.shotId !== 'string'
    ) {
      throw new Error('缺少场景或镜头 ID')
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const send = (progress: StageExportProgress): void => {
      if (!win || win.isDestroyed()) return
      win.webContents.send('stage:export-progress', progress)
    }

    return exportStagePreview(
      requireProjectRoot(),
      {
        stageId: value.stageId,
        shotId: value.shotId,
        resolution: value.resolution === '1080p' ? '1080p' : '720p',
        fps: value.fps === 30 ? 30 : 24
      },
      send
    )
  })

  ipcMain.handle('stage:capture', async (_event, input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new Error('截图参数无效')
    }
    const { stageId, dataUrl } = input as {
      stageId?: unknown
      dataUrl?: unknown
    }
    const id = readStageId(stageId)
    if (typeof dataUrl !== 'string') throw new Error('截图数据无效')

    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!match) throw new Error('只支持 PNG 截图')
    const data = Buffer.from(match[1], 'base64')
    if (data.length > 20 * 1024 * 1024) {
      throw new Error('截图不能超过 20MB')
    }

    const root = requireProjectRoot()
    const doc = await loadStageFile(root, id)
    if (!doc) throw new Error('场景文件不存在')

    return ingestAsset({
      projectPath: root,
      data,
      kind: 'image',
      mime: 'image/png',
      model: '导演台'
    })
  })
}
