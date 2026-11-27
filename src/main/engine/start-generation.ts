import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, resolve } from 'node:path'
import type {
  GenerateRequest,
  GeneratedAsset,
  ReferenceInput
} from '@shared/generation'
import { ingestAsset } from '../assets/ingest'
import { generationQueue, type QueueJob } from '../engine/queue'
import { getLibraryRoot } from '../library/config'
import { referenceInputError } from '@shared/reference-inputs'
import { resolveMediaPath } from '../media/paths'
import { applyVideoSegmentResult } from '../media/video-ops'
import {
  generateImage,
  generateMusic,
  generateSpeech,
  generateText,
  type AdapterContext,
  type ProviderOutput,
  type ProviderRuntime
} from '../providers/openai-compat'
import { generateVideoAgnes } from '../providers/agnes'
import { generateVideoHttpTemplate } from '../providers/http-template'
import { generateVideoKling } from '../providers/kling'
import { generateVideoMinimax } from '../providers/minimax'
import { withRetry } from '../providers/retry'
import { generateVideoSora } from '../providers/sora'
import { generateVideoArk } from '../providers/volcengine'
import { toLoadedRef, type LoadedRef } from '../providers/media'
import { generateWithLocalAdapter } from '../local-adapters/runtime'
import { resolveProvider } from '../settings/store'

const MAX_REFERENCE_IMAGES = 32

/** 把用户选择的数量归一化为 1–4；非法值按 1 张处理。 */
export function imageBatchCount(value: unknown): number {
  const count = Number(value)
  if (!Number.isFinite(count)) return 1
  return Math.max(1, Math.min(4, Math.floor(count)))
}

/**
 * 某些图片供应商忽略 OpenAI 兼容的 n 参数（例如 agnes-image-2.5-flash），
 * 一次请求只返回一张。这里先按 n 请求一次；若返回不足，顺序补发单张请求，
 * 让「一次生成 N 张」对所有图片模型都生效。子请求共用同一个 signal。
 */
