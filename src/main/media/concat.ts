import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { getLibraryRoot } from '../library/config'
import { probeMedia, runFfmpeg } from './ffmpeg'
import { resolveInside } from './paths'

export type ConcatResolution = '720p' | '1080p'
export type ConcatQuality = 'standard' | 'high'

export interface ConcatOptions {
  resolution?: ConcatResolution
  quality?: ConcatQuality
  subtitlePath?: string
  bgmPath?: string
  bgmVolume?: number
  signal?: AbortSignal
}

function escapeSubtitlePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
}

/**
 * 将多个全局库视频按顺序拼接为一个 MP4。
 * 每个片段先统一分辨率/帧率/编码，再用 concat demuxer 无损拼接，
 * 避免直接 concat 因编码参数不一致而失败。
 */
export async function concatVideos(
  relativePaths: string[],
  outputPath: string,
  options: ConcatOptions = {}
): Promise<void> {
  if (relativePaths.length < 2) {
    throw new Error('至少需要两个视频')
  }

  const root = await getLibraryRoot()
  const inputs = relativePaths.map((path) => resolveInside(root, path))
  const resolution = options.resolution ?? '720p'
  const [width, height] = resolution === '1080p' ? [1920, 1080] : [1280, 720]
  const crf = options.quality === 'high' ? 18 : 23
  const tempDir = join(app.getPath('temp'), `cinelab-concat-${randomUUID()}`)

  await fs.mkdir(tempDir, { recursive: true })

  try {
    const segments: string[] = []

    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index]
      const probe = await probeMedia(input)
      if (!probe.duration) {
        throw new Error(`无法读取视频时长：${basename(input)}`)
      }

      const segment = join(tempDir, `segment-${index}.mp4`)
      const args = ['-y', '-i', input]

      if (!probe.hasAudio) {
        args.push(
          '-f',
          'lavfi',
          '-i',
          'anullsrc=channel_layout=stereo:sample_rate=48000'
        )
      }

      args.push(
        '-vf',
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        String(crf),
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
        ...(probe.hasAudio
          ? []
          : ['-map', '0:v:0', '-map', '1:a:0', '-shortest']),
        segment
      )

      await runFfmpeg(args, { signal: options.signal })
      segments.push(segment)
    }

    const listPath = join(tempDir, 'list.txt')
    const list = segments
      .map((segment) => `file '${segment.replace(/'/g, "'\\''")}'`)
      .join('\n')
    await fs.writeFile(listPath, list, 'utf8')

    const concatenated = join(tempDir, 'concatenated.mp4')
    await runFfmpeg(
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        concatenated
      ],
      { signal: options.signal }
    )

    let current = concatenated

    if (options.subtitlePath) {
      const subtitled = join(tempDir, 'subtitled.mp4')
      const escaped = escapeSubtitlePath(options.subtitlePath)
      await runFfmpeg(
        [
          '-y',
          '-i',
          current,
          '-vf',
          `subtitles=filename='${escaped}':force_style='FontName=Microsoft YaHei,FontSize=18,Outline=1,Shadow=0'`,
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          String(crf),
          '-c:a',
          'copy',
          subtitled
        ],
        { signal: options.signal }
      )
      current = subtitled
    }

    if (options.bgmPath) {
      const volume = Math.min(1, Math.max(0.05, options.bgmVolume ?? 0.25))
      await runFfmpeg(
        [
          '-y',
          '-i',
          current,
          '-stream_loop',
          '-1',
          '-i',
          options.bgmPath,
          '-filter_complex',
          `[1:a]volume=${volume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[a]`,
          '-map',
          '0:v',
          '-map',
          '[a]',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-shortest',
          outputPath
        ],
        { signal: options.signal }
      )
      return
    }

    if (current !== outputPath) {
      await fs.copyFile(current, outputPath)
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
