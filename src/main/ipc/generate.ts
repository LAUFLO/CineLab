import { BrowserWindow, ipcMain } from 'electron'
import type {
  GenerateRequest,
  GeneratedAsset,
  GenerationEvent
} from '@shared/generation'
import { generationQueue, type QueueJob } from '../engine/queue'
import { startGeneration } from '../engine/start-generation'
import { getCurrentProjectRoot } from '../project/manager'
import { isRetryable } from '../providers/retry'
import { log } from '../logger'
import { updateProposalFromRun } from '../agent/proposals'
import { formatGenerationError } from '../engine/generation-error'

function broadcast(event: GenerationEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('generation:event', event)
  }
}

export function registerGenerateIpc(): void {
  generationQueue.on('queued', (job: QueueJob) => {
    void updateProposalFromRun(job.id, 'submitted')
    broadcast({ type: 'queued', nodeId: job.nodeId, runId: job.id })
  })

  generationQueue.on('progress', (job: QueueJob, percent: number, message?: string) => {
    broadcast({ type: 'progress', nodeId: job.nodeId, runId: job.id, percent, message })
  })

  generationQueue.on('done', (job: QueueJob, assets: GeneratedAsset[]) => {
    void updateProposalFromRun(job.id, 'completed')
    broadcast({ type: 'done', nodeId: job.nodeId, runId: job.id, assets })
  })

  generationQueue.on('error', (job: QueueJob, error: unknown) => {
    const message = formatGenerationError(error)
    void updateProposalFromRun(job.id, 'failed', message)
    log.error('generation failed', {
      nodeId: job.nodeId,
      runId: job.id,
      message,
      retryable: isRetryable(error)
    })
    broadcast({
      type: 'error',
      nodeId: job.nodeId,
      runId: job.id,
      message,
      retryable: isRetryable(error)
    })
  })

  generationQueue.on('cancelled', (job: QueueJob) => {
    void updateProposalFromRun(job.id, 'cancelled')
    broadcast({ type: 'cancelled', nodeId: job.nodeId, runId: job.id })
  })

  ipcMain.handle('generate:run', async (_event, request: GenerateRequest) => {
    const projectRoot = getCurrentProjectRoot()
    if (!projectRoot) throw new Error('没有打开的项目')
    return startGeneration(projectRoot, request)
  })

  ipcMain.handle('generate:cancel', (_event, runId: string) => {
    generationQueue.cancel(runId)
  })

  ipcMain.handle('generate:cancel-all', () => {
    generationQueue.cancelAll()
  })
}
