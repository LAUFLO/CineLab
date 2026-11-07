import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ExtractFrameRequest, ExtractFrameResult, FrameMode } from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { probeMedia, runFfmpeg } from './ffmpeg'
import { resolveMediaPath } from './paths'

const LABEL: Record<FrameMode, string> = {
  first: '首帧',
  last: '尾帧',
  current: '当前帧'
}

export async function extractFrame(
  projectRoot: string,
  input: ExtractFrameRequest
): Promise<ExtractFrameResult> {
  const absolute = await resolveMediaPath(projectRoot, input.path)
  const probe = await probeMedia(absolute)

  if (!probe.duration) throw new Error('无法读取视频时长')

  const lastFrameTime = Math.max(0, probe.duration - 0.05)
  const time =
    input.mode === 'first'
      ? 0
      : input.mode === 'last'
        ? lastFrameTime
        : Math.min(Math.max(0, input.time ?? 0), lastFrameTime)

  const tmpDir = join(app.getPath('temp'), `cinelab-frame-${randomUUID()}`)
  await fs.mkdir(tmpDir, { recursive: true })
  const outPath = join(tmpDir, 'frame.png')

  try {
    // -ss/-sseof must be input options: seeking past the last frame with an
    // output-side -ss makes ffmpeg exit 0 without writing any file.
    const seek =
      input.mode === 'last'
        ? ['-sseof', '-0.1']
        : ['-ss', time.toFixed(3)]

    await runFfmpeg([
      '-y',
      ...seek,
      '-i',
      absolute,
      '-frames:v',
      '1',
      '-vsync',
      '0',
      outPath
    ])

    const written = await fs
      .access(outPath)
      .then(() => true)
      .catch(() => false)
    if (!written) {
      throw new Error('未能抽取到视频帧，请更换素材或稍后重试')
    }

    const data = await fs.readFile(outPath)
    const asset = await ingestAsset({
      projectPath: projectRoot,
      data,
      kind: 'image',
      mime: 'image/png',
      model: `本地抽帧（${LABEL[input.mode]}）`
    })

    return { asset, duration: probe.duration, time }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