export async function generateImageBatch(
  model: Parameters<typeof generateImage>[0],
  runtime: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: LoadedRef[],
  context: AdapterContext,
  mask?: string
): Promise<ProviderOutput[]> {
  const total = imageBatchCount(params.n)
  if (total <= 1) {
    return generateImage(model, runtime, prompt, params, refs, context, mask)
  }

  const { signal, onProgress } = context
  const outputs: ProviderOutput[] = []

  const requestOnce = async (count: number): Promise<void> => {
    if (signal.aborted) throw new Error('已取消')
    const childContext: AdapterContext = {
      signal,
      onProgress: (percent, message) => {
        const done = outputs.length
        const scaled = ((done + percent / 100) / total) * 100
        onProgress(
          Math.min(100, Math.max(0, Math.round(scaled))),
          `第 ${Math.min(done + 1, total)}/${total} 张${message ? ` · ${message}` : ''}`
        )
      }
    }
    const once = await generateImage(
      model,
      runtime,
      prompt,
      { ...params, n: count },
      refs,
      childContext,
      mask
    )
    outputs.push(...once)
  }

  try {
    await requestOnce(total)
  } catch (error) {
    if (signal.aborted || total <= 1) throw error
    // 模型可能不接受 n 字段，降级为单张请求重来
    outputs.length = 0
    await requestOnce(1)
  }

  while (outputs.length < total && !signal.aborted) {
    await requestOnce(1)
  }
  if (signal.aborted) throw new Error('已取消')
  return outputs.slice(0, total)
}

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg'
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
): Promise<LoadedRef[]> {
  if (!refs || refs.length === 0) return []

  const projectBase = resolve(projectRoot)
  const libraryBase =
    refs.some((ref) => ref.scope === 'global')
      ? resolve(await getLibraryRoot())
      : null
  const loaded: LoadedRef[] = []

  // 安全上限，防止 base64 参考素材撑爆主进程内存；数量本身由供应商 API 校验
  if (refs.length > MAX_REFERENCE_IMAGES) {
    throw new Error(
      `参考素材最多 ${MAX_REFERENCE_IMAGES} 个，请减少后重试`
    )
  }

  for (const ref of refs) {
    const root = ref.scope === 'global' && libraryBase ? libraryBase : projectBase
    const absolute = resolve(root, ref.path)

    if (!absolute.startsWith(`${root}\\`) && !absolute.startsWith(`${root}/`)) {
      continue
    }

    const ext = extname(absolute).toLowerCase()
    const imageMime = IMAGE_MIME[ext]
    const mime = imageMime ?? AUDIO_MIME[ext]
    if (!mime) continue

    try {
      const data = await fs.readFile(absolute)

      loaded.push(
        toLoadedRef({
          dataUrl: `data:${mime};base64,${data.toString('base64')}`,
          role: ref.role,
          media: imageMime ? 'image' : 'audio',
          mime
        })
      )
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

  if (provider.authRequired !== false && !provider.apiKey) {
    throw new Error('该供应商没有配置 API Key')
  }

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
        throw new Error('参考素材缺失、格式不支持或不在当前项目中，请重新添加素材')
      }
      const video = await loadVideo(projectRoot, request.video)

      const imageRefs = refs.filter((ref) => ref.media === 'image')
      const audioRefs = refs.filter((ref) => ref.media === 'audio')
      const hasKeyframe = refs.some(
        (ref) => ref.role === 'firstFrame' || ref.role === 'lastFrame'
      )
      const firstFrameCount = imageRefs.filter(
        (ref) => ref.role === 'firstFrame'
      ).length
      const lastFrameCount = imageRefs.filter(
        (ref) => ref.role === 'lastFrame'
      ).length

      const refError = referenceInputError({
        isVideo,
        model,
        imageCount: imageRefs.length,
        audioCount: audioRefs.length,
        hasSourceVideo: Boolean(video),
        hasVideoOperation: Boolean(request.videoOptions?.operation),
        hasMask: Boolean(request.mask),
        hasKeyframe,
        firstFrameCount,
        lastFrameCount
      })
      if (refError) throw new Error(refError)
      const hasSubject =
        request.refs?.some((ref) => ref.role === 'subject') ?? false
      const hasStyle =
        request.refs?.some((ref) => ref.role === 'style') ?? false
      const effectivePrompt = [
        request.prompt,
        hasSubject ? '保持参考图中的主体一致。' : '',
        hasStyle ? '参考参考图的风格、色调和材质。' : ''
      ]
        .filter(Boolean)
        .join('\n')

      const runtime = {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        secretKey: provider.secretKey,
        headers: provider.headers
      }
      const context = { signal, onProgress }

      const generate = (): Promise<ProviderOutput[]> => {
        if (adapter.startsWith('local:')) {
          return generateWithLocalAdapter(
            model,
            runtime,
            effectivePrompt,
            request.params,
            refs,
            context,
            video,
            request.videoOptions,
            request.mask
          )
        }
        if (isVideo) {
          if (
            video &&
            adapter !== 'http-template' &&
            adapter !== 'volcengine-video' &&
            adapter !== 'agnes-video'
          ) {
            throw new Error(
              '当前视频模型不支持视频输入，请选择支持视频编辑的模型'
            )
          }
          if (adapter === 'agnes-video') {
            return generateVideoAgnes(
              model,
              runtime,
              effectivePrompt,
              request.params,
              refs,
              context,
              video
            )
          }
          if (adapter === 'sora-video') {
            return generateVideoSora(
              model,
              runtime,
              effectivePrompt,
              request.params,
              refs,
              context
            )
          }
          if (adapter === 'http-template') {
            return generateVideoHttpTemplate(
              model,
              runtime,
              effectivePrompt,
              request.params,
              refs,
              video,
              request.videoOptions,
              context,
              request.mask
            )
          }
          if (adapter === 'minimax-video' || adapter === 'minimax-legacy') {
            return generateVideoMinimax(
              model,
              runtime,
              effectivePrompt,
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
              effectivePrompt,
              request.params,
              refs,
              context
            )
          }
          return generateVideoArk(
            model,
            runtime,
            effectivePrompt,
            request.params,
            refs,
            context,
            video,
            request.videoOptions
          )
        }

        if (isAudio) {
          return isMusic
            ? generateMusic(
                model,
                runtime,
                effectivePrompt,
                request.params,
                context
              )
            : generateSpeech(
                model,
                runtime,
                effectivePrompt,
                request.params,
                context
              )
        }

        if (isText) {
          return generateText(
            model,
            runtime,
            effectivePrompt,
            request.params,
            refs,
            context
          )
        }

        if (adapter === 'http-template') {
          return generateVideoHttpTemplate(
            model,
            runtime,
            effectivePrompt,
            request.params,
            refs,
            undefined,
            undefined,
            context,
            request.mask
          )
        }

        return generateImageBatch(
          model,
          runtime,
          effectivePrompt,
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
          height: videoSize?.[1],
          layer: output.layer,
          textRecognition: output.textRecognition
        })
        assets.push(request.op ? { ...asset, op: request.op } : asset)
      }

      return assets
    }
  }

  generationQueue.enqueue(job)
  return { runId }
}
