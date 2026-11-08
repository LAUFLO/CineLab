import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { VideoOperationOptions } from '@shared/generation'
import { concatVideoFiles } from './concat'
import { probeMedia, runFfmpeg } from './ffmpeg'

async function trimToFile(
  input: string,
  start: number,
  end: number,
  output: string,
  signal?: AbortSignal
): Promise<void> {
  if (end - start < 0.05) throw new Error('片段区间太短')

  await runFfmpeg(
    [
      '-y',
      '-ss',
      start.toFixed(3),
      '-i',
      input,
      '-t',
      (end - start).toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      output
    ],
    { signal }
  )
}

async function buildConcatInputs(
  sourcePath: string,
  segmentPath: string,
  options: VideoOperationOptions,
  tempDir: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (options.operation === 'extend') {
    return options.direction === 'backward'
      ? [segmentPath, sourcePath]
      : [sourcePath, segmentPath]
  }

  const probe = await probeMedia(sourcePath)
  const duration = probe.duration
  if (!duration) throw new Error('无法读取源视频时长')

  const start = Math.max(0, Math.min(options.range?.start ?? 0, duration))
  const end = Math.min(
    duration,
    Math.max(options.range?.end ?? duration, start + 0.05)
  )
  const inputs: string[] = []

  if (start > 0.05) {
    const before = join(tempDir, 'before.mp4')
    await trimToFile(sourcePath, 0, start, before, signal)
    inputs.push(before)
  }

  inputs.push(segmentPath)

  if (end < duration - 0.05) {
    const after = join(tempDir, 'after.mp4')
    await trimToFile(sourcePath, end, duration, after, signal)
    inputs.push(after)
  }

  return inputs
}

/**
 * 按操作类型把接口返回的片段拼回源视频。
 * 接口返回完整视频时由调用方直接落盘，不经过这里。
 */
export async function applyVideoSegmentResult(
  sourcePath: string,
  segment: Buffer,
  options: VideoOperationOptions,
  signal?: AbortSignal
): Promise<Buffer> {
  const tempDir = join(app.getPath('temp'), `cinelab-video-op-${randomUUID()}`)
  await fs.mkdir(tempDir, { recursive: true })

  try {
    const segmentPath = join(tempDir, 'segment.mp4')
    await fs.writeFile(segmentPath, segment)

    const inputs = await buildConcatInputs(
      sourcePath,
      segmentPath,
      options,
      tempDir,
      signal
    )

    if (inputs.length === 1) {
      return fs.readFile(inputs[0])
    }

    const resultPath = join(tempDir, 'result.mp4')
    const probe = await probeMedia(sourcePath)
    await concatVideoFiles(inputs, resultPath, {
      ...(probe.width ? { width: probe.width } : {}),
      ...(probe.height ? { height: probe.height } : {}),
      quality: 'standard',
      signal
    })
    return fs.readFile(resultPath)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
