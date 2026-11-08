import { app } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { spawn } from 'node:child_process'
import type { MediaProbe } from '@shared/media'
import { log } from '../logger'

function unpacked(path: string): string {
  if (!app.isPackaged) return path
  return path.replace('app.asar', 'app.asar.unpacked')
}

export function ffmpegBinary(): string {
  if (!ffmpegPath) throw new Error('当前平台没有可用的 ffmpeg 二进制')
  return unpacked(ffmpegPath)
}

export function ffprobeBinary(): string {
  return unpacked(ffprobeStatic.path)
}

export interface RunFfmpegOptions {
  onProgress?: (seconds: number) => void
  signal?: AbortSignal
}

export function runFfmpeg(
  args: string[],
  options: RunFfmpegOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stderr = ''
    let settled = false
    let aborted = false
    let killTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', onAbort)
      if (killTimer) {
        clearTimeout(killTimer)
        killTimer = null
      }
    }

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }

    const onAbort = (): void => {
      if (aborted) return
      aborted = true
      child.kill('SIGKILL')
      // 等待子进程真正退出后再 reject，避免 Windows 上删除仍被占用的半成品
      killTimer = setTimeout(() => finish(new Error('已取消')), 5000)
    }

    if (options.signal?.aborted) {
      onAbort()
    } else {
      options.signal?.addEventListener('abort', onAbort)
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      if (!options.onProgress) return
      const match = /out_time_(?:ms|us)=(\d+)/.exec(chunk)
      if (match) options.onProgress(Number(match[1]) / 1_000_000)
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 20000) stderr = stderr.slice(-20000)
    })

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (aborted) {
        finish(new Error('已取消'))
        return
      }
      if (code === 0) {
        finish()
        return
      }
      log.error('ffmpeg failed', {
        code,
        args: args.slice(0, 12),
        stderr: stderr.slice(-1000)
      })
      finish(new Error(`ffmpeg 失败（退出码 ${code}）：${stderr.slice(-800)}`))
    })
  })
}

/** 运行 ffmpeg 并收集 stderr（用于 scdet 等滤镜日志） */
export function runFfmpegCapture(
  args: string[],
  options: { signal?: AbortSignal } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })

    let stderr = ''
    let settled = false
    let aborted = false

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(stderr)
    }

    const onAbort = (): void => {
      if (aborted) return
      aborted = true
      child.kill('SIGKILL')
    }

    if (options.signal?.aborted) onAbort()
    else options.signal?.addEventListener('abort', onAbort)

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 400_000) stderr = stderr.slice(-400_000)
    })

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (aborted) {
        finish(new Error('已取消'))
        return
      }
      if (code !== 0) {
        finish(new Error(`ffmpeg 失败（退出码 ${code}）：${stderr.slice(-600)}`))
        return
      }
      finish()
    })
  })
}

/** 运行 ffmpeg 并收集 stdout（用于 rawvideo / 图像分析） */
export function runFfmpegBuffer(
  args: string[],
  options: { signal?: AbortSignal } = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const chunks: Buffer[] = []
    let stderr = ''
    let settled = false
    let aborted = false

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(Buffer.concat(chunks))
    }

    const onAbort = (): void => {
      if (aborted) return
      aborted = true
      child.kill('SIGKILL')
    }

    if (options.signal?.aborted) onAbort()
    else options.signal?.addEventListener('abort', onAbort)

    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000)
    })

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (aborted) {
        finish(new Error('已取消'))
        return
      }
      if (code === 0) {
        finish()
        return
      }
      finish(new Error(`ffmpeg 失败（退出码 ${code}）：${stderr.slice(-600)}`))
    })
  })
}

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  pix_fmt?: string
  sample_rate?: string
  channels?: number
  duration?: string
}

interface FfprobeFormat {
  duration?: string
}

interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: FfprobeFormat
}

export function probeMedia(path: string): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffprobeBinary(),
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        path
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )

    let stdout = ''
    let stderr = ''

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe 失败（退出码 ${code}）：${stderr.slice(-400)}`))
        return
      }

      try {
        const data = JSON.parse(stdout) as FfprobeOutput
        const streams = data.streams ?? []
        const video = streams.find((stream) => stream.codec_type === 'video')
        const audio = streams.find((stream) => stream.codec_type === 'audio')

        const duration = Number(data.format?.duration ?? video?.duration ?? 0)
        let fps: number | undefined
        if (video?.avg_frame_rate) {
          const [num, den] = video.avg_frame_rate.split('/').map(Number)
          if (num > 0 && den > 0) fps = num / den
        }

        resolve({
          width: video?.width,
          height: video?.height,
          duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
          fps,
          hasAudio: Boolean(audio),
          videoCodec: video?.codec_name,
          pixFmt: video?.pix_fmt,
          audioCodec: audio?.codec_name,
          audioSampleRate: audio?.sample_rate
            ? Number(audio.sample_rate)
            : undefined,
          audioChannels: audio?.channels
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}
