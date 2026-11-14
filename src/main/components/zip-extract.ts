import { createWriteStream, promises as fs } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import yauzl from 'yauzl'

export interface ZipLimits {
  maxFiles?: number
  maxTotalBytes?: number
}

const DEFAULT_MAX_FILES = 100_000
const DEFAULT_MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024

/**
 * Reject absolute paths, drive-letter paths and parent traversal before an
 * entry is written. Zip entries always use forward slashes, but backslashes
 * are normalized because Windows tools sometimes emit them.
 */
export function isSafeZipEntryName(name: string): boolean {
  if (!name || name.includes('\0')) return false

  const normalized = name.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return false
  }

  return normalized.split('/').every((segment) => segment !== '..')
}

export function isSymlinkEntry(externalFileAttributes: number): boolean {
  return ((externalFileAttributes >>> 16) & 0o170000) === 0o120000
}

function isDirectoryEntry(
  entry: yauzl.Entry,
  normalizedName: string
): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000
  return normalizedName.endsWith('/') || mode === 0o040000
}

export async function extractZipSafely(
  zipPath: string,
  destination: string,
  limits: ZipLimits = {}
): Promise<void> {
  const maxFiles = limits.maxFiles ?? DEFAULT_MAX_FILES
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  const zip = await openZip(zipPath)

  let files = 0
  let totalBytes = 0

  await new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false

    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      zip.close()
      rejectPromise(error instanceof Error ? error : new Error(String(error)))
    }

    zip.on('error', fail)
    zip.on('end', () => {
      if (settled) return
      settled = true
      resolvePromise()
    })

    zip.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        const name = entry.fileName.replace(/\\/g, '/')

        if (!isSafeZipEntryName(name)) {
          throw new Error(`压缩包包含不安全路径：${entry.fileName}`)
        }
        if (isSymlinkEntry(entry.externalFileAttributes)) {
          throw new Error(`压缩包包含符号链接：${entry.fileName}`)
        }

        const target = resolve(destination, name)
        if (!isInside(destination, target)) {
          throw new Error(`压缩包路径越界：${entry.fileName}`)
        }

        if (isDirectoryEntry(entry, name)) {
          await fs.mkdir(target, { recursive: true })
          zip.readEntry()
          return
        }

        files += 1
        if (files > maxFiles) {
          throw new Error('压缩包文件数量超过限制')
        }

        totalBytes += entry.uncompressedSize
        if (totalBytes > maxTotalBytes) {
          throw new Error('压缩包解压后体积超过限制')
        }

        await fs.mkdir(dirname(target), { recursive: true })
        const stream = await openEntryStream(zip, entry)
        await pipeline(stream, createWriteStream(target))
        const mode = (entry.externalFileAttributes >>> 16) & 0o777
        if (process.platform !== 'win32' && mode) {
          await fs.chmod(target, mode)
        }
        zip.readEntry()
      })().catch(fail)
    })

    zip.readEntry()
  })
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true, autoClose: false },
      (error, zip) => {
        if (error) {
          rejectPromise(error)
        } else if (!zip) {
          rejectPromise(new Error('无法读取压缩包'))
        } else {
          resolvePromise(zip)
        }
      }
    )
  })
}

function openEntryStream(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry
): Promise<Readable> {
  return new Promise((resolvePromise, rejectPromise) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) {
        rejectPromise(error)
      } else if (!stream) {
        rejectPromise(new Error('无法读取压缩包条目'))
      } else {
        resolvePromise(stream)
      }
    })
  })
}

function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
