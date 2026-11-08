import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { runFfmpeg } from './ffmpeg'
import { resolveMediaPath } from './paths'

const pending = new Map<string, Promise<string | null>>()

/**
 * 540p 预览代理，按源文件大小和修改时间做缓存键。
 * 返回项目内相对路径，可直接走 cinelab-asset://。
 */
export async function ensureProxy(
  projectRoot: string,
  path: string
): Promise<string | null> {
  const key = `${projectRoot}|${path}`
  const existing = pending.get(key)
  if (existing) return existing

  const task = (async (): Promise<string | null> => {
    try {
      const absolute = await resolveMediaPath(projectRoot, path)
      const stat = await fs.stat(absolute)
      const hash = createHash('sha256')
        .update(`${absolute}|${stat.size}|${stat.mtimeMs}`)
        .digest('hex')
        .slice(0, 24)

      const dir = join(projectRoot, '.cache', 'proxy')
      const target = join(dir, `${hash}.mp4`)
      const relative = `.cache/proxy/${hash}.mp4`

      try {
        await fs.access(target)
        return relative
      } catch {
        // 需要生成
      }

      await fs.mkdir(dir, { recursive: true })
      await runFfmpeg([
        '-y',
        '-i',
        absolute,
        '-vf',
        'scale=-2:540',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '28',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-movflags',
        '+faststart',
        target
      ])
      return relative
    } catch {
      return null
    } finally {
      pending.delete(key)
    }
  })()

  pending.set(key, task)
  return task
}
