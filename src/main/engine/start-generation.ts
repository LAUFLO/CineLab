import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, resolve } from 'node:path'
import type {
  GenerateRequest,
  GeneratedAsset,
  ReferenceInput
} from '@shared/generation'
import { modelInputs } from '@shared/provider-schema'
import { ingestAsset } from '../assets/ingest'
import { generationQueue, type QueueJob } from '../engine/queue'
import { getLibraryRoot } from '../library/config'
import { resolveMediaPath } from '../media/paths'
import { applyVideoSegmentResult } from '../media/video-ops'
import {
  generateImage,
  generateMusic,
  generateSpeech,
  generateText,
  type ProviderOutput
} from '../providers/openai-compat'
import { generateVideoAgnes } from '../providers/agnes'
import { generateVideoHttpTemplate } from '../providers/http-template'
import { generateVideoKling } from '../providers/kling'
import { generateVideoMinimax } from '../providers/minimax'
import { withRetry } from '../providers/retry'
import { generateVideoArk } from '../providers/volcengine'
import { resolveProvider } from '../settings/store'

const REF_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska'
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

    const mime = REF_MIME[extname(absolute).toLowerCase()]
    if (!mime) continue

    try {
      const data = await fs.readFile(absolute)

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

async function loadVideo(
  projectRoot: string,
  video: ReferenceInput | undefined
): Promise<{ dataUrl: string; mime: string; absolutePath: string } | undefined> {
  if (!video) return undefined

  const absolute = await resolveMediaPath(projectRoot, video.path, video.scope)
  const data = await fs.readFile(absolute)
  const mime = VIDEO_MIME[extname(absolute).toLowerCase()] ?? 'video/mp4'
  return {
    dataUrl: `data:${mime};base64,${data.toString('base64')}`,
    mime,
    absolutePath: absolute
  }
}

/**
 * 校验请求并把生成任务加入队列。
 * 普通生成与 Agent 提案提交共用这一入口。
 */
export async function startGeneration(
  projectRoot: string,
  request: GenerateRequest
): Promise<{ runId: string }> {
  const slash = request.modelKey.indexOf('/')
  if (slash <= 0) throw new Error('模型标识无效')
  const providerId = request.modelKey.slice(0, slash)
  const modelId = request.modelKey.slice(slash + 1)

  const provider = await resolveProvider(providerId)
  if (!provider) throw new Error('找不到模型供应商，请先在设置中配置')
  if (!provider.apiKey) throw new Error('该供应商没有配置 API Key')

  const model = provider.models.find((item) => item.id === modelId)
  if (!model) throw new Error('找不到该模型')

  const isImage =
    model.capability === 'image.t2i' || model.capability === 'image.i2i'
  const isVideo = model.capability === 'video.t2v'
  const isAudio =
    model.capability === 'audio.tts' || model.capability === 'audio.music'
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
      if (request.refs && request.refs.length > 0 && refs.length === 0) {
        throw new Error('参考素材缺失或不在当前项目中，请重新添加素材')
      }
      const video = await loadVideo(projectRoot, request.video)

      const supportedInputs = modelInputs(model)
      if (
        (refs.length > 0 || request.mask) &&
        !supportedInputs.includes('image')
      ) {
        throw new Error('该模型不支持图生图，请选择支持参考图的模型')
      }
      if (video && !supportedInputs.includes('video')) {
        throw new Error('该模型不支持参考视频，请选择支持视频输入的模型')
      }
      const runtime = {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        secretKey: provider.secretKey,
        headers: provider.headers
      }
      const context = { signal, onProgress }

      const generate = (): Promise<ProviderOutput[]> => {
        if (isVideo) {
          if (video && adapter !== 'http-template') {
            throw new Error(
              '当前视频模型不支持视频输入，请在设置 → 操作模型中绑定 http-template 专用接口'
            )
          }
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
              video,
              request.videoOptions,
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
          context,
          request.mask
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
        let data = output.data

        if (
          isVideo &&
          request.videoOptions &&
          video?.absolutePath &&
          model.template?.videoResult === 'segment' &&
          output.data.length > 0 &&
          output.mime.startsWith('video/')
        ) {
          onProgress(96, '拼接视频片段')
          data = await applyVideoSegmentResult(
            video.absolutePath,
            output.data,
            request.videoOptions,
            signal
          )
        }

        const asset = await ingestAsset({
          projectPath: projectRoot,
          data,
          kind,
          mime: output.mime,
          model: model.name,
          text: output.text,
          width: videoSize?.[0],
          height: videoSize?.[1]
        })
        assets.push(request.op ? { ...asset, op: request.op } : asset)
      }

      return assets
    }
  }

  generationQueue.enqueue(job)
  return { runId }
}
