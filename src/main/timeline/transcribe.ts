import { app } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  TimelineTranscribeProgress,
  TimelineTranscribeRequest,
  TimelineTranscribeResult,
  TimelineTranscribeSegment
} from '@shared/ipc-contract'
import { docDurationMs } from '@shared/timeline-layout'
import type { TimelineDoc } from '@shared/timeline-schema'
import { componentDirectory } from '../components/service'
import { probeMedia, runFfmpeg } from '../media/ffmpeg'
import { resolveInside } from '../media/paths'
import { getLibraryRoot } from '../library/config'
import { getCurrentProjectRoot } from '../project/manager'
import { buildAudioFilters, collectAudioInputs } from './audio-mix'

interface WhisperJsonSegment {
  offsets?: { from?: number; to?: number }
  timestamps?: { from?: string; to?: string }
  text?: string
}

interface WhisperJson {
  result?: { language?: string }
  transcription?: WhisperJsonSegment[]
}

function parseTimestamp(value: string): number {
  const match = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(value)
  if (!match) return 0
  const [, h, m, s, ms] = match
  return (
    Number(h) * 3_600_000 +
    Number(m) * 60_000 +
    Number(s) * 1000 +
    Number(ms.padEnd(3, '0').slice(0, 3))
  )
}

function segmentRange(segment: WhisperJsonSegment): {
  startMs: number
  endMs: number
} {
  const from = segment.offsets?.from
  const to = segment.offsets?.to
  if (typeof from === 'number' && typeof to === 'number') {
    return { startMs: Math.max(0, from), endMs: Math.max(from + 1, to) }
  }

  const startMs = segment.timestamps?.from
    ? parseTimestamp(segment.timestamps.from)
    : 0
  const endMs = segment.timestamps?.to
    ? parseTimestamp(segment.timestamps.to)
    : startMs + 1
  return { startMs, endMs: Math.max(startMs + 1, endMs) }
}

function runWhisper(
  binary: string,
  model: string,
  wav: string,
  outBase: string,
  signal: AbortSignal | undefined,
  onProgress: (progress: TimelineTranscribeProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      [
        '-m',
        model,
        '-f',
        wav,
        '-l',
        'auto',
        '-oj',
        '-of',
        outBase,
        '--print-progress'
      ],
      {
        cwd: dirname(binary),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    let stderr = ''
    let aborted = false
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }

    const onAbort = (): void => {
      if (aborted) return
      aborted = true
      child.kill('SIGKILL')
      timer = setTimeout(() => finish(new Error('已取消')), 5000)
    }

    if (signal?.aborted) {
      onAbort()
    } else {
      signal?.addEventListener('abort', onAbort)
    }

    const onData = (chunk: string): void => {
      stderr += chunk
      if (stderr.length > 20000) stderr = stderr.slice(-20000)
      const match = /progress\s*=\s*(\d+)%/i.exec(chunk)
      if (match) {
        onProgress({
          stage: 'transcribing',
          percent: Math.min(100, Number(match[1]))
        })
      }
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', onData)
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', onData)

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (aborted) {
        finish(new Error('已取消'))
        return
      }
      if (code !== 0) {
        finish(new Error(`whisper 转写失败（退出码 ${code}）：${stderr.slice(-500)}`))
        return
      }
      finish()
    })
  })
}

async function resolveWhisper(): Promise<{ binary: string; model: string }> {
  const binary = join(
    componentDirectory('whisper-runtime'),
    'Release',
    process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  )
  const model = join(componentDirectory('whisper-model'), 'ggml-base.bin')

  try {
    await fs.access(binary)
  } catch {
    throw new Error('本地字幕运行时未安装')
  }
  try {
    await fs.access(model)
  } catch {
    throw new Error('Whisper Base 模型未安装')
  }

  return { binary, model }
}

