import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  FilmStudy,
  FilmStudyAutoAsset,
  FilmStudyAutoRequest,
  FilmStudyAutoResult,
  FilmStudyFrame,
  FilmStudyProgress,
  FilmStudySegment
} from '@shared/film-study'
import { modelInputs, type ModelDef } from '@shared/provider-schema'
import { probeMedia, runFfmpeg, runFfmpegCapture } from '../media/ffmpeg'
import { resolveInside, resolveMediaPath } from '../media/paths'
import { httpFetch } from '../providers/http'
import { listProviders, resolveProvider } from '../settings/store'
import { saveFilmStudy } from './service'
import {
  analyzeVideoFrames,
  buildCandidateTimes,
  detectShotCuts,
  detectMotionPeaks
} from './shot-detect'

type ProgressEmitter = (progress: FilmStudyProgress) => void

const autoTasks = new Map<string, AbortController>()
const MAX_SHOTS = 24
const MIN_SHOT_SECONDS = 0.4
const FRAME_WIDTH = 640

interface ShotRange {
  start: number
  end: number
}

interface AutoAnalysisSegment {
  index?: number
  from?: number
  to?: number
  title?: string
  type?: string
  shotSize?: string
  cameraAngle?: string
  cameraMove?: string
  lighting?: string
  visualDescription?: string
  imagePrompt?: string
  voiceOver?: string
  musicCue?: string
}

export function cancelAutoFilmStudy(nodeId: string): void {
  autoTasks.get(nodeId)?.abort()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function detectCuts(stderr: string): number[] {
  const cuts: number[] = []
  const pattern = /lavfi\.scd\.time:\s*([\d.]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(stderr)) !== null) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0.05) cuts.push(value)
  }
  return cuts
}

export function splitByCuts(cuts: number[], duration: number): ShotRange[] {
  const points = [0, ...cuts.filter((time) => time > 0.3 && time < duration - 0.3), duration]
  const shots: ShotRange[] = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (end - start >= MIN_SHOT_SECONDS) {
      shots.push({ start, end })
      continue
    }
    const previous = shots[shots.length - 1]
    if (previous) previous.end = end
    else shots.push({ start, end })
  }

  return shots.length > 0 ? shots : [{ start: 0, end: duration }]
}

export function splitByInterval(duration: number, interval: number): ShotRange[] {
  const step = clamp(interval, 0.25, 30)
  const shots: ShotRange[] = []
  for (let start = 0; start < duration - 0.05; start += step) {
    shots.push({ start, end: Math.min(duration, start + step) })
  }
  return shots.length > 0 ? shots : [{ start: 0, end: duration }]
}

export function mergeToLimit(shots: ShotRange[], limit: number): ShotRange[] {
  const next = shots.map((shot) => ({ ...shot }))
  while (next.length > limit) {
    let targetIndex = 0
    let shortest = Number.POSITIVE_INFINITY
    for (let index = 0; index < next.length - 1; index += 1) {
      const length = next[index].end - next[index].start + (next[index + 1].end - next[index + 1].start)
      if (length < shortest) {
        shortest = length
        targetIndex = index
      }
    }
    next[targetIndex] = {
      start: next[targetIndex].start,
      end: next[targetIndex + 1].end
    }
    next.splice(targetIndex + 1, 1)
  }
  return next
}

function representativeTime(shot: ShotRange): number {
  return shot.start + (shot.end - shot.start) / 2
}

