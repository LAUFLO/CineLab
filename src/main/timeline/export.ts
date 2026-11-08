import { BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Writable } from 'node:stream'
import type { TimelineExportProgress } from '@shared/ipc-contract'
import type {
  TimelineExportSettings,
  TimelineVideoCodec
} from '@shared/ipc-contract'
import { docDurationMs } from '@shared/timeline-layout'
import type { TimelineClip, TimelineDoc } from '@shared/timeline-schema'
import { ffmpegBinary, probeMedia, runFfmpeg } from '../media/ffmpeg'
import { resolveMediaPath } from '../media/paths'
import { buildAudioFilters, collectAudioInputs } from './audio-mix'
import { fastPathClips } from './fast-path'
import { tryExportStreamCopy } from './stream-copy'

export type { TimelineExportProgress }

export interface TimelineExportOptions {
  signal?: AbortSignal
  settings?: TimelineExportSettings
}

const CANCELED = '已取消'

function videoEncoderArgs(
  codec: TimelineVideoCodec | undefined,
  crf: number | undefined
): string[] {
  if (codec === 'hevc') {
    return [
      '-c:v',
      'libx265',
      '-preset',
      'medium',
      '-crf',
      String(crf ?? 22),
      '-pix_fmt',
      'yuv420p',
      '-tag:v',
      'hvc1'
    ]
  }

  if (codec === 'av1') {
    return [
      '-c:v',
      'libaom-av1',
      '-crf',
      String(crf ?? 30),
      '-b:v',
      '0',
      '-cpu-used',
      '6',
      '-row-mt',
      '1',
      '-pix_fmt',
      'yuv420p'
    ]
  }

  return [
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    String(crf ?? 18),
    '-pix_fmt',
    'yuv420p'
  ]
}

function throwIfCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error(CANCELED)
}

interface StreamingFfmpeg {
  stdin: Writable
  done: Promise<void>
  kill: () => void
}

/** 启动一个从 stdin 接收 JPEG 帧的 ffmpeg 进程 */
function startFfmpeg(args: string[], signal?: AbortSignal): StreamingFfmpeg {
  const child = spawn(ffmpegBinary(), args, {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe']
  })

  let stderr = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
    if (stderr.length > 20000) stderr = stderr.slice(-20000)
  })

  let settled = false
  let aborted = false
  let onAbort: (() => void) | null = null
  let killTimer: ReturnType<typeof setTimeout> | null = null

  const done = new Promise<void>((resolve, reject) => {
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      if (killTimer) {
        clearTimeout(killTimer)
        killTimer = null
      }
      if (error) reject(error)
      else resolve()
    }

    onAbort = (): void => {
      if (aborted) return
      aborted = true
      child.kill('SIGKILL')
      // 等待子进程真正退出后再 reject，避免 Windows 上删除仍被占用的半成品
      killTimer = setTimeout(() => finish(new Error(CANCELED)), 5000)
    }

    if (signal?.aborted) {
      onAbort()
    } else {
      signal?.addEventListener('abort', onAbort)
    }

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (aborted) {
        finish(new Error(CANCELED))
        return
      }
      if (code === 0) finish()
      else finish(new Error(`ffmpeg 失败（退出码 ${code}）：${stderr.slice(-800)}`))
    })
  })

  const stdin = child.stdin
  if (!stdin) throw new Error('无法创建 ffmpeg 输入管道')

  return {
    stdin,
    done,
    kill: () => child.kill('SIGKILL')
  }
}

