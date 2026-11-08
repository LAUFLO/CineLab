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

function broadcast(event: GenerationEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('generation:event', event)
  }
}

function formatGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (/HTTP 401|HTTP 403/i.test(message)) {
    return 'API Key 无效或没有权限，请在设置中检查密钥'
  }
  if (/HTTP 429/i.test(message)) {
    return '请求过于频繁（限流），请稍后重试'
  }
  if (/HTTP 404/i.test(message)) {
    return '模型或接口不存在，请检查模型配置'
  }
  if (/HTTP 5\d\d/i.test(message)) {
    return '模型服务暂时不可用，请稍后重试'
  }
  if (
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|连接超时/i.test(
      message
    )
  ) {
    return '网络连接失败，请检查网络或代理后重试'
  }
  if (/aborted|已取消/i.test(message)) {
    return '任务已取消'
  }

  const detail = message.replace(/^Error:\s*/, '').trim()
  return detail.length > 160 ? `${detail.slice(0, 160)}…` : detail
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