function cutsToShots(cuts: number[]): ShotRange[] {
  const shots: ShotRange[] = []
  for (let index = 0; index < cuts.length - 1; index += 1) {
    shots.push({ start: cuts[index], end: cuts[index + 1] })
  }
  return shots.length > 0 ? shots : [{ start: 0, end: 0 }]
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 10) / 10)
  const minutes = Math.floor(total / 60)
  const rest = (total % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${rest}`
}

function baseTitle(index: number): string {
  return `镜 ${String(index + 1).padStart(2, '0')}`
}

function buildAutoSegments(shots: ShotRange[], frames: FilmStudyFrame[]): FilmStudySegment[] {
  return shots.map((shot, index) => ({
    id: randomUUID(),
    startTime: shot.start,
    endTime: shot.end,
    title: baseTitle(index),
    type: '分镜',
    coverFile: frames[index]?.file
  }))
}

function buildPrompt(
  study: FilmStudy,
  cuts: number[],
  frames: FilmStudyFrame[]
): string {
  const cutList = cuts.map(
    (time, index) => `切点 ${index + 1}：${formatTime(time)}`
  )
  const frameList = frames.map((frame, index) => {
    const from = cuts[index]
    const to = cuts[index + 1]
    return `图 ${index + 1}：切点 ${index + 1}–${index + 2}，${formatTime(from)}–${formatTime(to)}（代表帧 ${formatTime(frame.time)}）`
  })

  return [
    `你是电影拉片助手。请分析《${study.sourceName}》的分镜。`,
    `片长 ${study.duration.toFixed(1)} 秒。下面是按镜头切换和动作变化给出的候选切点，以及每个候选区间的一张代表帧。`,
    '',
    ...cutList,
    '',
    ...frameList,
    '',
    '请根据画面内容和叙事，把候选切点组织成最终分镜。可以合并多个区间，也可以重新拆分；但只能使用上面列出的切点作为边界。',
    '',
    `segments 每项用 from/to 表示切点编号（从 1 开始，共 ${cuts.length} 个切点）：`,
    `- 第一段必须 from = 1，最后一段必须 to = ${cuts.length}`,
    '- 下一段的 from 必须等于上一段的 to，from 必须小于 to',
    '- 每段至少覆盖一个候选区间，不要跳段或重叠',
    '每个最终分镜补充：',
    '- title：4–8 个字的分镜标题',
    '- type：分镜类型，例如 开场、推进、转折、高潮、结尾、过渡',
    '- shotSize：景别，例如 大远景、远景、全景、中景、近景、特写',
    '- cameraAngle：机位/角度，例如 平视、俯拍、仰拍、侧面、过肩',
    '- cameraMove：运镜，例如 固定、推、拉、摇、移、跟拍、环绕',
    '- lighting：光线与色彩',
    '- visualDescription：画面内容描述',
    '- imagePrompt：可直接用于生成该分镜首帧的画面提示词，中文，包含主体、动作、环境、景别、机位、光线、风格',
    '- voiceOver：人声/对白，没有则留空',
    '- musicCue：音乐/音效，没有则留空',
    '',
    '只输出 JSON，不要 Markdown、解释或代码块：',
    JSON.stringify({
      type: 'object',
      required: ['segments'],
      properties: {
        segments: {
          type: 'array',
          items: {
            type: 'object',
            required: ['from', 'to', 'title', 'shotSize', 'cameraAngle', 'cameraMove', 'visualDescription', 'imagePrompt'],
            properties: {
              from: { type: 'number' },
              to: { type: 'number' },
              title: { type: 'string' },
              type: { type: 'string' },
              shotSize: { type: 'string' },
              cameraAngle: { type: 'string' },
              cameraMove: { type: 'string' },
              lighting: { type: 'string' },
              visualDescription: { type: 'string' },
              imagePrompt: { type: 'string' },
              voiceOver: { type: 'string' },
              musicCue: { type: 'string' }
            }
          }
        }
      }
    }),
    `from/to 从 1 开始，to 表示结束切点编号，最大 ${cuts.length}。`
  ].join('\n')
}

function parseJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

function applyAnalysis(
  study: FilmStudy,
  payload: unknown,
  cuts: number[],
  frames: FilmStudyFrame[]
): FilmStudy {
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const rawSegments = Array.isArray(record.segments) ? record.segments : []
  if (rawSegments.length === 0) throw new Error('模型没有返回分镜数据')

  const entries: AutoAnalysisSegment[] = []
  for (const item of rawSegments) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const segment = item as Record<string, unknown>
    const rawFrom =
      typeof segment.from === 'number' && Number.isFinite(segment.from)
        ? Math.round(segment.from)
        : undefined
    const rawTo =
      typeof segment.to === 'number' && Number.isFinite(segment.to)
        ? Math.round(segment.to)
        : undefined
    entries.push({
      from: rawFrom,
      to: rawTo,
      title: readText(segment.title),
      type: readText(segment.type),
      shotSize: readText(segment.shotSize),
      cameraAngle: readText(segment.cameraAngle),
      cameraMove: readText(segment.cameraMove),
      lighting: readText(segment.lighting),
      visualDescription: readText(segment.visualDescription),
      imagePrompt: readText(segment.imagePrompt),
      voiceOver: readText(segment.voiceOver),
      musicCue: readText(segment.musicCue)
    })
  }

  // 模型用切点编号分组，必须连续覆盖全部切点
  const groups = entries
    .filter(
      (entry): entry is AutoAnalysisSegment & { from: number; to: number } =>
        entry.from !== undefined &&
        entry.to !== undefined &&
        entry.from >= 1 &&
        entry.to <= cuts.length &&
        entry.to > entry.from
    )
    .sort((a, b) => a.from - b.from)

  let segments: FilmStudySegment[] | null = null
  if (groups.length > 0) {
    let cursor = 1
    const valid = groups.every((group) => {
      if (group.from !== cursor) return false
      cursor = group.to
      return true
    })
    if (valid && cursor === cuts.length) {
      segments = groups.map((group, index) => ({
        id: randomUUID(),
        startTime: cuts[group.from - 1],
        endTime: cuts[group.to - 1],
        title: group.title ?? baseTitle(index),
        type: group.type ?? '分镜',
        coverFile: frames[group.from - 1]?.file,
        shotSize: group.shotSize,
        cameraAngle: group.cameraAngle,
        cameraMove: group.cameraMove,
        lighting: group.lighting,
        visualDescription: group.visualDescription,
        imagePrompt: group.imagePrompt,
        voiceOver: group.voiceOver,
        musicCue: group.musicCue
      }))
    }
  }

  return {
    ...study,
    segments: segments ?? study.segments,
    autoAnalyzedAt: new Date().toISOString()
  }
}

async function pickModel(modelKey?: string): Promise<string | null> {
  if (modelKey === 'none') return null
  if (modelKey) return modelKey
  const providers = await listProviders()
  for (const provider of providers) {
    const model = provider.models.find(
      (item) =>
        item.capability === 'text.chat' &&
        modelInputs(item as ModelDef).includes('image')
    )
    if (model) return `${provider.id}/${model.id}`
  }
  return null
}

async function requestAnalysis(
  study: FilmStudy,
  cuts: number[],
  frames: FilmStudyFrame[],
  root: string,
  modelKey: string
): Promise<FilmStudy> {
  const slash = modelKey.indexOf('/')
  if (slash <= 0) throw new Error('模型标识无效')
  const provider = await resolveProvider(modelKey.slice(0, slash))
  if (!provider) throw new Error('找不到模型供应商，请先在设置中配置')
  if (!provider.apiKey) throw new Error('该供应商没有配置 API Key')

  const model = provider.models.find(
    (item) => item.id === modelKey.slice(slash + 1)
  )
  if (!model) throw new Error('找不到该模型')
  if (model.capability !== 'text.chat') throw new Error('分镜分析需要文本模型')

  const content: Array<Record<string, unknown>> = []
  for (const frame of frames) {
    const data = await fs.readFile(resolveInside(root, frame.file))
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${data.toString('base64')}`
      }
    })
  }

  const response = await httpFetch(
    `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
        ...(provider.headers ?? {})
      },
      body: JSON.stringify({
        model: model.remoteModel,
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt(study, cuts, frames) },
              ...content
            ]
          }
        ]
      })
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`模型返回 HTTP ${response.status}：${text.slice(0, 300)}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = json.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('模型没有返回分析内容')

  return applyAnalysis(study, parseJson(raw), cuts, frames)
}

