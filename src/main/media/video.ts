import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { GeneratedAsset } from '@shared/generation'
import type {
  CropVideoRequest,
  RemoveSubtitlesRequest,
  SplitAvRequest,
  SplitAvResult,
  TrimVideoRequest
} from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { probeMedia, runFfmpeg } from './ffmpeg'
import { resolveInside } from './paths'

const ALLOWED_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4'])

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

async function withTempDir<T>(
  prefix: string,
  run: (dir: string) => Promise<T>
): Promise<T> {
  const dir = join(app.getPath('temp'), `${prefix}-${randomUUID()}`)
  await fs.mkdir(dir, { recursive: true })

  try {
    return await run(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function trimVideo(
  projectRoot: string,
  input: TrimVideoRequest
): Promise<GeneratedAsset> {
  const absolute = resolveInside(projectRoot, input.path)
  const probe = await probeMedia(absolute)
  const duration = probe.duration

  if (!duration) throw new Error('无法读取视频时长')

  const start = Math.max(0, Math.min(input.start, duration))
  const end = Math.min(input.end, duration)

  if (end - start < 0.1) throw new Error('截取区间太短')

  return withTempDir('cinelab-trim', async (dir) => {
    const outPath = join(dir, 'trim.mp4')

    await runFfmpeg([
      '-y',
      '-ss',
      start.toFixed(3),
      '-i',
      absolute,
      '-t',
      (end - start).toFixed(3),
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outPath
    ])

    return ingestAsset({
      projectPath: projectRoot,
      data: await fs.readFile(outPath),
      kind: 'video',
      mime: 'video/mp4',
      model: `本地截取（${start.toFixed(1)}s - ${end.toFixed(1)}s）`
    })
  })
}

export async function splitAv(
  projectRoot: string,
  input: SplitAvRequest
): Promise<SplitAvResult> {
  const absolute = resolveInside(projectRoot, input.path)
  const probe = await probeMedia(absolute)

  if (!probe.hasAudio) throw new Error('当前视频无音轨，无法分离音视频')

  return withTempDir('cinelab-split', async (dir) => {
    const videoPath = join(dir, 'video.mp4')
    const audioPath = join(dir, 'audio.m4a')

    await runFfmpeg([
      '-y',
      '-i',
      absolute,
      '-an',
      '-c:v',
      'copy',
      '-movflags',
      '+faststart',
      videoPath
    ])

    await runFfmpeg([
      '-y',
      '-i',
      absolute,
      '-vn',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      audioPath
    ])

    return {
      video: await ingestAsset({
        projectPath: projectRoot,
        data: await fs.readFile(videoPath),
        kind: 'video',
        mime: 'video/mp4',
        model: '本地分离（无声视频）'
      }),
      audio: await ingestAsset({
        projectPath: projectRoot,
        data: await fs.readFile(audioPath),
        kind: 'audio',
        mime: 'audio/mp4',
        model: '本地分离（音轨）'
      })
    }
  })
}

export async function cropVideo(
  projectRoot: string,
  input: CropVideoRequest
): Promise<GeneratedAsset> {
  if (!ALLOWED_RATIOS.has(input.ratio)) throw new Error('不支持的裁切比例')

  const absolute = resolveInside(projectRoot, input.path)
  const probe = await probeMedia(absolute)

  if (!probe.width || !probe.height) throw new Error('无法读取视频尺寸')

  const [ratioWidth, ratioHeight] = input.ratio.split(':').map(Number)
  const targetRatio = ratioWidth / ratioHeight
  const sourceRatio = probe.width / probe.height

  let width: number
  let height: number

  if (sourceRatio > targetRatio) {
    height = probe.height
    width = Math.round(probe.height * targetRatio)
  } else {
    width = probe.width
    height = Math.round(probe.width / targetRatio)
  }

  width = Math.max(2, Math.floor(width / 2) * 2)
  height = Math.max(2, Math.floor(height / 2) * 2)

  const x = Math.max(0, Math.floor((probe.width - width) / 2))
  const y = Math.max(0, Math.floor((probe.height - height) / 2))

  return withTempDir('cinelab-vcrop', async (dir) => {
    const outPath = join(dir, 'crop.mp4')

    await runFfmpeg([
      '-y',
      '-i',
      absolute,
      '-vf',
      `crop=${width}:${height}:${x}:${y}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      outPath
    ])

    return ingestAsset({
      projectPath: projectRoot,
      data: await fs.readFile(outPath),
      kind: 'video',
      mime: 'video/mp4',
      model: `本地画面裁切（${input.ratio}）`
    })
  })
}

export async function removeSubtitles(
  projectRoot: string,
  input: RemoveSubtitlesRequest
): Promise<GeneratedAsset> {
  const absolute = resolveInside(projectRoot, input.path)
  const probe = await probeMedia(absolute)

  if (!probe.width || !probe.height) throw new Error('无法读取视频尺寸')

  const x = clamp(input.x, 1, probe.width - 2)
  const y = clamp(input.y, 1, probe.height - 2)
  const width = clamp(input.width, 2, probe.width - x - 1)
  const height = clamp(input.height, 2, probe.height - y - 1)

  return withTempDir('cinelab-delogo', async (dir) => {
    const outPath = join(dir, 'delogo.mp4')

    await runFfmpeg([
      '-y',
      '-i',
      absolute,
      '-vf',
      `delogo=x=${x}:y=${y}:w=${width}:h=${height}:show=0`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      outPath
    ])

    return ingestAsset({
      projectPath: projectRoot,
      data: await fs.readFile(outPath),
      kind: 'video',
      mime: 'video/mp4',
      model: '本地框选去字幕'
    })
  })
}
