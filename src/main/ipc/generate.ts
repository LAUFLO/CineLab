import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { GenerateRequest, GeneratedAsset, GenerationEvent } from '@shared/generation'
import { ingestAsset } from '../assets/ingest'
import { generationQueue, type QueueJob } from '../engine/queue'
import { getCurrentProjectRoot } from '../project/manager'
import { generateImage } from '../providers/openai-compat'
import { withRetry } from '../providers/retry'
import { resolveProvider } from '../settings/store'

function broadcast(event: GenerationEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('generation:event', event)
  }
}

export function registerGenerateIpc(): void {
  generationQueue.on('queued', (job: QueueJob) => {
    broadcast({ type: 'queued', nodeId: job.nodeId, runId: job.id })
  })

  generationQueue.on('progress', (job: QueueJob, percent: number, message?: string) => {
    broadcast({ type: 'progress', nodeId: job.nodeId, runId: job.id, percent, message })
  })

  generationQueue.on('done', (job: QueueJob, assets: GeneratedAsset[]) => {
    broadcast({ type: 'done', nodeId: job.nodeId, runId: job.id, assets })
  })

  generationQueue.on('error', (job: QueueJob, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    broadcast({ type: 'error', nodeId: job.nodeId, runId: job.id, message })
  })

  generationQueue.on('cancelled', (job: QueueJob) => {
    broadcast({ type: 'cancelled', nodeId: job.nodeId, runId: job.id })
  })

  ipcMain.handle('generate:run', async (_event, request: GenerateRequest) => {
    const projectRoot = getCurrentProjectRoot()
    if (!projectRoot) throw new Error('没有打开的项目')

    const slash = request.modelKey.indexOf('/')
    if (slash <= 0) throw new Error('模型标识无效')
    const providerId = request.modelKey.slice(0, slash)
    const modelId = request.modelKey.slice(slash + 1)

    const provider = await resolveProvider(providerId)
    if (!provider) throw new Error('找不到模型供应商，请先在设置中配置')
    if (!provider.apiKey) throw new Error('该供应商没有配置 API Key')

    const model = provider.models.find((item) => item.id === modelId)
    if (!model) throw new Error('找不到该模型')

    if (model.capability !== 'image.t2i' && model.capability !== 'image.i2i') {
      throw new Error('当前只支持图片生成模型')
    }
    if (!request.prompt.trim()) throw new Error('提示词不能为空')

    const runId = randomUUID()

    const job: QueueJob = {
      id: runId,
      nodeId: request.nodeId,
      run: async (signal, onProgress) => {
        const images = await withRetry(
          () =>
            generateImage(
              model,
              { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
              request.prompt,
              request.params,
              { signal, onProgress }
            ),
          signal,
          (attempt, delay, error) => {
            const reason = error instanceof Error ? error.message : String(error)
            onProgress(
              0,
              `第 ${attempt} 次重试（${Math.round(delay / 1000)}s 后）：${reason}`
            )
          }
        )

        const assets: GeneratedAsset[] = []
        for (const image of images) {
          assets.push(
            await ingestAsset({
              projectPath: projectRoot,
              data: image.data,
              kind: 'image',
              mime: image.mime,
              model: model.name
            })
          )
        }

        return assets
      }
    }

    generationQueue.enqueue(job)
    return { runId }
  })

  ipcMain.handle('generate:cancel', (_event, runId: string) => {
    generationQueue.cancel(runId)
  })

  ipcMain.handle('generate:cancel-all', () => {
    generationQueue.cancelAll()
  })
}
