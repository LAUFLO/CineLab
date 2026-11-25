import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { ExportResult } from '@shared/ipc-contract'
import type {
  WorkflowApplyResult,
  WorkflowSaveInput
} from '@shared/workflow-schema'
import {
  deleteWorkflow,
  exportWorkflowZip,
  importWorkflowZip,
  listWorkflows,
  readWorkflow,
  renameWorkflow,
  saveWorkflow
} from '../library/workflows'
import { buildWorkflow } from '../workflows/build'
import { instantiateWorkflow } from '../workflows/instantiate'
import {
  getCurrentProjectRoot,
  openProject,
  saveCanvas
} from '../project/manager'

function windowFromEvent(
  sender: Electron.WebContents
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender)
}

export function registerWorkflowIpc(): void {
  ipcMain.handle('workflow:list', () => listWorkflows())

  ipcMain.handle('workflow:read', (_event, slug: string) =>
    readWorkflow(slug)
  )

  ipcMain.handle(
    'workflow:save',
    async (_event, input: WorkflowSaveInput) => {
      const projectPath = getCurrentProjectRoot()
      if (!projectPath) throw new Error('请先打开一个项目')
      const { package: pkg, thumbnail } = await buildWorkflow({
        ...input,
        projectPath
      })
      return saveWorkflow(pkg, thumbnail, {
        overwriteSlug: input.overwriteSlug
      })
    }
  )

  ipcMain.handle(
    'workflow:rename',
    (_event, slug: string, name: string) => renameWorkflow(slug, name)
  )

  ipcMain.handle('workflow:delete', (_event, slug: string) =>
    deleteWorkflow(slug)
  )

  ipcMain.handle(
    'workflow:export',
    async (event, slug: string): Promise<ExportResult> => {
      const win = windowFromEvent(event.sender)
      const result = win
        ? await dialog.showSaveDialog(win, {
            title: '导出工作流',
            defaultPath: `${slug}.cinelab-workflow.zip`,
            filters: [{ name: '工作流包', extensions: ['zip'] }]
          })
        : await dialog.showSaveDialog({
            title: '导出工作流',
            defaultPath: `${slug}.cinelab-workflow.zip`,
            filters: [{ name: '工作流包', extensions: ['zip'] }]
          })

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true }
      }

      try {
        await exportWorkflowZip(slug, result.filePath)
        return { ok: true, path: result.filePath }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('workflow:import', async (event) => {
    const win = windowFromEvent(event.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: '导入工作流',
          properties: ['openFile'],
          filters: [{ name: '工作流包', extensions: ['zip'] }]
        })
      : await dialog.showOpenDialog({
          title: '导入工作流',
          properties: ['openFile'],
          filters: [{ name: '工作流包', extensions: ['zip'] }]
        })

    if (result.canceled || result.filePaths.length === 0) return null
    return importWorkflowZip(result.filePaths[0])
  })

  ipcMain.handle(
    'workflow:apply',
    async (
      _event,
      slug: string,
      offset?: { x: number; y: number }
    ): Promise<WorkflowApplyResult> => {
      const projectPath = getCurrentProjectRoot()
      if (!projectPath) throw new Error('请先打开一个项目')

      const snapshot = await openProject(projectPath)
      const pkg = await readWorkflow(slug)
      const result = await instantiateWorkflow(pkg, {
        projectPath,
        offset
      })

      const canvas = {
        ...snapshot.canvas,
        nodes: [...snapshot.canvas.nodes, ...result.nodes],
        edges: [...snapshot.canvas.edges, ...result.edges]
      }
      await saveCanvas(projectPath, canvas)

      return {
        canvas,
        nodeIds: result.nodeIds,
        warnings: result.warnings
      }
    }
  )
}