async function runWhisperToResult(
  binary: string,
  model: string,
  wav: string,
  outBase: string,
  signal: AbortSignal | undefined,
  onProgress: (progress: TimelineTranscribeProgress) => void
): Promise<TimelineTranscribeResult> {
  onProgress({ stage: 'transcribing', percent: 0 })
  await runWhisper(binary, model, wav, outBase, signal, onProgress)

  const raw = await fs.readFile(`${outBase}.json`, 'utf8')
  const data = JSON.parse(raw) as WhisperJson
  const segments: TimelineTranscribeSegment[] = []

  for (const item of data.transcription ?? []) {
    const text = (item.text ?? '').trim()
    if (!text) continue
    const { startMs, endMs } = segmentRange(item)
    segments.push({ startMs, durationMs: endMs - startMs, text })
  }

  return { segments, language: data.result?.language }
}

async function makeTempPaths(): Promise<{
  dir: string
  wav: string
  outBase: string
}> {
  const dir = join(app.getPath('temp'), `cinelab-transcribe-${randomUUID()}`)
  await fs.mkdir(dir, { recursive: true })
  return { dir, wav: join(dir, 'audio.wav'), outBase: join(dir, 'result') }
}

export async function transcribeClip(
  request: Extract<TimelineTranscribeRequest, { mode: 'clip' }>,
  onProgress: (progress: TimelineTranscribeProgress) => void,
  signal?: AbortSignal
): Promise<TimelineTranscribeResult> {
  const root =
    request.scope === 'global'
      ? await getLibraryRoot()
      : getCurrentProjectRoot()
  if (!root) throw new Error('没有打开的项目')

  const absolute = resolveInside(root, request.path)
  const probe = await probeMedia(absolute)
  if (!probe.hasAudio) throw new Error('选中的片段没有音轨')

  const { binary, model } = await resolveWhisper()
  if (signal?.aborted) throw new Error('已取消')

  const temp = await makeTempPaths()

  try {
    const speed = Math.max(0.1, Math.min(10, request.speed || 1))
    const sourceDuration = Math.max(1, request.durationMs) / 1000 * speed

    onProgress({ stage: 'extracting', percent: 0 })
    await runFfmpeg(
      [
        '-y',
        '-ss',
        (Math.max(0, request.sourceStartMs) / 1000).toFixed(3),
        '-t',
        sourceDuration.toFixed(3),
        '-i',
        absolute,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        temp.wav
      ],
      { signal }
    )
    onProgress({ stage: 'extracting', percent: 100 })

    return await runWhisperToResult(
      binary,
      model,
      temp.wav,
      temp.outBase,
      signal,
      onProgress
    )
  } finally {
    await fs.rm(temp.dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** 整条时间线转写：混合所有音轨后交给 whisper，时间戳直接对应时间线 */
export async function transcribeTimeline(
  doc: TimelineDoc,
  onProgress: (progress: TimelineTranscribeProgress) => void,
  signal?: AbortSignal
): Promise<TimelineTranscribeResult> {
  const root = getCurrentProjectRoot()
  if (!root) throw new Error('没有打开的项目')

  const inputs = await collectAudioInputs(root, doc)
  if (inputs.length === 0) throw new Error('时间线上没有可转写的音频')

  const { binary, model } = await resolveWhisper()
  if (signal?.aborted) throw new Error('已取消')

  const temp = await makeTempPaths()

  try {
    const plan = buildAudioFilters(doc, inputs, 0)
    if (!plan.outputLabel) throw new Error('时间线上没有可转写的音频')

    const args = ['-y']
    for (const item of inputs) args.push('-i', item.path)
    args.push(
      '-filter_complex',
      plan.filters.join(';'),
      '-map',
      plan.outputLabel,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      '-t',
      (Math.max(1, docDurationMs(doc)) / 1000).toFixed(3),
      temp.wav
    )

    onProgress({ stage: 'extracting', percent: 0 })
    await runFfmpeg(args, { signal })
    onProgress({ stage: 'extracting', percent: 100 })

    return await runWhisperToResult(
      binary,
      model,
      temp.wav,
      temp.outBase,
      signal,
      onProgress
    )
  } finally {
    await fs.rm(temp.dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function transcribe(
  request: TimelineTranscribeRequest,
  onProgress: (progress: TimelineTranscribeProgress) => void,
  signal?: AbortSignal
): Promise<TimelineTranscribeResult> {
  return request.mode === 'timeline'
    ? transcribeTimeline(request.doc, onProgress, signal)
    : transcribeClip(request, onProgress, signal)
}