export async function autoFilmStudy(
  root: string,
  input: FilmStudyAutoRequest,
  emit: ProgressEmitter
): Promise<FilmStudyAutoResult> {
  const absolute = await resolveMediaPath(root, input.path, input.scope)
  const probe = await probeMedia(absolute)
  if (!probe.duration || probe.duration <= 0) {
    throw new Error('无法读取视频时长')
  }

  const controller = new AbortController()
  autoTasks.set(input.nodeId, controller)

  const studyId = randomUUID().slice(0, 10)
  const frameDir = join(root, 'assets', 'study', studyId, 'frames')
  const duration = probe.duration

  try {
    emit({
      nodeId: input.nodeId,
      studyId,
      status: 'running',
      percent: 2,
      message: '正在检测镜头'
    })

    let shots: ShotRange[]
    let cuts: number[]
    let usedShotDetection = false
    const requestedInterval = Number.isFinite(input.interval)
      ? Math.max(0, input.interval ?? 0)
      : 0

    if (requestedInterval > 0) {
      shots = splitByInterval(duration, requestedInterval)
      cuts = [0, ...shots.map((shot) => shot.end)]
    } else {
      try {
        const stats = await analyzeVideoFrames(
          absolute,
          controller.signal
        )
        const detected = detectShotCuts(stats)
        const motion =
          detected.length < 2 ? detectMotionPeaks(stats) : []
        cuts = buildCandidateTimes([...detected, ...motion], duration)
        usedShotDetection = detected.length > 0
      } catch {
        cuts = [0]
        for (let time = 2; time < duration - 0.5; time += 2) {
          cuts.push(time)
        }
        cuts.push(duration)
      }
      shots = cutsToShots(cuts)
    }

    if (shots.length > MAX_SHOTS) {
      shots = mergeToLimit(shots, MAX_SHOTS)
      cuts = [0, ...shots.map((shot) => shot.end)]
    }

    emit({
      nodeId: input.nodeId,
      studyId,
      status: 'running',
      percent: 6,
      current: 0,
      total: shots.length,
      message: '正在抽取分镜代表帧'
    })

    await fs.rm(frameDir, { recursive: true, force: true })
    await fs.mkdir(frameDir, { recursive: true })

    const frames: FilmStudyFrame[] = []
    for (let index = 0; index < shots.length; index += 1) {
      if (controller.signal.aborted) throw new Error('已取消')
      const time = representativeTime(shots[index])
      const file = `assets/study/${studyId}/frames/frame_${String(index + 1).padStart(6, '0')}.jpg`
      await runFfmpeg(
        [
          '-y',
          '-ss',
          time.toFixed(3),
          '-i',
          absolute,
          '-frames:v',
          '1',
          '-vf',
          `scale=${FRAME_WIDTH}:-2`,
          '-q:v',
          '3',
          join(root, file)
        ],
        { signal: controller.signal }
      )
      frames.push({
        index: index + 1,
        time: Math.round(time * 1000) / 1000,
        file
      })

      emit({
        nodeId: input.nodeId,
        studyId,
        status: 'running',
        percent: 6 + Math.round((70 * (index + 1)) / shots.length),
        current: index + 1,
        total: shots.length,
        message: '正在抽取分镜代表帧'
      })
    }

    const outputs = input.outputs ?? {}
    const motionClips: FilmStudyAutoAsset[] = []

    if (outputs.motion) {
      const clipDir = join(root, 'assets', 'study', studyId, 'clips')
      await fs.mkdir(clipDir, { recursive: true })
      for (let index = 0; index < shots.length; index += 1) {
        if (controller.signal.aborted) throw new Error('已取消')
        const shot = shots[index]
        const file = `assets/study/${studyId}/clips/clip_${String(index + 1).padStart(3, '0')}.mp4`
        await runFfmpeg(
          [
            '-y',
            '-ss',
            shot.start.toFixed(3),
            '-i',
            absolute,
            '-t',
            Math.max(0.2, shot.end - shot.start).toFixed(3),
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '26',
            ...(probe.hasAudio
              ? ['-c:a', 'aac', '-b:a', '128k']
              : ['-an']),
            '-movflags',
            '+faststart',
            join(root, file)
          ],
          { signal: controller.signal }
        )
        motionClips.push({
          path: file,
          kind: 'video',
          title: `切片 ${String(index + 1).padStart(2, '0')}`,
          duration: Math.max(0.2, shot.end - shot.start),
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          hasAudio: probe.hasAudio
        })
        emit({
          nodeId: input.nodeId,
          studyId,
          status: 'running',
          percent: 76 + Math.round((10 * (index + 1)) / shots.length),
          current: index + 1,
          total: shots.length,
          message: '正在截取动态切片'
        })
      }
    }

    let music: FilmStudyAutoAsset | undefined
    if (outputs.music && probe.hasAudio) {
      const audioDir = join(root, 'assets', 'study', studyId, 'audio')
      await fs.mkdir(audioDir, { recursive: true })
      const file = `assets/study/${studyId}/audio/bgm.m4a`
      await runFfmpeg(
        [
          '-y',
          '-i',
          absolute,
          '-vn',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          join(root, file)
        ],
        { signal: controller.signal }
      )
      music = {
        path: file,
        kind: 'audio',
        title: 'BGM',
        duration
      }
      emit({
        nodeId: input.nodeId,
        studyId,
        status: 'running',
        percent: 88,
        message: '已提取 BGM'
      })
    }

    const now = new Date().toISOString()
    let study: FilmStudy = {
      schemaVersion: 1,
      id: studyId,
      sourceNodeId: input.sourceNodeId ?? input.nodeId,
      sourcePath: input.path,
      sourceScope: input.scope,
      sourceName: input.sourceName?.trim() || '参考视频',
      duration,
      fps: probe.fps ?? 0,
      frameInterval:
        requestedInterval > 0
          ? requestedInterval
          : Math.round((duration / Math.max(1, shots.length)) * 100) / 100,
      frames,
      segments: buildAutoSegments(shots, frames),
      createdAt: now,
      updatedAt: now
    }

    const modelKey = await pickModel(input.modelKey)
    let analyzed = false
    let analysisError: string | undefined

    if (modelKey) {
      emit({
        nodeId: input.nodeId,
        studyId,
        status: 'running',
        percent: 92,
        message: '正在分析分镜'
      })
      try {
        study = await requestAnalysis(study, cuts, frames, root, modelKey)
        study = { ...study, analysisModel: modelKey }
        analyzed = true
      } catch (error) {
        analysisError =
          error instanceof Error ? error.message : String(error)
      }
    }

    const saved = await saveFilmStudy(root, study)

    emit({
      nodeId: input.nodeId,
      studyId,
      status: 'done',
      percent: 100,
      frameCount: saved.frames.length,
      interval: saved.frameInterval,
      duration: saved.duration,
      fps: saved.fps,
      message: analyzed ? '分镜分析完成' : '分镜已生成'
    })

    return {
      study: saved,
      shotCount: saved.segments.length,
      usedShotDetection,
      analyzed,
      analysisError,
      ...(motionClips.length > 0 ? { motionClips } : {}),
      ...(music ? { music } : {})
    }
  } catch (error) {
    if (controller.signal.aborted) {
      emit({
        nodeId: input.nodeId,
        studyId,
        status: 'cancelled',
        percent: 0,
        message: '已取消拉片'
      })
      return { cancelled: true }
    }

    const message = error instanceof Error ? error.message : String(error)
    emit({
      nodeId: input.nodeId,
      studyId,
      status: 'error',
      percent: 0,
      error: message
    })
    throw error
  } finally {
    autoTasks.delete(input.nodeId)
  }
}

