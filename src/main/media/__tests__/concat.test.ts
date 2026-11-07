import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    isPackaged: false
  }
}))

const libraryRoot = join(tmpdir(), `cinelab-concat-test-${process.pid}`)

vi.mock('../../library/config', () => ({
  getLibraryRoot: async () => libraryRoot
}))

import { concatVideos } from '../concat'

const ffmpeg = ffmpegPath ?? ''
const ffprobe = ffprobeStatic.path

function run(args: string[]): void {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr?.slice(-800) || 'ffmpeg failed')
  }
}

function probe(path: string): {
  duration: number
  hasAudio: boolean
} {
  const result = spawnSync(
    ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path],
    { encoding: 'utf8' }
  )
  const data = JSON.parse(result.stdout || '{}') as {
    streams?: Array<{ codec_type?: string }>
    format?: { duration?: string }
  }
  return {
    duration: Number(data.format?.duration ?? 0),
    hasAudio: (data.streams ?? []).some((stream) => stream.codec_type === 'audio')
  }
}

beforeAll(async () => {
  await fs.mkdir(libraryRoot, { recursive: true })
  run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x180:d=1',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    join(libraryRoot, 'a.mp4')
  ])
  run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x180:d=1',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:duration=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    join(libraryRoot, 'b.mp4')
  ])
  run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=220:duration=3',
    join(libraryRoot, 'bgm.wav')
  ])
  run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:duration=2',
    join(libraryRoot, 'voice.wav')
  ])
})

afterAll(async () => {
  await fs.rm(libraryRoot, { recursive: true, force: true })
})

describe('concatVideos', () => {
  it('mixes original audio, bgm and narration with independent volumes', async () => {
    const output = join(libraryRoot, 'mixed.mp4')
    await concatVideos(['a.mp4', 'b.mp4'], output, {
      resolution: '720p',
      quality: 'standard',
      bgmPath: join(libraryRoot, 'bgm.wav'),
      narrationPath: join(libraryRoot, 'voice.wav'),
      originalVolume: 1,
      bgmVolume: 0.2,
      narrationVolume: 0.8
    })

    const info = probe(output)
    expect(info.hasAudio).toBe(true)
    expect(info.duration).toBeGreaterThan(1.8)
    expect(info.duration).toBeLessThan(2.5)
  }, 120_000)
})
