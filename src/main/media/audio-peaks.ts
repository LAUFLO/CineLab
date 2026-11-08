import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import type { AudioPeaksRequest } from '@shared/media'
import { ffmpegBinary } from './ffmpeg'
import { resolveMediaPath } from './paths'

const DEFAULT_BUCKETS = 96
const MAX_BUCKETS = 256
const SAMPLE_RATE = 4000
const MAX_BUFFER_BYTES = 64 * 1024 * 1024
const cache = new Map<string, Promise<number[]>>()

function decodePcm(absolute: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegBinary(),
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        absolute,
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        's16le',
        'pipe:1'
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )

    const chunks: Buffer[] = []
    let size = 0
    let stderr = ''
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const finish = (error?: Error, data?: Buffer): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (error) reject(error)
      else resolve(data ?? Buffer.concat(chunks))
    }

    timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(new Error('音频波形解析超时'))
    }, 30_000)

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BUFFER_BYTES) {
        child.kill('SIGKILL')
        finish(new Error('音频文件过大，无法解析波形'))
        return
      }
      chunks.push(chunk)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (code === 0) {
        finish(undefined, Buffer.concat(chunks))
        return
      }
      finish(new Error(`音频解码失败（${code}）：${stderr.slice(-500)}`))
    })
  })
}

function toPeaks(pcm: Buffer, buckets: number): number[] {
  const samples = Math.floor(pcm.length / 2)
  if (samples === 0) return Array.from({ length: buckets }, () => 0)

  const peaks: number[] = []
  for (let index = 0; index < buckets; index += 1) {
    const start = Math.floor((index * samples) / buckets)
    const end = Math.max(start + 1, Math.floor(((index + 1) * samples) / buckets))
    let peak = 0

    for (let cursor = start; cursor < end && cursor < samples; cursor += 1) {
      const value = Math.abs(pcm.readInt16LE(cursor * 2))
      if (value > peak) peak = value
    }

    peaks.push(peak)
  }

  const max = Math.max(...peaks, 1)
  return peaks.map((peak) => Math.max(0.02, Math.sqrt(peak / max)))
}

export async function computeAudioPeaks(
  projectRoot: string,
  input: AudioPeaksRequest
): Promise<number[]> {
  const buckets = Math.max(
    16,
    Math.min(MAX_BUCKETS, Math.floor(input.buckets ?? DEFAULT_BUCKETS))
  )
  const absolute = await resolveMediaPath(projectRoot, input.path, input.scope)
  const stat = await fs.stat(absolute)
  const key = `${absolute}:${stat.mtimeMs}:${stat.size}:${buckets}`

  const cached = cache.get(key)
  if (cached) return cached

  const task = decodePcm(absolute)
    .then((pcm) => toPeaks(pcm, buckets))
    .catch((error) => {
      cache.delete(key)
      throw error
    })

  cache.set(key, task)
  return task
}
