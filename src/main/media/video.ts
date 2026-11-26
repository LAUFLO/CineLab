import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { GeneratedAsset } from '@shared/generation'
import {
  centerCropRect,
  parseAspectRatio,
  type CropVideoRequest,
  type RemoveSubtitlesRequest,
  type SplitAvRequest,
  type SplitAvResult,
  type TrimVideoRequest
} from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { probeMedia, runFfmpeg } from './ffmpeg'
import { resolveMediaPath } from './paths'
import { withTempDir } from './temp'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export async function trimVideo(
  projectRoot: string,
  input: TrimVideoRequest
): Promise<GeneratedAsset> {
  const absolute = await resolveMediaPath(projectRoot, input.path)
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

export async function extractSilentVideo(
  projectRoot: string,
  absolute: string
): Promise<GeneratedAsset> {
  return withTempDir('cinelab-silent', async (dir) => {
    const videoPath = join(dir, 'video.mp4')

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

    return ingestAsset({
      projectPath: projectRoot,
      data: await fs.readFile(videoPath),
      kind: 'video',
      mime: 'video/mp4',
      model: '本地分离（无声视频）'
    })
  })
}

export async function splitAv(
  projectRoot: string,
  input: SplitAvRequest
): Promise<SplitAvResult> {
  const absolute = await resolveMediaPath(projectRoot, input.path)
  const probe = await probeMedia(absolute)

  if (!probe.hasAudio) throw new Error('当前视频无音轨，无法分离音视频')
  if (!probe.width || !probe.height) {
    throw new Error('当前素材没有视频流，无法分离音视频')
  }

  return withTempDir('cinelab-split', async (dir) => {
    const audioPath = join(dir, 'audio.m4a')

    const video = await extractSilentVideo(projectRoot, absolute)

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
      video,
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
  const parsedRatio = parseAspectRatio(input.ratio)
  if (!parsedRatio) {
    throw new Error('裁切比例格式无效，请用 4:5 这样的格式')
  }

  const absolute = await resolveMediaPath(projectRoot, input.path)
  const probe = await probeMedia(absolute)

  if (!probe.width || !probe.height) throw new Error('无法读取视频尺寸')

  const { width, height, x, y } = centerCropRect(
    probe.width,
    probe.height,
    parsedRatio.value
  )

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
  const absolute = await resolveMediaPath(projectRoot, input.path)
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
