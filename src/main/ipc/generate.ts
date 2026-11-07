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
import { generateVideoHttpTemplate } from '../providers/http-template'
import { generateVideoKling } from '../providers/kling'
import { generateVideoMinimax } from '../providers/minimax'
import {
  generateImage,
  generateMusic,
  generateSpeech,
  generateText,
  type ProviderOutput
} from '../providers/openai-compat'
import { generateVideoArk } from '../providers/volcengine'
import { isRetryable, withRetry } from '../providers/retry'
import { resolveProvider } from '../settings/store'
import { getLibraryRoot } from '../library/config'

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

  const projectBase = resolve(projectRoot)
  const libraryBase =
    refs.some((ref) => ref.scope === 'global')
      ? resolve(await getLibraryRoot())
      : null
  const loaded: Array<{ dataUrl: string; role: string }> = []

  for (const ref of refs.slice(0, 4)) {
    const root = ref.scope === 'global' && libraryBase ? libraryBase : projectBase
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
    broadcast({
      type: 'error',
      nodeId: job.nodeId,
      runId: job.id,
      message: formatGenerationError(error),
      retryable: isRetryable(error)
    })
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
    const adapter =
      model.adapter ??
      (/^agnes-video/i.test(model.remoteModel)
        ? 'agnes-video'
        : isVideo
          ? 'volcengine-video'
          : 'openai-compat')

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
        const runtime = {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          secretKey: provider.secretKey,
          headers: provider.headers
        }
        const context = { signal, onProgress }

        const generate = (): Promise<ProviderOutput[]> => {
          if (isVideo) {
            if (adapter === 'agnes-video') {
              return generateVideoAgnes(
                model,
                runtime,
                request.prompt,
                request.params,
                refs,
                context
              )
            }
            if (adapter === 'http-template') {
              return generateVideoHttpTemplate(
                model,
                runtime,
                request.prompt,
                request.params,
                refs,
                context
              )
            }
            if (adapter === 'minimax-video' || adapter === 'minimax-legacy') {
              return generateVideoMinimax(
                model,
                runtime,
                request.prompt,
                request.params,
                refs,
                context,
                adapter === 'minimax-legacy'
              )
            }
            if (adapter === 'kling-video') {
              return generateVideoKling(
                model,
                runtime,
                request.prompt,
                request.params,
                refs,
                context
              )
            }
            return generateVideoArk(
              model,
              runtime,
              request.prompt,
              request.params,
              refs,
              context
            )
          }

          if (isAudio) {
            return isMusic
              ? generateMusic(
                  model,
                  runtime,
                  request.prompt,
                  request.params,
                  context
                )
              : generateSpeech(
                  model,
                  runtime,
                  request.prompt,
                  request.params,
                  context
                )
          }

          if (isText) {
            return generateText(
              model,
              runtime,
              request.prompt,
              request.params,
              context
            )
          }

          return generateImage(
            model,
            runtime,
            request.prompt,
            request.params,
            refs,
            context
          )
        }

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
