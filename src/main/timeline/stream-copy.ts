import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { TimelineExportProgress } from '@shared/ipc-contract'
import { docDurationMs } from '@shared/timeline-layout'
import type { TimelineClip, TimelineDoc } from '@shared/timeline-schema'
import { probeMedia, runFfmpeg } from '../media/ffmpeg'
import { resolveMediaPath } from '../media/paths'

interface StreamSignature {
  videoCodec: string
  pixFmt: string
  hasAudio: boolean
  audioCodec?: string
  audioSampleRate?: number
  audioChannels?: number
}

function quoteConcatPath(path: string): string {
  return `file '${path.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`
}

/**
 * 纯拼接的 stream-copy 路径：所有片段编码参数一致、无裁剪/变速/效果/音量变化时，
 * 直接用 concat demuxer + `-c copy`，不重新编码。
 * 返回 null 表示不满足条件或 copy 失败，调用方回退到编码快速路径。
 */
export async function tryExportStreamCopy(
  projectRoot: string,
  doc: TimelineDoc,
  clips: TimelineClip[],
  onProgress: (progress: TimelineExportProgress) => void,
  signal?: AbortSignal
): Promise<string | null> {
  if (doc.background.type !== 'none') return null
  if (clips.length === 0) return null

  const totalMs = docDurationMs(doc)
  const list: string[] = []
  let reference: StreamSignature | null = null

  for (const clip of clips) {
    if (signal?.aborted) throw new Error('已取消')
    if (clip.kind !== 'video' || !clip.media) return null
    if (clip.sourceStartMs !== 0) return null
    if (clip.speed !== 1 || clip.opacity !== 1 || clip.blend !== 'normal') return null
    if (clip.transform || clip.crop || clip.transitionIn) return null
    if (clip.volume !== 1 || clip.fadeInMs > 0 || clip.fadeOutMs > 0) return null
    if (clip.muted || clip.keys.length > 0) return null

    const path = await resolveMediaPath(projectRoot, clip.media.path)
    const probe = await probeMedia(path).catch(() => null)
    if (!probe || !probe.width || !probe.height || !probe.fps || !probe.duration) {
      return null
    }
    if (Math.abs(probe.duration * 1000 - clip.durationMs) > 150) return null
    if (probe.width !== doc.video.width || probe.height !== doc.video.height) return null
    if (Math.abs(probe.fps - doc.video.fps) > 0.01) return null
    if (!probe.videoCodec || !probe.pixFmt) return null

    const signature: StreamSignature = {
      videoCodec: probe.videoCodec,
      pixFmt: probe.pixFmt,
      hasAudio: probe.hasAudio,
      audioCodec: probe.audioCodec,
      audioSampleRate: probe.audioSampleRate,
      audioChannels: probe.audioChannels
    }

    if (!reference) {
      reference = signature
    } else if (
      signature.videoCodec !== reference.videoCodec ||
      signature.pixFmt !== reference.pixFmt ||
      signature.hasAudio !== reference.hasAudio ||
      (reference.hasAudio &&
        (signature.audioCodec !== reference.audioCodec ||
          signature.audioSampleRate !== reference.audioSampleRate ||
          signature.audioChannels !== reference.audioChannels))
    ) {
      return null
    }

    list.push(path)
  }

  const sumMs = clips.reduce((sum, clip) => sum + clip.durationMs, 0)
  if (Math.abs(sumMs - totalMs) > 1) return null

  const exportsDir = join(projectRoot, 'exports')
  await fs.mkdir(exportsDir, { recursive: true })
  const fileName = `成片-${Date.now()}.mp4`
  const output = join(exportsDir, fileName)
  const listPath = join(app.getPath('temp'), `cinelab-concat-${randomUUID()}.txt`)

  await fs.writeFile(listPath, list.map(quoteConcatPath).join('\n'), 'utf8')
  onProgress({ frame: 1, total: 1, stage: 'encoding' })

  try {
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
        '-t',
        (totalMs / 1000).toFixed(3),
        output
      ],
      { signal }
    )
  } catch (error) {
    await fs.rm(output, { force: true }).catch(() => undefined)
    if (signal?.aborted) throw error
    return null
  } finally {
    await fs.rm(listPath, { force: true }).catch(() => undefined)
  }

  if (signal?.aborted) {
    await fs.rm(output, { force: true }).catch(() => undefined)
    throw new Error('已取消')
  }

  onProgress({ frame: 1, total: 1, stage: 'done' })
  return `exports/${fileName}`
}
