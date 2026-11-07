import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ThumbCacheInfo } from '@shared/library-schema'
import { getLibraryRoot } from './config'

async function thumbsDir(): Promise<string> {
  return join(await getLibraryRoot(), '.thumbs')
}

export async function getThumbCacheInfo(): Promise<ThumbCacheInfo> {
  const dir = await thumbsDir()
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    let bytes = 0
    let files = 0

    for (const entry of entries) {
      if (!entry.isFile()) continue
      try {
        const info = await fs.stat(join(dir, entry.name))
        bytes += info.size
        files += 1
      } catch {
        // 文件在扫描过程中被删除，跳过
      }
    }

    return { bytes, files }
  } catch {
    return { bytes: 0, files: 0 }
  }
}

export async function clearThumbCache(): Promise<ThumbCacheInfo> {
  const info = await getThumbCacheInfo()
  await fs.rm(await thumbsDir(), { recursive: true, force: true })
  return info
}

export async function cleanupThumbCache(
  days: number
): Promise<{ removed: number; bytes: number }> {
  if (days <= 0) return { removed: 0, bytes: 0 }

  const dir = await thumbsDir()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  let removed = 0
  let bytes = 0

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const target = join(dir, entry.name)
      try {
        const info = await fs.stat(target)
        if (info.mtimeMs >= cutoff) continue
        bytes += info.size
        await fs.unlink(target)
        removed += 1
      } catch {
        // 忽略单个文件的清理失败
      }
    }
  } catch {
    // 缓存目录不存在时无需清理
  }

  return { removed, bytes }
}
