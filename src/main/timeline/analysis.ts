import { spawn } from 'node:child_process'
import type {
  TimelineAnalysisKind,
  TimelineAnalysisMarker
} from '@shared/ipc-contract'
import { ffmpegBinary } from '../media/ffmpeg'

interface CaptureResult {
  stdout: Buffer
  stderr: string
}

/** 运行 ffmpeg 并收集 stdout / stderr，用于滤镜日志或 PCM 解码 */
function runCapture(
  args: string[],
  signal?: AbortSignal,
  collectStdout = false
): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, {
      windowsHide: true,
      stdio: ['ignore', collectStdout ? 'pipe' : 'ignore', 'pipe']
    })

    const chunks: Buffer[] = []
    let stderr = ''
    let settled = false
    let aborted = false
    let killTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort)
      if (killTimer) clearTimeout(killTimer)
    }

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve({ stdout: Buffer.concat(chunks), stderr })
    }

    const onAbort = (): void => {
      if (aborted) return
      aborted = true
      child.kill('SIGKILL')
      killTimer = setTimeout(() => finish(new Error('已取消')), 5000)
    }

    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort)

    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
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
        finish(new Error(`分析失败（退出码 ${code}）：${stderr.slice(-600)}`))
        return
      }
      finish()
    })
  })
}

function detectionArgs(
  path: string,
  sourceStartMs: number,
  durationMs: number,
  speed: number,
  filter: string
): string[] {
  const sourceDuration = Math.max(1, durationMs) * speed
  return [
    '-hide_banner',
    '-nostats',
    '-ss',
    (Math.max(0, sourceStartMs) / 1000).toFixed(3),
    '-t',
    (sourceDuration / 1000).toFixed(3),
    '-i',
    path,
    '-af',
    filter,
    '-f',
    'null',
    '-'
  ]
}

function detectShots(stderr: string): number[] {
  const shots: number[] = []
  const pattern = /lavfi\.scd\.time:\s*([\d.]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(stderr)) !== null) {
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0.05) shots.push(value * 1000)
  }
  return shots
}

function detectSilences(stderr: string): { startMs: number; endMs: number }[] {
  const silences: { startMs: number; endMs: number }[] = []
  let open: number | null = null

  for (const line of stderr.split('\n')) {
    const start = /silence_start:\s*(-?[\d.]+)/.exec(line)
    if (start) {
      const value = Math.max(0, Number(start[1]) * 1000)
      open = value
      continue
    }
    const end = /silence_end:\s*(-?[\d.]+)/.exec(line)
    if (end && open !== null) {
      silences.push({ startMs: open, endMs: Math.max(open + 100, Number(end[1]) * 1000) })
      open = null
    }
  }

  return silences
}

function detectBeats(pcm: Buffer): number[] {
  const sampleRate = 16_000
  const windowSize = 320 // 20ms
  const total = Math.floor(pcm.length / 2 / windowSize)
  if (total < 8) return []

  const energies: number[] = []
  for (let index = 0; index < total; index += 1) {
    let sum = 0
    const offset = index * windowSize * 2
    for (let sample = 0; sample < windowSize; sample += 1) {
      const value = pcm.readInt16LE(offset + sample * 2) / 32768
      sum += value * value
    }
    energies.push(Math.sqrt(sum / windowSize))
  }

  const average = energies.reduce((sum, value) => sum + value, 0) / energies.length
  const threshold = Math.max(0.012, average * 1.45)
  const minGap = 250 // ms
  const beats: number[] = []

  for (let index = 1; index < energies.length - 1; index += 1) {
    const value = energies[index]
    if (value < threshold) continue
    if (value < energies[index - 1] || value < energies[index + 1]) continue
    const atMs = index * 20
    const last = beats[beats.length - 1]
    if (last !== undefined && atMs - last < minGap) continue
    beats.push(atMs)
    if (beats.length >= 500) break
  }

  return beats
}

function scaleTime(value: number, speed: number): number {
  return Math.max(0, Math.round(value / Math.max(0.1, speed)))
}

export async function analyzeMedia(
  kind: TimelineAnalysisKind,
  path: string,
  sourceStartMs: number,
  durationMs: number,
  speed: number,
  signal?: AbortSignal
): Promise<TimelineAnalysisMarker[]> {
  if (kind === 'shots') {
    const sourceDuration = Math.max(1, durationMs) * speed
    const result = await runCapture(
      [
        '-hide_banner',
        '-nostats',
        '-ss',
        (Math.max(0, sourceStartMs) / 1000).toFixed(3),
        '-t',
        (sourceDuration / 1000).toFixed(3),
        '-i',
        path,
        '-an',
        '-vf',
        'scdet=threshold=10',
        '-f',
        'null',
        '-'
      ],
      signal
    )
    return detectShots(result.stderr).map((value, index) => ({
      atMs: scaleTime(value, speed),
      label: `镜头 ${index + 1}`,
      color: '#6ea8fe'
    }))
  }

  if (kind === 'silences') {
    const result = await runCapture(
      detectionArgs(
        path,
        sourceStartMs,
        durationMs,
        speed,
        'silencedetect=noise=-35dB:d=0.4'
      ),
      signal
    )
    return detectSilences(result.stderr).map((range) => {
      const startMs = scaleTime(range.startMs, speed)
      return {
        atMs: startMs,
        durationMs: Math.max(100, scaleTime(range.endMs, speed) - startMs),
        label: '静音',
        color: '#f0b45a'
      }
    })
  }

  const result = await runCapture(
    [
      '-hide_banner',
      '-nostats',
      '-ss',
      (Math.max(0, sourceStartMs) / 1000).toFixed(3),
      '-t',
      ((Math.max(1, durationMs) * speed) / 1000).toFixed(3),
      '-i',
      path,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      's16le',
      '-'
    ],
    signal,
    true
  )

  return detectBeats(result.stdout).map((value) => ({
    atMs: scaleTime(value, speed),
    label: '节拍',
    color: '#7bd88f'
  }))
}
