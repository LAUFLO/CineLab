import { ipcMain } from 'electron'
import type { DirectorStageDoc } from '@shared/stage-schema'
import { getCurrentProjectRoot } from '../project/manager'
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
}
