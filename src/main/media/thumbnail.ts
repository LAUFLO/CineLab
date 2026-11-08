import { app } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { probeMedia, runFfmpeg } from './ffmpeg'
import { resolveMediaPath } from './paths'

const memory = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()
const queue: (() => void)[] = []
const MAX_CONCURRENT = 2
let running = 0

function cacheDir(): string {
  return join(app.getPath('userData'), 'thumb-cache')
}

function cacheKey(
  projectRoot: string,
  path: string,
  atSeconds: number,
  kind: 'video' | 'audio'
): string {
  return createHash('sha256')
    .update(`${projectRoot}|${path}|${atSeconds}|${kind}`)
    .digest('hex')
    .slice(0, 32)
}

function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    queue.push(() => {
      running++
      resolve()
    })
  })
}

function release(): void {
  running--
  const next = queue.shift()
  if (next) next()
}

async function toDataUrl(file: string): Promise<string> {
  const data = await fs.readFile(file)
  return `data:image/png;base64,${data.toString('base64')}`
}

/**
 * 视频首帧或音频波形缩略图。
 * 磁盘缓存 + 内存缓存 + 最多 2 个 ffmpeg 并发。
 */
export async function mediaThumbnail(
  projectRoot: string,
  path: string,
  atSeconds = 0.1,
  kind: 'video' | 'audio' = 'video'
): Promise<string | null> {
  const key = cacheKey(projectRoot, path, atSeconds, kind)
  const memoryHit = memory.get(key)
  if (memoryHit) return memoryHit

  const cachedFile = join(cacheDir(), `${key}.png`)
  try {
    const url = await toDataUrl(cachedFile)
    memory.set(key, url)
    return url
  } catch {
    // 缓存未命中
  }

  const inFlight = pending.get(key)
  if (inFlight) return inFlight

  const task = (async (): Promise<string | null> => {
    await acquire()
    try {
      const absolute = await resolveMediaPath(projectRoot, path)
      const out = join(app.getPath('temp'), `cinelab-thumb-${key}.png`)
      await fs.mkdir(cacheDir(), { recursive: true })

      if (kind === 'audio') {
        await runFfmpeg([
          '-y',
          '-i',
          absolute,
          '-filter_complex',
          'showwavespic=s=320x90:colors=#8b8b90',
          '-frames:v',
          '1',
          '-update',
          '1',
          out
        ])
      } else {
        let at = Math.max(0, atSeconds)
        try {
          const probe = await probeMedia(absolute)
          if (probe.duration && probe.duration > 1) {
            // 避开开头的黑场，取片头 10%，最多 2 秒
            at = Math.min(probe.duration * 0.1, 2)
          }
        } catch {
          // 探测失败时沿用传入时间点
        }
        await runFfmpeg([
          '-y',
          '-ss',
          at.toFixed(2),
          '-i',
          absolute,
          '-frames:v',
          '1',
          '-vf',
          'scale=320:-1',
          '-q:v',
          '4',
          '-update',
          '1',
          out
        ])
      }

      const url = await toDataUrl(out)
      await fs.copyFile(out, cachedFile).catch(() => undefined)
      memory.set(key, url)
      await fs.rm(out, { force: true }).catch(() => undefined)
      return url
    } catch {
      return null
    } finally {
      release()
      pending.delete(key)
    }
  })()

  pending.set(key, task)
  return task
}