/** 写入一帧并处理 backpressure */
function writeFrame(stdin: Writable, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (stdin.destroyed || !stdin.writable) {
      reject(new Error(CANCELED))
      return
    }

    let settled = false

    const cleanup = (): void => {
      stdin.off('drain', onDrain)
      stdin.off('error', onError)
      stdin.off('close', onClose)
    }

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }

    const onError = (error: Error): void => finish(error)
    const onDrain = (): void => finish()
    const onClose = (): void => finish(new Error(CANCELED))

    stdin.once('error', onError)
    stdin.once('close', onClose)
    try {
      if (stdin.write(buffer)) {
        finish()
      } else {
        stdin.once('drain', onDrain)
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/**
 * 快速路径：单视频轨纯拼接，直接交给 ffmpeg，不走逐帧渲染。
 */
async function exportFastPath(
  projectRoot: string,
  doc: TimelineDoc,
  clips: TimelineClip[],
  onProgress: (progress: TimelineExportProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  throwIfCanceled(signal)

  const { width, height, fps } = doc.video
  const totalMs = docDurationMs(doc)

  const inputs: string[] = []
  const filters: string[] = []
  const concatLabels: string[] = []
  const probeCache = new Map<string, boolean>()

  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index]
    const path = await resolveMediaPath(projectRoot, clip.media!.path)
    inputs.push('-i', path)
    const start = Math.max(0, clip.sourceStartMs) / 1000
    const duration = Math.max(0.01, clip.durationMs) / 1000
    filters.push(
      `[${index}:v]trim=start=${start.toFixed(3)}:duration=${duration.toFixed(
        3
      )},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${index}]`
    )
    concatLabels.push(`[v${index}]`)

    let hasAudio = probeCache.get(path)
    if (hasAudio === undefined) {
      hasAudio =
        (await probeMedia(path).catch(() => null))?.hasAudio ?? false
      probeCache.set(path, hasAudio)
    }

    if (hasAudio && !clip.muted) {
      const parts = [
        `atrim=start=${start.toFixed(3)}:duration=${duration.toFixed(3)}`,
        'asetpts=PTS-STARTPTS',
        `apad=whole_dur=${duration.toFixed(3)}`,
        'aresample=48000',
        'aformat=sample_fmts=fltp:channel_layouts=stereo',
        `volume=${Math.max(0, clip.volume)}`
      ]
      const fadeIn = Math.min(Math.max(0, clip.fadeInMs), clip.durationMs) / 1000
      const fadeOut = Math.min(Math.max(0, clip.fadeOutMs), clip.durationMs) / 1000
      if (fadeIn > 0) {
        parts.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`)
      }
      if (fadeOut > 0) {
        parts.push(
          `afade=t=out:st=${(duration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(
            3
          )}`
        )
      }
      filters.push(`[${index}:a:0]${parts.join(',')}[a${index}]`)
    } else {
      filters.push(
        `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration.toFixed(
          3
        )},aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`
      )
    }
    concatLabels.push(`[a${index}]`)
  }

  filters.push(
    `${concatLabels.join('')}concat=n=${clips.length}:v=1:a=1[outv][outa]`
  )

  const exportsDir = join(projectRoot, 'exports')
  await fs.mkdir(exportsDir, { recursive: true })
  const fileName = `成片-${Date.now()}.mp4`
  const output = join(exportsDir, fileName)

  throwIfCanceled(signal)
  onProgress({ frame: 1, total: 1, stage: 'encoding' })

  try {
    await runFfmpeg(
      [
        '-y',
        ...inputs,
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[outv]',
        '-map',
        '[outa]',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-t',
        (totalMs / 1000).toFixed(3),
        '-movflags',
        '+faststart',
        output
      ],
      { signal }
    )
    throwIfCanceled(signal)
  } catch (error) {
    await fs.rm(output, { force: true }).catch(() => undefined)
    throw error
  }

  onProgress({ frame: 1, total: 1, stage: 'done' })
  return `exports/${fileName}`
}

/**
 * 完整路径：隐藏窗口逐帧渲染，JPEG 通过 stdin 直接流进 ffmpeg。
 * 不落临时帧目录，4K 长片不会堆积数 GB 文件。
 */
export async function exportTimeline(
  projectRoot: string,
  doc: TimelineDoc,
  onProgress: (progress: TimelineExportProgress) => void,
  options: TimelineExportOptions = {}
): Promise<string> {
  const { signal, settings } = options

  const canUseFastPath =
    settings?.codec === undefined || settings.codec === 'h264'
  const fastClips = canUseFastPath ? fastPathClips(doc) : null
  if (fastClips) {
    const copied = await tryExportStreamCopy(
      projectRoot,
      doc,
      fastClips,
      onProgress,
      signal
    )
    if (copied) return copied
    return exportFastPath(projectRoot, doc, fastClips, onProgress, signal)
  }

  const fps = doc.video.fps
  const totalMs = docDurationMs(doc)
  const totalFrames = Math.max(1, Math.round((totalMs * fps) / 1000))

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const url = devUrl
    ? `${devUrl}/timeline-render.html`
    : `file://${join(__dirname, '../renderer/timeline-render.html').replace(/\\/g, '/')}`

  const exportsDir = join(projectRoot, 'exports')
  const fileName = `成片-${Date.now()}.mp4`
  const output = join(exportsDir, fileName)

  try {
    throwIfCanceled(signal)
    await fs.mkdir(exportsDir, { recursive: true })
    await win.loadURL(url)
    throwIfCanceled(signal)
    await win.webContents.executeJavaScript(
      `window.__setTimeline(${JSON.stringify(doc)})`
    )

    const audioClips = await collectAudioInputs(projectRoot, doc)
    throwIfCanceled(signal)

    const args = [
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-i',
      '-'
    ]
    for (const item of audioClips) args.push('-i', item.path)

    if (audioClips.length > 0) {
      const plan = buildAudioFilters(doc, audioClips, 1)

      args.push(
        '-filter_complex',
        plan.filters.join(';'),
        '-map',
        '0:v',
        '-map',
        plan.outputLabel,
        ...videoEncoderArgs(settings?.codec, settings?.crf),
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-t',
        (totalMs / 1000).toFixed(3),
        '-movflags',
        '+faststart',
        output
      )
    } else {
      args.push(
        ...videoEncoderArgs(settings?.codec, settings?.crf),
        '-t',
        (totalMs / 1000).toFixed(3),
        '-movflags',
        '+faststart',
        output
      )
    }

    throwIfCanceled(signal)
    const ffmpeg = startFfmpeg(args, signal)

    try {
      for (let index = 0; index < totalFrames; index++) {
        throwIfCanceled(signal)
        const timeMs = (index * 1000) / fps
        const dataUrl = await win.webContents.executeJavaScript(
          `window.__renderFrame(${timeMs})`
        )
        throwIfCanceled(signal)

        const base64 = String(dataUrl).split(',')[1] ?? ''
        if (!base64) throw new Error('渲染帧为空')
        await writeFrame(ffmpeg.stdin, Buffer.from(base64, 'base64'))

        if (index % 10 === 0 || index === totalFrames - 1) {
          onProgress({ frame: index + 1, total: totalFrames, stage: 'rendering' })
        }
      }

      ffmpeg.stdin.end()
      onProgress({ frame: totalFrames, total: totalFrames, stage: 'encoding' })
      await ffmpeg.done
    } catch (error) {
      ffmpeg.kill()
      ffmpeg.stdin.destroy()
      await ffmpeg.done.catch(() => undefined)
      throw error
    }

    throwIfCanceled(signal)
    onProgress({ frame: totalFrames, total: totalFrames, stage: 'done' })
    return `exports/${fileName}`
  } catch (error) {
    await fs.rm(output, { force: true }).catch(() => undefined)
    throw error
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
