import { createWriteStream, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractZipSafely,
  isSafeZipEntryName,
  isSymlinkEntry
} from '../zip-extract'

const roots: string[] = []

async function makeTemp(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
    )
  )
})

async function writeZip(
  zipPath: string,
  entries: Array<{ name: string; content?: string }>
): Promise<void> {
  const zip = new yazl.ZipFile()
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.content ?? ''), entry.name)
  }
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(zipPath))
}

describe('isSafeZipEntryName', () => {
  it('accepts normal relative paths', () => {
    expect(isSafeZipEntryName('dir/file.txt')).toBe(true)
    expect(isSafeZipEntryName('file.txt')).toBe(true)
    expect(isSafeZipEntryName('a\\b\\c.txt')).toBe(true)
  })

  it('rejects traversal and absolute paths', () => {
    expect(isSafeZipEntryName('../escape.txt')).toBe(false)
    expect(isSafeZipEntryName('a/../../escape.txt')).toBe(false)
    expect(isSafeZipEntryName('a\\..\\escape.txt')).toBe(false)
    expect(isSafeZipEntryName('/etc/passwd')).toBe(false)
    expect(isSafeZipEntryName('C:\\Windows\\system.ini')).toBe(false)
    expect(isSafeZipEntryName('')).toBe(false)
    expect(isSafeZipEntryName('a\0b')).toBe(false)
  })
})

describe('isSymlinkEntry', () => {
  it('detects symlink mode bits', () => {
    expect(isSymlinkEntry((0o120777 << 16) >>> 0)).toBe(true)
    expect(isSymlinkEntry((0o100644 << 16) >>> 0)).toBe(false)
    expect(isSymlinkEntry(0)).toBe(false)
  })
})

describe('extractZipSafely', () => {
  it('extracts normal files', async () => {
    const root = await makeTemp('cinelab-zip-')
    const zipPath = join(root, 'test.zip')
    const output = join(root, 'out')

    await writeZip(zipPath, [
      { name: 'dir/hello.txt', content: 'hello' },
      { name: 'root.txt', content: 'root' }
    ])

    await extractZipSafely(zipPath, output)

    expect(await fs.readFile(join(output, 'dir', 'hello.txt'), 'utf8')).toBe(
      'hello'
    )
    expect(await fs.readFile(join(output, 'root.txt'), 'utf8')).toBe('root')
  })

  it('enforces the file-count limit', async () => {
    const root = await makeTemp('cinelab-zip-')
    const zipPath = join(root, 'test.zip')
    const output = join(root, 'out')

    await writeZip(zipPath, [
      { name: 'a.txt', content: 'a' },
      { name: 'b.txt', content: 'b' }
    ])

    await expect(
      extractZipSafely(zipPath, output, { maxFiles: 1 })
    ).rejects.toThrow('文件数量超过限制')
  })

  it('enforces the total-size limit', async () => {
    const root = await makeTemp('cinelab-zip-')
    const zipPath = join(root, 'test.zip')
    const output = join(root, 'out')

    await writeZip(zipPath, [{ name: 'big.txt', content: '0123456789' }])

    await expect(
      extractZipSafely(zipPath, output, { maxTotalBytes: 5 })
    ).rejects.toThrow('体积超过限制')
  })
})
