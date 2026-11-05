import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, resolve } from 'node:path'
import type {
  GenerateRequest,
  GeneratedAsset,
  GenerationEvent,
  ReferenceInput
} from '@shared/generation'
import { ingestAsset } from '../assets/ingest'
import { generationQueue, type QueueJob } from '../engine/queue'
import { getCurrentProjectRoot } from '../project/manager'
import { generateVideoAgnes } from '../providers/agnes'
import {
  generateImage,
  generateMusic,
  generateSpeech,
  generateText,
  type ProviderOutput
} from '../providers/openai-compat'
import { generateVideoArk } from '../providers/volcengine'
import { withRetry } from '../providers/retry'
import { resolveProvider } from '../settings/store'

function broadcast(event: GenerationEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('generation:event', event)
  }
}

const REF_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

const VIDEO_SIZE: Record<string, [number, number]> = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [720, 720],
  '4:3': [960, 720],
  '3:4': [720, 960],
  '21:9': [1680, 720]
}

async function loadRefs(
  projectRoot: string,
  refs: ReferenceInput[] | undefined
): Promise<Array<{ dataUrl: string; role: string }>> {
  if (!refs || refs.length === 0) return []

  const root = resolve(projectRoot)
  const loaded: Array<{ dataUrl: string; role: string }> = []

  for (const ref of refs.slice(0, 4)) {
    const absolute = resolve(root, ref.path)

    if (!absolute.startsWith(`${root}\\`) && !absolute.startsWith(`${root}/`)) {
      continue
    }

    try {
      const data = await fs.readFile(absolute)
      const mime = REF_MIME[extname(absolute).toLowerCase()] ?? 'image/png'

      loaded.push({
        dataUrl: `data:${mime};base64,${data.toString('base64')}`,
        role: ref.role
      })
    } catch {
      // 素材缺失时跳过
    }
  }

  return loaded
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

    const isImage = model.capability === 'image.t2i' || model.capability === 'image.i2i'
    const isVideo = model.capability === 'video.t2v'
    const isAudio = model.capability === 'audio.tts' || model.capability === 'audio.music'
    const isMusic = model.capability === 'audio.music'
    const isText = model.capability === 'text.chat'
    const isAgnesVideo = /^agnes-video/i.test(model.remoteModel)

    if (!isImage && !isVideo && !isAudio && !isText) {
      throw new Error('当前只支持图片、视频、文本和语音模型')
    }
    if (!request.prompt.trim()) throw new Error('提示词不能为空')

    const runId = randomUUID()
    const kind = isAudio ? 'audio' : isVideo ? 'video' : isText ? 'text' : 'image'

    const job: QueueJob = {
      id: runId,
      nodeId: request.nodeId,
      run: async (signal, onProgress) => {
        const refs = await loadRefs(projectRoot, request.refs)

        const generate = (): Promise<ProviderOutput[]> =>
          isVideo
            ? isAgnesVideo
              ? generateVideoAgnes(
                  model,
                  { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
                  request.prompt,
                  request.params,
                  refs,
                  { signal, onProgress }
                )
              : generateVideoArk(
                  model,
                  { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
                  request.prompt,
                  request.params,
                  refs,
                  { signal, onProgress }
                )
            : isAudio
              ? isMusic
                ? generateMusic(
                    model,
                    { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
                    request.prompt,
                    request.params,
                    { signal, onProgress }
                  )
                : generateSpeech(
                    model,
                    { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
                    request.prompt,
                    request.params,
                    { signal, onProgress }
                  )
              : isText
                ? generateText(
                    model,
                    { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
                    request.prompt,
                    request.params,
                    { signal, onProgress }
                  )
                : generateImage(
                  model,
                  { baseUrl: provider.baseUrl, apiKey: provider.apiKey },
                  request.prompt,
                  request.params,
                  refs,
                  { signal, onProgress }
                )

        const outputs = await withRetry(generate, signal, (attempt, delay, error) => {
          const reason = error instanceof Error ? error.message : String(error)
          onProgress(
            0,
            `第 ${attempt} 次重试（${Math.round(delay / 1000)}s 后）：${reason}`
          )
        })

        const assets: GeneratedAsset[] = []
        const videoSize = isVideo
          ? VIDEO_SIZE[String(request.params.ratio ?? '16:9')]
          : undefined

        for (const output of outputs) {
          assets.push(
            await ingestAsset({
              projectPath: projectRoot,
              data: output.data,
              kind,
              mime: output.mime,
              model: model.name,
              text: output.text,
              width: videoSize?.[0],
              height: videoSize?.[1]
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
