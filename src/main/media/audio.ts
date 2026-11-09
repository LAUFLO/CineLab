import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { GeneratedAsset } from '@shared/generation'
import type {
  AudioSpeedRequest,
  AudioTrimRequest
} from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { probeMedia, runFfmpeg } from './ffmpeg'
import { resolveMediaPath } from './paths'

const MIN_RATE = 0.1
const MAX_RATE = 4
const MIN_DURATION = 0.1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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

/** 把任意倍率拆成 ffmpeg atempo 支持的 0.5–2.0 链 */
export function buildAtempoFilter(rate: number): string {
  let remaining = clamp(rate, MIN_RATE, MAX_RATE)
  const parts: string[] = []

  while (remaining > 2 + 1e-6) {
    parts.push('atempo=2.0')
    remaining /= 2
  }
  while (remaining < 0.5 - 1e-6) {
    parts.push('atempo=0.5')
    remaining /= 0.5
  }
  parts.push(`atempo=${remaining.toFixed(4)}`)
  return parts.join(',')
}

export async function trimAudio(
  projectRoot: string,
  input: AudioTrimRequest
): Promise<GeneratedAsset> {
  const absolute = await resolveMediaPath(projectRoot, input.path, input.scope)
  const probe = await probeMedia(absolute)
  const duration = probe.duration

  if (!duration) throw new Error('无法读取音频时长')

  const start = Math.max(0, Math.min(input.start, duration))
  const end = Math.min(input.end, duration)

  if (end - start < MIN_DURATION) throw new Error('截取区间太短')

  return withTempDir('cinelab-audio-trim', async (dir) => {
    const outPath = join(dir, 'trim.m4a')

    await runFfmpeg([
      '-y',
      '-ss',
      start.toFixed(3),
      '-i',
      absolute,
      '-t',
      (end - start).toFixed(3),
      '-vn',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outPath
    ])

    return ingestAsset({
      projectPath: projectRoot,
      data: await fs.readFile(outPath),
      kind: 'audio',
      mime: 'audio/mp4',
      model: `本地截取（${start.toFixed(1)}s - ${end.toFixed(1)}s）`
    })
  })
}

export async function changeAudioSpeed(
  projectRoot: string,
  input: AudioSpeedRequest
): Promise<GeneratedAsset> {
  const rate = clamp(input.rate, MIN_RATE, MAX_RATE)
  if (!Number.isFinite(rate)) throw new Error('无效的变速倍率')
  if (Math.abs(rate - 1) < 0.001) throw new Error('倍率与原始一致')

  const absolute = await resolveMediaPath(projectRoot, input.path, input.scope)

  return withTempDir('cinelab-audio-speed', async (dir) => {
    const outPath = join(dir, 'speed.m4a')

    await runFfmpeg([
      '-y',
      '-i',
      absolute,
      '-vn',
      '-af',
      buildAtempoFilter(rate),
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outPath
    ])

    return ingestAsset({
      projectPath: projectRoot,
      data: await fs.readFile(outPath),
      kind: 'audio',
      mime: 'audio/mp4',
      model: `本地变速（${rate.toFixed(2)}x）`
    })
  })
}
